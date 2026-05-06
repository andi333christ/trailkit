#!/usr/bin/env python3
"""
build_routes.py — Converts scraped Wienerwald route data into the app's data bundle.

Input: ~/bike-routes/data/ww-info/
  routes/*.json          — one JSON per route (scraper output)
  gpx-enriched/*.gpx     — enriched GPX with full trackpoints per route

Output: src/data/
  routes.json           — all metadata + GeoJSON geometries
  connectivity.json     — which routes connect to which (full trackpoint proximity)

Run: python scripts/build_routes.py
"""

import json, os, re, sys
from pathlib import Path
from math import isnan

# gpxpy is optional; install with: pip install gpxpy
try:
    import gpxpy
    HAS_GPXPY = True
except ImportError:
    HAS_GPXPY = False

DATA_DIR = Path('/Users/simongraf/projects/bike-routes/data/ww-info')
OUTPUT_DIR = Path(__file__).parent.parent / "src" / "data"
ROUTES_DIR = DATA_DIR / "routes"
GPX_DIR = DATA_DIR / "gpx-enriched"
CONNECTIVITY_THRESHOLD_M = 100  # meters — routes within this distance connect
GRID_DEG = 0.05  # spatial index cell size in degrees


def parse_duration(duration_str):
    """Parse '1:05 h' or '45 min' → integer minutes."""
    if not duration_str:
        return None
    duration_str = str(duration_str).strip()
    # "1:05 h"
    m = re.match(r'^(\d+):(\d+)\s*h?$', duration_str)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2))
    # "45 min"
    m = re.match(r'^(\d+)\s*min$', duration_str, re.IGNORECASE)
    if m:
        return int(m.group(1))
    return None


def parse_date_german(date_str):
    """Parse 'DD.MM.YYYY' → 'YYYY-MM-DD'."""
    if not date_str:
        return None
    m = re.match(r'^(\d{2})\.(\d{2})\.(\d{4})$', str(date_str).strip())
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return None


def haversine_m(lon1, lat1, lon2, lat2):
    """Approximate great-circle distance in meters between two points."""
    import math
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def simplify_coords(coords, tolerance=0.0002):
    """Douglas-Peucker simplification for coordinate list [[lon,lat],...].
    
    tolerance in degrees; 0.0002° ≈ 20m at Wienerwald latitude.
    Returns simplified list.
    """
    if len(coords) <= 2:
        return coords

    def perp_dist(p, a, b):
        """Perpendicular distance from point p to segment ab."""
        import math
        ax, ay = a[0], a[1]
        bx, by = b[0], b[1]
        px, py = p[0], p[1]
        dx, dy = bx - ax, by - ay
        length_sq = dx*dx + dy*dy
        if length_sq == 0:
            return math.sqrt((px-ax)**2 + (py-ay)**2)
        t = max(0, min(1, ((px-ax)*dx + (py-ay)*dy) / length_sq))
        projx, projy = ax + t*dx, ay + t*dy
        return math.sqrt((px-projx)**2 + (py-projy)**2)

    def douglas_peucker(pts, tol):
        if len(pts) <= 2:
            return pts
        max_d, idx = 0, 0
        for i in range(1, len(pts)-1):
            d = perp_dist(pts[i], pts[0], pts[-1])
            if d > max_d:
                max_d, idx = d, i
        if max_d > tol:
            left = douglas_peucker(pts[:idx+1], tol)
            right = douglas_peucker(pts[idx:], tol)
            return left[:-1] + right
        return [pts[0], pts[-1]]

    return douglas_peucker(list(coords), tolerance)


