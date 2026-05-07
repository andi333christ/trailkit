#!/usr/bin/env python3
"""
find_gaps.py  —  Detect routing gaps in the trail network and fill them via OSRM.

Finds trail-endpoint node pairs that are geographically close but poorly
connected in the routing graph, queries the OSRM cycling API for a connecting
route, asks for approval, and saves accepted routes as GPX verbindungsweg files
ready for the next  build_trail_network.py  run.

Usage:
    python scripts/find_gaps.py [--max-gap M] [--min-gap M]

Options:
    --max-gap M    Maximum straight-line gap distance to consider (default 800 m)
    --min-gap M    Minimum gap distance to consider (default 30 m)
"""

import json, math, sys, time, urllib.request, urllib.error, argparse, ssl
from pathlib import Path
from datetime import date
from collections import defaultdict

# macOS ships without bundled CA certs; skip verification for this local utility.
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

if Path('/Users/simongraf/projects/bike-routes/data/ww-info').exists():
    DATA_DIR = Path('/Users/simongraf/projects/bike-routes/data/ww-info')
elif Path('/home/openclaw/bike-routes/data/ww-info').exists():
    DATA_DIR = Path('/home/openclaw/bike-routes/data/ww-info')
else:
    sys.exit('ERROR: data directory not found')

GPX_DIR      = DATA_DIR / 'gpx-enriched'
NETWORK_JSON = Path(__file__).parent.parent / 'src' / 'data' / 'trail_network.json'

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SYNTHETIC       = {'_bridge', '_micro'}   # synthetic edge source_route_ids to ignore
GRID_DEG        = 0.001                   # spatial index cell ≈ 80 m at 48 °N
LAT_M           = 111_320.0              # metres per degree latitude
MAX_REAL_DEG    = 3                       # only consider nodes with ≤ this many real edges
MAX_OSRM_RATIO  = 6.0                    # skip if OSRM route > N× straight-line
MAX_OSRM_M      = 2_000                  # skip if OSRM route longer than this
OSRM_SLEEP_S    = 0.4                    # rate-limit between OSRM requests

OSRM_URL = (
    'https://router.project-osrm.org/route/v1/cycling'
    '/{lon1:.6f},{lat1:.6f};{lon2:.6f},{lat2:.6f}'
    '?overview=full&geometries=geojson'
)

# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def haversine_m(lon1, lat1, lon2, lat2):
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ---------------------------------------------------------------------------
# Graph helpers
# ---------------------------------------------------------------------------

def build_adjacency(edges):
    adj = defaultdict(set)
    for ed in edges.values():
        adj[ed['from']].add(ed['to'])
        adj[ed['to']].add(ed['from'])
    return adj


def connected_components(nodes, adj):
    """Returns {nid: comp_id}."""
    comp_map = {}
    comp_id  = 0
    for start in nodes:
        if start in comp_map:
            continue
        stack = [start]
        while stack:
            cur = stack.pop()
            if cur in comp_map:
                continue
            comp_map[cur] = comp_id
            stack.extend(adj[cur])
        comp_id += 1
    return comp_map


def real_degree(nid, node_edges_idx, edges):
    """Count incident edges that are not synthetic."""
    return sum(
        1 for eid in node_edges_idx.get(nid, [])
        if edges[eid].get('source_route_id', '') not in SYNTHETIC
    )


def node_real_routes(nid, node_edges_idx, edges):
    """Return sorted list of non-synthetic source_route_ids for a node."""
    routes = set()
    for eid in node_edges_idx.get(nid, []):
        src = edges[eid].get('source_route_id', '')
        if src not in SYNTHETIC:
            routes.add(src)
    return sorted(routes)


def direct_edge_pairs(edges):
    """Set of (min_nid, max_nid) pairs that already share a direct edge."""
    pairs = set()
    for ed in edges.values():
        a, b = ed['from'], ed['to']
        pairs.add((min(a, b), max(a, b)))
    return pairs


# ---------------------------------------------------------------------------
# Gap candidate detection
# ---------------------------------------------------------------------------

