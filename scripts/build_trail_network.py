#!/usr/bin/env python3
"""
build_trail_network.py — Builds the trail topology graph from GPX trackpoints.

Output: src/data/trail_network.json
  nodes     — all route endpoints + junction midpoints
  edges     — route segments between consecutive nodes
  node_edges — node → incident edges index

Run: python scripts/build_trail_network.py
"""

import json, hashlib, math, sys
from pathlib import Path

# Auto-detect data dir: macOS (simongraf) vs Linux (openclaw)
if Path('/Users/simongraf/projects/bike-routes/data/ww-info').exists():
    DATA_DIR = Path('/Users/simongraf/projects/bike-routes/data/ww-info')
elif Path('/home/openclaw/bike-routes/data/ww-info').exists():
    DATA_DIR = Path('/home/openclaw/bike-routes/data/ww-info')
else:
    raise RuntimeError(f'Data directory not found')
OUTPUT_DIR = Path(__file__).parent.parent / "src" / "data"
ROUTES_DIR = DATA_DIR / "routes"
GPX_DIR = DATA_DIR / "gpx-enriched"

GRID_DEG = 0.001          # ≈ 80m at Wienerwald latitude — spatial index cell size
JUNCTION_THRESHOLD_M = 8  # two routes are "connected" if their points are within 8m
NODE_DEDUP_M = 5          # merge nodes within 5m
MIN_EDGE_M = 50           # discard edges shorter than 50m (junction noise)