def parse_gpx(gpx_path):
    """Parse GPX file → list of (lon, lat) trackpoints, or (lon, lat, elev)."""
    points = []
    with open(gpx_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Strip XML namespace to simplify xpath
    content_no_ns = re.sub(r'xmlns="[^"]+"', '', content)
    content_no_ns = re.sub(r'xmlns:[a-zA-Z]+="[^"]+"', '', content_no_ns)
    
    # Parse trackpoints with regex as fallback
    # <trkpt lat="48.123" lon="16.045">
    trkpt_pattern = re.compile(r'<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>(.*?)</trkpt>', re.DOTALL)
    ele_pattern = re.compile(r'<ele>([^<]+)</ele>')
    
    for m in trkpt_pattern.finditer(content_no_ns):
        lat = float(m.group(1))
        lon = float(m.group(2))
        ele_m = ele_pattern.search(m.group(3))
        elev = float(ele_m.group(1)) if ele_m else None
        points.append((lon, lat, elev))
    
    return points


def load_all_trackpoints():
    """Load all trackpoints from every GPX file.
    
    Returns:
        trackpoints: dict[slug, list of (lon, lat, elev or None)]
        slug_to_gpx: dict[slug, Path]
    """
    trackpoints = {}
    slug_to_gpx = {}
    
    for json_file in sorted(ROUTES_DIR.glob("*.json")):
        with open(json_file, 'r', encoding='utf-8') as f:
            route_data = json.load(f)
        
        slug = route_data.get('slug')
        gpx_enriched_file = route_data.get('gpx_enriched_file')
        
        if not slug or not gpx_enriched_file:
            continue
        
        gpx_path = GPX_DIR / gpx_enriched_file
        if not gpx_path.exists():
            print(f"  WARNING: GPX not found: {gpx_path}", file=sys.stderr)
            trackpoints[slug] = []
            continue
        
        pts = parse_gpx(gpx_path)
        trackpoints[slug] = pts
        slug_to_gpx[slug] = gpx_path
    
    return trackpoints, slug_to_gpx


def build_spatial_index(trackpoints):
    """Build a grid-based spatial index.
    
    Returns:
        grid: dict[(cell_x, cell_y), list of slugs whose trackpoints fall in that cell]
        slug_to_cells: dict[slug, set of (cell_x, cell_y)]
    """
    grid = {}
    slug_to_cells = {}
    
    for slug, pts in trackpoints.items():
        cells = set()
        for pt in pts:
            lon, lat = pt[0], pt[1]
            cx = int(lon / GRID_DEG)
            cy = int(lat / GRID_DEG)
            cells.add((cx, cy))
            # Also add neighboring cells for the index lookup
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    grid.setdefault((cx+dx, cy+dy), []).append(slug)
        slug_to_cells[slug] = cells
    
    return grid, slug_to_cells


def compute_connectivity(trackpoints, grid, slug_to_cells):
    """Compute which routes connect using full trackpoint proximity.
    
    Returns dict[slug, list of connecting slugs]
    """
    connectivity = {}
    
    all_slugs = list(trackpoints.keys())
    checked = set()
    
    for i, slug_a in enumerate(all_slugs):
        pts_a = trackpoints.get(slug_a, [])
        if not pts_a:
            continue
        
        connectivity[slug_a] = []
        
        # Get candidate slugs from spatial index
        candidates = set()
        for cell in slug_to_cells.get(slug_a, []):
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    candidates.update(grid.get((cell[0]+dx, cell[1]+dy), []))
        candidates.discard(slug_a)
        
        for slug_b in candidates:
            pair_key = tuple(sorted([slug_a, slug_b]))
            if pair_key in checked:
                continue
            checked.add(pair_key)
            
            pts_b = trackpoints.get(slug_b, [])
            if not pts_b:
                continue
            
            # Fast bbox check first
            lons_a = [p[0] for p in pts_a]
            lats_a = [p[1] for p in pts_a]
            lons_b = [p[0] for p in pts_b]
            lats_b = [p[1] for p in pts_b]
            
            min_lon_a, max_lon_a = min(lons_a), max(lons_a)
            min_lat_a, max_lat_a = min(lats_a), max(lats_a)
            min_lon_b, max_lon_b = min(lons_b), max(lons_b)
            min_lat_b, max_lat_b = min(lats_b), max(lats_b)
            
            # If bboxes are more than 100m apart, skip (rough estimate: 1 deg ≈ 111km)
            if (max_lon_a < min_lon_b - 0.001 or min_lon_a > max_lon_b + 0.001 or
                max_lat_a < min_lat_b - 0.001 or min_lat_a > max_lat_b + 0.001):
                continue
            
            # Fine-grained min-distance check
            min_dist = float('inf')
            for pt_a in pts_a:
                for pt_b in pts_b:
                    d = haversine_m(pt_a[0], pt_a[1], pt_b[0], pt_b[1])
                    if d < min_dist:
                        min_dist = d
                    if min_dist <= CONNECTIVITY_THRESHOLD_M:
                        break
                if min_dist <= CONNECTIVITY_THRESHOLD_M:
                    break
            
            if min_dist <= CONNECTIVITY_THRESHOLD_M:
                connectivity[slug_a].append(slug_b)
                connectivity.setdefault(slug_b, []).append(slug_a)
    
    return connectivity


def main():
    print("=== TrailKit Build Script ===")
    print(f"Reading from: {DATA_DIR}")
    
    # Load all route JSONs
    routes_out = []
    slug_gpx_map = {}  # slug → enriched GPX filename from JSON
    
    for json_file in sorted(ROUTES_DIR.glob("*.json")):
        with open(json_file, 'r', encoding='utf-8') as f:
            d = json.load(f)
        
        slug = d.get('slug')
        if not slug:
            print(f"  SKIP (no slug): {json_file.name}", file=sys.stderr)
            continue
        
        gpx_enriched_file = d.get('gpx_enriched_file')
        slug_gpx_map[slug] = gpx_enriched_file
        
        route = {
            "id": slug,
            "title": d.get('title', ''),
            "type": d.get('type', ''),
            "difficulty": d.get('difficulty', ''),
            "distance_km": d.get('distance_km'),
            "duration_minutes": parse_duration(d.get('duration')),
            "elevation_gain_m": d.get('elevation_gain_m'),
            "elevation_loss_m": d.get('elevation_loss_m'),
            "highest_point_m": d.get('highest_point_m'),
            "lowest_point_m": d.get('lowest_point_m'),
            "start_point": d.get('start_point'),
            "end_point": d.get('end_point'),
            "is_loop": d.get('is_loop', False),
            "has_refreshments": d.get('has_refreshments', False),
            "description": d.get('description', ''),
            "route_description": d.get('route_description', ''),
            "surface": d.get('surface', ''),
            "safety_notes": d.get('safety_notes', ''),
            "equipment": d.get('equipment', ''),
            "tips": d.get('tips'),
            "recommended_months": d.get('recommended_months', []),
            "source_url": d.get('url', ''),
            "image_url": d.get('image_url'),
            "last_modified": parse_date_german(d.get('last_modified')),
            "gpx_enriched_file": gpx_enriched_file,
        }
        routes_out.append(route)
    
    print(f"Parsed {len(routes_out)} routes from JSON")
    
    # Load GPX trackpoints for all routes
    print("Loading GPX trackpoints...")
    trackpoints, slug_to_gpx = load_all_trackpoints()
    
    with_trackpoints = sum(1 for v in trackpoints.values() if v)
    print(f"  {with_trackpoints}/{len(routes_out)} routes have GPX trackpoints")
    
    # Build routes.json with geometry
    print("Building routes.json with geometries...")
    bbox_routes = {}
    
    for route in routes_out:
        slug = route['id']
        pts = trackpoints.get(slug, [])
        
        if pts:
            coords = [[p[0], p[1], p[2]] if len(p) >= 3 and p[2] is not None else [p[0], p[1]] for p in pts]
            coords_simplified = simplify_coords(coords)
            
            route['geometry'] = {
                "type": "LineString",
                "coordinates": coords
            }
            route['geometry_simplified'] = {
                "type": "LineString", 
                "coordinates": coords_simplified
            }
            route['start_coords'] = coords[0]
            route['end_coords'] = coords[-1]
            
            lons = [p[0] for p in pts]
            lats = [p[1] for p in pts]
            route['bbox'] = [min(lons), min(lats), max(lons), max(lats)]
        else:
            route['geometry'] = None
            route['geometry_simplified'] = None
            route['start_coords'] = None
            route['end_coords'] = None
            route['bbox'] = None
        
        bbox_routes[slug] = route['bbox']
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    routes_path = OUTPUT_DIR / "routes.json"
    with open(routes_path, 'w', encoding='utf-8') as f:
        json.dump(routes_out, f, ensure_ascii=False, indent=2)
    routes_size = routes_path.stat().st_size
    print(f"  routes.json: {len(routes_out)} routes, {routes_size/1024/1024:.1f} MB")
    
    # Compute connectivity
    print("Computing connectivity (full trackpoint proximity, 100m threshold)...")
    grid, slug_to_cells = build_spatial_index(trackpoints)
    connectivity = compute_connectivity(trackpoints, grid, slug_to_cells)
    
    # Write connectivity.json
    conn_out = {}
    for slug, connects_to in connectivity.items():
        # Deduplicate and sort
        unique_connects = sorted(set(connects_to))
        conn_out[slug] = {
            "connects_to": unique_connects,
            "start_coords": routes_out[[r['id'] for r in routes_out].index(slug)]['start_coords'] if slug in [r['id'] for r in routes_out] else None,
            "end_coords": routes_out[[r['id'] for r in routes_out].index(slug)]['end_coords'] if slug in [r['id'] for r in routes_out] else None,
        }
    
    conn_path = OUTPUT_DIR / "connectivity.json"
    with open(conn_path, 'w', encoding='utf-8') as f:
        json.dump(conn_out, f, ensure_ascii=False, indent=2)
    conn_size = conn_path.stat().st_size
    print(f"  connectivity.json: {len(conn_out)} routes, {conn_size/1024:.1f} KB")
    
    # Stats
    all_conns = [len(v['connects_to']) for v in conn_out.values()]
    avg_conns = sum(all_conns) / len(all_conns) if all_conns else 0
    isolated = [slug for slug, v in conn_out.items() if len(v['connects_to']) == 0]
    zero_conn_routes = [r for r in routes_out if r['id'] in isolated]
    print(f"\nConnectivity summary:")
    print(f"  Average connections per route: {avg_conns:.1f}")
    print(f"  Isolated routes (0 connections): {len(isolated)}")
    for r in zero_conn_routes:
        print(f"    - {r['id']} ({r['distance_km']} km)")
    
    print("\n=== Done ===")
    print(f"routes.json: {routes_path}")
    print(f"connectivity.json: {conn_path}")


if __name__ == '__main__':
    main()