def find_candidates(nodes, node_edges_idx, edges, comp_map, min_gap, max_gap):
    """
    Find candidate pairs: low-degree trail endpoint nodes within [min_gap, max_gap]
    that are not already directly connected.

    Returns list of (dist_m, nid_a, nid_b, cross_component) sorted with
    cross-component gaps first, then by distance.
    """
    # Nodes with real degree ≤ MAX_REAL_DEG (endpoints and low-valence junctions)
    endpoints = [
        nid for nid in nodes
        if 1 <= real_degree(nid, node_edges_idx, edges) <= MAX_REAL_DEG
    ]

    existing_pairs = direct_edge_pairs(edges)

    # Spatial grid over endpoints
    grid = defaultdict(list)
    for nid in endpoints:
        lon, lat = nodes[nid]['coords']
        grid[(int(lon / GRID_DEG), int(lat / GRID_DEG))].append(nid)

    # Search radius in grid cells (generous to cover longitude stretch at 48 °N)
    r = int(max_gap / (LAT_M * GRID_DEG)) + 3

    candidates = []
    seen = set()

    for nid_a in endpoints:
        lon_a, lat_a = nodes[nid_a]['coords']
        cx, cy = int(lon_a / GRID_DEG), int(lat_a / GRID_DEG)

        for ddx in range(-r, r + 1):
            for ddy in range(-r, r + 1):
                for nid_b in grid.get((cx + ddx, cy + ddy), []):
                    if nid_b <= nid_a:
                        continue
                    key = (nid_a, nid_b)
                    if key in seen:
                        continue
                    seen.add(key)

                    # Skip if already directly connected
                    pair_key = (min(nid_a, nid_b), max(nid_a, nid_b))
                    if pair_key in existing_pairs:
                        continue

                    lon_b, lat_b = nodes[nid_b]['coords']
                    dist = haversine_m(lon_a, lat_a, lon_b, lat_b)
                    if dist < min_gap or dist > max_gap:
                        continue

                    # Skip if both nodes serve the same single route (loop endpoints)
                    routes_a = set(node_real_routes(nid_a, node_edges_idx, edges))
                    routes_b = set(node_real_routes(nid_b, node_edges_idx, edges))
                    if routes_a and routes_b and routes_a == routes_b:
                        continue

                    cross = comp_map[nid_a] != comp_map[nid_b]
                    candidates.append((dist, nid_a, nid_b, cross))

    # Cross-component gaps first, then ascending distance
    candidates.sort(key=lambda x: (0 if x[3] else 1, x[0]))
    return candidates


# ---------------------------------------------------------------------------
# OSRM
# ---------------------------------------------------------------------------

def osrm_route(lon1, lat1, lon2, lat2):
    """
    Query OSRM cycling API.
    Returns (distance_m, [[lon, lat], ...]) or None if no route found.
    """
    url = OSRM_URL.format(lon1=lon1, lat1=lat1, lon2=lon2, lat2=lat2)
    try:
        with urllib.request.urlopen(url, timeout=12, context=_SSL_CTX) as resp:
            data = json.loads(resp.read())
        if data.get('code') != 'Ok' or not data.get('routes'):
            return None
        r = data['routes'][0]
        return r['distance'], r['geometry']['coordinates']
    except Exception as e:
        print(f'    OSRM error: {e}')
        return None


# ---------------------------------------------------------------------------
# GPX output
# ---------------------------------------------------------------------------

def write_gpx(coords_lonlat, name, out_path):
    """Write a list of [lon, lat] coords as a GPX 1.1 track file."""
    today = date.today().isoformat()
    trkpts = '\n      '.join(
        f'<trkpt lat="{lat:.6f}" lon="{lon:.6f}"></trkpt>'
        for lon, lat in coords_lonlat
    )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1"'
        ' creator="trailkit/find_gaps.py">\n'
        f'  <metadata><name><![CDATA[{name}]]></name>'
        f'<time>{today}T00:00:00Z</time></metadata>\n'
        '  <trk>\n'
        f'    <name><![CDATA[{name}]]></name>\n'
        '    <trkseg>\n'
        f'      {trkpts}\n'
        '    </trkseg>\n'
        '    <type>Mountainbiketour</type>\n'
        '  </trk>\n'
        '</gpx>\n'
    )
    out_path.write_text(xml, encoding='utf-8')