# Haversine in meters
def haversine_m(lon1, lat1, lon2, lat2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def md5_8(s):
    return hashlib.md5(s.encode()).hexdigest()[:8]


def parse_gpx(gpx_path):
    """Parse GPX file → list of (lon, lat, elev_or_None)."""
    import re
    points = []
    with open(gpx_path, 'r', encoding='utf-8') as f:
        content = f.read()
    content_no_ns = re.sub(r'xmlns="[^"]+"', '', content)
    content_no_ns = re.sub(r'xmlns:[a-zA-Z]+="[^"]+"', '', content_no_ns)
    trkpt_pattern = re.compile(
        r'<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>(.*?)</trkpt>', re.DOTALL)
    ele_pattern = re.compile(r'<ele>([^<]+)</ele>')
    for m in trkpt_pattern.finditer(content_no_ns):
        lat = float(m.group(1))
        lon = float(m.group(2))
        ele_m = ele_pattern.search(m.group(3))
        elev = float(ele_m.group(1)) if ele_m else None
        points.append((lon, lat, elev))
    return points


def build_spatial_index(route_trackpoints):
    """Grid spatial index: cell → list of route slugs whose bboxes overlap the cell.
    Same grid size as build_routes.py (GRID_DEG = 0.001°).
    """
    grid = {}
    slug_to_cells = {}
    for slug, pts in route_trackpoints.items():
        if not pts:
            continue
        lons = [p[0] for p in pts]
        lats = [p[1] for p in pts]
        min_lon, max_lon = min(lons), max(lons)
        min_lat, max_lat = min(lats), max(lats)
        cx_min = int(min_lon / GRID_DEG)
        cx_max = int(max_lon / GRID_DEG)
        cy_min = int(min_lat / GRID_DEG)
        cy_max = int(max_lat / GRID_DEG)
        cells = set()
        for cx in range(cx_min, cx_max + 1):
            for cy in range(cy_min, cy_max + 1):
                grid.setdefault((cx, cy), []).append(slug)
                cells.add((cx, cy))
        slug_to_cells[slug] = cells
    return grid, slug_to_cells


def snap_point_to_grid(pt):
    """Return grid cell for a point."""
    return (int(pt[0] / GRID_DEG), int(pt[1] / GRID_DEG))


def nearest_node_on_edge(lng, lat, edge_geometry):
    """Project (lng, lat) onto the polyline edge_geometry, return nearest endpoint."""
    best_dist = float('inf')
    best_node = None
    for pt in [edge_geometry[0], edge_geometry[-1]]:
        d = haversine_m(lng, lat, pt[0], pt[1])
        if d < best_dist:
            best_dist = d
            best_node = pt
    return best_node, best_dist


def main():
    print("=== TrailKit Trail Network Builder ===")
    print(f"Reading from: {DATA_DIR}")

    # Step 1: Load route metadata + GPX trackpoints
    routes_out = {}   # slug → route dict (for is_loop, geometry)
    trackpoints = {}  # slug → [(lon, lat, ele_or_None)]

    for json_file in sorted(ROUTES_DIR.glob("*.json")):
        with open(json_file, 'r', encoding='utf-8') as f:
            d = json.load(f)
        slug = d.get('slug')
        if not slug:
            continue
        gpx_enriched_file = d.get('gpx_enriched_file')
        gpx_path = GPX_DIR / gpx_enriched_file
        if not gpx_path.exists():
            continue
        pts = parse_gpx(gpx_path)
        trackpoints[slug] = pts
        routes_out[slug] = {
            'is_loop': d.get('is_loop', False),
            'title': d.get('title', slug),
        }

    print(f"  Loaded {len(trackpoints)} routes with trackpoints")

    # Step 2: Build spatial index
    print("  Building spatial index...")
    grid, slug_to_cells = build_spatial_index(trackpoints)
    print(f"  {len(grid)} grid cells")

    # Step 3: Find junctions — pair routes whose bboxes overlap, check 8m threshold
    print("  Finding junctions (8m threshold)...")
    junctions = []  # list of (midpoint_lon, midpoint_lat)

    slugs = list(trackpoints.keys())
    checked = set()

    for i, slug_a in enumerate(slugs):
        pts_a = trackpoints[slug_a]
        if not pts_a:
            continue

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

            # Fine check: find any pair of points within JUNCTION_THRESHOLD_M
            found_junction = False
            for pt_a in pts_a:
                for pt_b in pts_b:
                    d = haversine_m(pt_a[0], pt_a[1], pt_b[0], pt_b[1])
                    if d <= JUNCTION_THRESHOLD_M:
                        mid_lon = (pt_a[0] + pt_b[0]) / 2
                        mid_lat = (pt_a[1] + pt_b[1]) / 2
                        junctions.append((mid_lon, mid_lat))
                        found_junction = True
                        break
                if found_junction:
                    break

    print(f"  Found {len(junctions)} raw junction points")

    # Step 4: Build nodes
    print("  Building nodes...")

    # All route endpoints
    node_coords = {}  # coord_key → (lon, lat)
    for slug, pts in trackpoints.items():
        if not pts:
            continue
        node_coords[(pts[0][0], pts[0][1])] = None   # start
        node_coords[(pts[-1][0], pts[-1][1])] = None  # end

    # Junction midpoints — deduplicate within NODE_DEDUP_M
    def nearby_node(lon, lat, existing, threshold_m):
        for (nx, ny) in existing:
            if haversine_m(lon, lat, nx, ny) <= threshold_m:
                return (nx, ny)
        return None

    for jlon, jlat in junctions:
        existing = list(node_coords.keys())
        match = nearby_node(jlon, jlat, existing, NODE_DEDUP_M)
        if match is None:
            node_coords[(round(jlon, 6), round(jlat, 6))] = None

    # Assign IDs and store
    nodes = {}
    for (lon, lat) in node_coords:
        nid = f"n_{md5_8(f'{lon:.6f},{lat:.6f}')}"
        nodes[nid] = {"coords": [lon, lat]}

    print(f"  {len(nodes)} nodes total")

    # Step 5: Split routes into edges
    print("  Splitting routes into edges...")

    # Build node coord → node id lookup for fast snapping
    coord_to_node = {}
    for nid, ndata in nodes.items():
        coord_to_node[(round(ndata['coords'][0], 6), round(ndata['coords'][1], 6))] = nid

    def snap_to_node(lon, lat, nodes, threshold_m=NODE_DEDUP_M):
        """Return node id closest to (lon, lat) within threshold, or None."""
        best_nid = None
        best_dist = float('inf')
        for nid, ndata in nodes.items():
            d = haversine_m(lon, lat, ndata['coords'][0], ndata['coords'][1])
            if d < best_dist:
                best_dist = d
                best_nid = nid
        if best_dist <= threshold_m:
            return best_nid
        return None

    edges = {}
    total_distance_km = 0.0
    isolated_routes = []
    zero_edge_routes = []

    for slug, pts in trackpoints.items():
        if not pts:
            continue

        route_edges = []  # [(from_node_id, to_node_id, segment_pts)]
        current_edge_start = None
        current_edge_pts = []

        for i, pt in enumerate(pts):
            # Check if this point is near any node (within JUNCTION_THRESHOLD_M)
            node_id = snap_to_node(pt[0], pt[1], nodes, JUNCTION_THRESHOLD_M)

            if node_id is None:
                current_edge_pts.append(pt)
                continue

            # We hit a node — close the current edge if we have points
            if current_edge_pts or current_edge_start is None:
                from_nid = current_edge_start if current_edge_start else snap_to_node(pts[0][0], pts[0][1], nodes, NODE_DEDUP_M)
                if from_nid and from_nid != node_id:
                    # Filter out trivial edges (< MIN_EDGE_M)
                    seg_dist = 0.0
                    for j in range(1, len(current_edge_pts)):
                        seg_dist += haversine_m(
                            current_edge_pts[j-1][0], current_edge_pts[j-1][1],
                            current_edge_pts[j][0], current_edge_pts[j][1])
                    if seg_dist >= MIN_EDGE_M:
                        eid = f"e_{md5_8(from_nid + node_id + slug)}"
                        edges[eid] = {
                            "from": from_nid,
                            "to": node_id,
                            "source_route_id": slug,
                            "geometry": [[p[0], p[1], p[2]] if len(p) >= 3 and p[2] is not None else [p[0], p[1]] for p in current_edge_pts],
                            "distance_m": int(seg_dist),
                            "bidirectional": routes_out[slug]['is_loop'],
                        }
                        # Compute ele gain/loss
                        ele_gain = 0
                        ele_loss = 0
                        for j in range(1, len(current_edge_pts)):
                            e_prev = current_edge_pts[j-1][2]
                            e_cur = current_edge_pts[j][2]
                            if e_prev is not None and e_cur is not None:
                                delta = e_cur - e_prev
                                if delta > 0:
                                    ele_gain += delta
                                else:
                                    ele_loss += abs(delta)
                        edges[eid]["ele_gain_m"] = int(ele_gain)
                        edges[eid]["ele_loss_m"] = int(ele_loss)
                        route_edges.append(eid)
                        total_distance_km += seg_dist / 1000.0

                current_edge_pts = []
                current_edge_start = node_id
            else:
                current_edge_pts.append(pt)

        if not route_edges:
            zero_edge_routes.append(slug)

    print(f"  {len(edges)} edges total")
    print(f"  Total graph distance: {total_distance_km:.1f} km")
    print(f"  Routes with 0 edges: {len(zero_edge_routes)}")
    if zero_edge_routes:
        for slug in zero_edge_routes[:5]:
            print(f"    - {slug}")

    # Step 6: Build node→edges index
    print("  Building node→edges index...")
    node_edges = {nid: [] for nid in nodes}
    for eid, edata in edges.items():
        node_edges[edata['from']].append(eid)
        node_edges[edata['to']].append(eid)

    avg_edges_per_node = sum(len(v) for v in node_edges.values()) / len(node_edges) if node_edges else 0
    print(f"  Avg edges per node: {avg_edges_per_node:.1f}")

    # Print stats
    print("\n=== Build Stats ===")
    print(f"  Nodes:     {len(nodes)}")
    print(f"  Edges:     {len(edges)}")
    print(f"  Avg node degree: {avg_edges_per_node:.1f}")
    print(f"  Total graph km: {total_distance_km:.1f}")
    print(f"  Isolated routes: {len(zero_edge_routes)}")

    # Write output
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / "trail_network.json"
    output = {
        "nodes": nodes,
        "edges": edges,
        "node_edges": node_edges,
    }
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    size_mb = out_path.stat().st_size / 1024 / 1024
    print(f"\n  → {out_path} ({size_mb:.1f} MB)")
    print("\n=== Done ===")


if __name__ == '__main__':
    main()