def gpx_filename(slug):
    today = date.today().strftime('%Y-%m-%d')
    return f'trailkit_verbindungsweg-{slug}_{today}.gpx'


# ---------------------------------------------------------------------------
# Interactive approval loop
# ---------------------------------------------------------------------------

def prompt(label):
    try:
        return input(label).strip().lower()
    except (EOFError, KeyboardInterrupt):
        print()
        return 'q'


def run_approval_loop(candidates, nodes, node_edges_idx, edges):
    saved = 0
    skipped = 0
    total = len(candidates)

    for idx, (dist_m, nid_a, nid_b, cross_comp) in enumerate(candidates):
        lon_a, lat_a = nodes[nid_a]['coords']
        lon_b, lat_b = nodes[nid_b]['coords']

        routes_a = node_real_routes(nid_a, node_edges_idx, edges)
        routes_b = node_real_routes(nid_b, node_edges_idx, edges)

        gap_type = 'CROSS-COMPONENT ⚠' if cross_comp else 'within-component'

        print(f'\n━━━ Gap {idx + 1}/{total}  [{gap_type}]  {dist_m:.0f} m straight line ━━━')
        print(f'  A: [{lon_a:.5f}, {lat_a:.5f}]')
        print(f'     routes: {routes_a or ["(junction)"]}')
        print(f'  B: [{lon_b:.5f}, {lat_b:.5f}]')
        print(f'     routes: {routes_b or ["(junction)"]}')

        # Mid-point OSM link for context
        mid_lat = (lat_a + lat_b) / 2
        mid_lon = (lon_a + lon_b) / 2
        zoom = 16
        print(f'  OSM:  https://www.openstreetmap.org/#map={zoom}/{mid_lat:.5f}/{mid_lon:.5f}')

        # Query OSRM
        print('  OSRM: ', end='', flush=True)
        result = osrm_route(lon_a, lat_a, lon_b, lat_b)
        time.sleep(OSRM_SLEEP_S)

        if result is None:
            print('no cycling route found — path may be restricted or missing in OSM')
            skipped += 1
            continue

        osrm_dist, coords = result
        ratio = osrm_dist / max(dist_m, 1)
        print(f'{osrm_dist:.0f} m  (ratio {ratio:.1f}×)')

        if osrm_dist > MAX_OSRM_M:
            print(f'  → Skip: OSRM route too long ({osrm_dist:.0f} m > {MAX_OSRM_M} m)')
            skipped += 1
            continue

        if ratio > MAX_OSRM_RATIO:
            print(f'  → Skip: OSRM detour too large ({ratio:.1f}× > {MAX_OSRM_RATIO}×)')
            skipped += 1
            continue

        # Suggest name from route slugs
        def label_from_routes(routes):
            if not routes:
                return None
            slug = routes[0]
            return slug.replace('-', ' ').title()

        label_a = label_from_routes(routes_a)
        label_b = label_from_routes(routes_b)
        if label_a and label_b:
            suggested_name = f'Verbindungsweg {label_a} - {label_b}'
        elif label_a:
            suggested_name = f'Verbindungsweg ab {label_a}'
        elif label_b:
            suggested_name = f'Verbindungsweg zu {label_b}'
        else:
            suggested_name = f'Verbindungsweg [{lon_a:.4f},{lat_a:.4f}] - [{lon_b:.4f},{lat_b:.4f}]'

        slug_a = routes_a[0] if routes_a else nid_a[:8]
        slug_b = routes_b[0] if routes_b else nid_b[:8]
        suggested_slug = f'{slug_a[:30]}-{slug_b[:30]}'

        print(f'  Name: {suggested_name}')
        ans = prompt('  Accept? [y=save / n=skip / r=rename / q=quit]: ')

        if ans == 'q':
            print('Stopping early.')
            break
        elif ans in ('n', 's', ''):
            skipped += 1
            continue
        elif ans == 'r':
            new_name = prompt('  New name: ')
            if new_name:
                suggested_name = new_name
                # Slugify
                import re
                suggested_slug = re.sub(r'[^a-z0-9]+', '-', new_name.lower()).strip('-')

        # Save GPX
        fname = gpx_filename(suggested_slug)
        out_path = GPX_DIR / fname
        if out_path.exists():
            # Avoid overwriting — append nid suffix
            fname = gpx_filename(suggested_slug + '-' + nid_a[:4])
            out_path = GPX_DIR / fname

        write_gpx(coords, suggested_name, out_path)
        print(f'  ✓  Saved: {fname}')
        saved += 1

    return saved, skipped


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--max-gap', type=float, default=800, metavar='M',
                        help='Maximum straight-line gap distance in metres (default: 800)')
    parser.add_argument('--min-gap', type=float, default=30, metavar='M',
                        help='Minimum gap distance in metres (default: 30)')
    parser.add_argument('--list', action='store_true',
                        help='List candidates without querying OSRM or prompting')
    args = parser.parse_args()

    print('=== TrailKit Gap Finder ===')
    print(f'  Network:    {NETWORK_JSON}')
    print(f'  Output:     {GPX_DIR}')
    print(f'  Gap range:  {args.min_gap:.0f} – {args.max_gap:.0f} m')
    print(f'  OSRM:       {OSRM_URL.split("/route")[0]}')
    print()

    if not NETWORK_JSON.exists():
        sys.exit(f'ERROR: {NETWORK_JSON} not found — run build_trail_network.py first')

    # Load network
    print('Loading trail network …')
    net = json.loads(NETWORK_JSON.read_text(encoding='utf-8'))
    nodes         = net['nodes']
    edges         = net['edges']
    node_edges_idx = net['node_edges']
    print(f'  {len(nodes)} nodes, {len(edges)} edges')

    # Build adjacency + components
    print('Computing connected components …')
    adj      = build_adjacency(edges)
    comp_map = connected_components(nodes, adj)
    n_comps  = len(set(comp_map.values()))
    print(f'  {n_comps} component(s)')

    # Find gap candidates
    print('Searching for gap candidates …')
    candidates = find_candidates(nodes, node_edges_idx, edges, comp_map,
                                 args.min_gap, args.max_gap)

    n_cross  = sum(1 for c in candidates if c[3])
    n_within = len(candidates) - n_cross
    print(f'  {len(candidates)} candidate pair(s)  '
          f'({n_cross} cross-component, {n_within} within-component)')

    if not candidates:
        print('\nNo gaps found in the specified range. Try --max-gap with a larger value.')
        return

    if args.list:
        print()
        for i, (dist_m, nid_a, nid_b, cross) in enumerate(candidates):
            lon_a, lat_a = nodes[nid_a]['coords']
            lon_b, lat_b = nodes[nid_b]['coords']
            routes_a = node_real_routes(nid_a, node_edges_idx, edges)
            routes_b = node_real_routes(nid_b, node_edges_idx, edges)
            tag = '⚠ CROSS' if cross else '     '
            mid_lat = (lat_a + lat_b) / 2
            mid_lon = (lon_a + lon_b) / 2
            print(f'  {i+1:3}.  {tag}  {dist_m:5.0f} m  {routes_a[0] if routes_a else "?":40s}  ↔  {routes_b[0] if routes_b else "?"}')
            print(f'         OSM: https://www.openstreetmap.org/#map=16/{mid_lat:.5f}/{mid_lon:.5f}')
        return

    print()
    print('For each candidate, OSRM is queried and a route is suggested.')
    print('Press  q  at any prompt to stop early.\n')

    saved, skipped = run_approval_loop(candidates, nodes, node_edges_idx, edges)

    print(f'\n═══ Done: {saved} saved, {skipped} skipped/rejected ═══')
    if saved > 0:
        print()
        print('Next steps:')
        print('  1. Inspect the saved GPX file(s) in your map app or on OSM')
        print('  2. If happy, run:  python scripts/build_trail_network.py')
        print(f'  3. GPX location:  {GPX_DIR}')


if __name__ == '__main__':
    main()
