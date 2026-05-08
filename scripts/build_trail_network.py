#!/usr/bin/env python3
"""
build_trail_network.py — Builds the trail topology graph from GPX trackpoints.

v2 improvements over v1:
  - JUNCTION_THRESHOLD_M 8 → 25 m  (GPS tracks at same junction diverge up to 20 m)
  - NODE_DEDUP_M 5 → 15 m
  - Point-to-segment projection (not point-to-point) for junction detection
  - All junctions per route pair, not just first; run-based (start+end of overlap)
  - Fast grid index for node lookup during edge splitting
  - Nodes inserted into routes where junctions land between trackpoints
  - Connected-component analysis in output

Run: python scripts/build_trail_network.py
"""

import json, hashlib, math, sys
from pathlib import Path
from collections import defaultdict

if Path('/Users/simongraf/projects/bike-routes/data/ww-info').exists():
    DATA_DIR = Path('/Users/simongraf/projects/bike-routes/data/ww-info')
elif Path('/home/openclaw/bike-routes/data/ww-info').exists():
    DATA_DIR = Path('/home/openclaw/bike-routes/data/ww-info')
else:
    raise RuntimeError('Data directory not found')

OUTPUT_DIR = Path(__file__).parent.parent / "src" / "data"
ROUTES_DIR = DATA_DIR / "routes"
GPX_DIR    = DATA_DIR / "gpx-enriched"

# Slugs containing any of these keywords (and not in the exclusion set) are
# treated as one-way downhill trails — recorded in riding (descending) direction.
_TRAIL_KEYWORDS   = frozenset(['trail', 'flow', 'fun', 'blackberry', 'raspberry', 'enduro'])
_EXCLUDE_PREFIXES = ('verbindungsweg-', 'zubringer-', '_')
_UPHILL_KEYWORDS  = frozenset(['uphill', 'auffahrt'])

def is_downhill_trail(slug: str) -> bool:
    if any(slug.startswith(p) for p in _EXCLUDE_PREFIXES):
        return False
    if any(k in slug for k in _UPHILL_KEYWORDS):
        return False
    return any(k in slug for k in _TRAIL_KEYWORDS)


GRID_DEG             = 0.001   # spatial index cell ≈ 80 m at 48°N
JUNCTION_THRESHOLD_M = 60      # max distance for two routes to be "connected"
NODE_DEDUP_M         = 25      # merge nodes within this radius
MIN_EDGE_M           = 20      # drop edges shorter than this
SNAP_THRESHOLD_M     = 60      # snap trackpoint to node when within this radius
BRIDGE_THRESHOLD_M   = 100     # bridge isolated components whose nodes are this close
MICRO_GAP_M          = 5       # merge near-duplicate nodes within this distance

LAT_M = 111320.0               # metres per degree latitude


def haversine_m(lon1, lat1, lon2, lat2):
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi  = math.radians(lat2 - lat1)
    dlam  = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def md5_8(s):
    return hashlib.md5(s.encode()).hexdigest()[:8]


def point_to_segment(px, py, ax, ay, bx, by):
    """
    Minimum distance from point P to segment A–B.
    Returns (dist_m, proj_lon, proj_lat, t) where t ∈ [0,1] is the parameter.
    Uses flat-earth approximation; accurate to <0.5% over trail-scale distances.
    """
    mid_lat = (ay + by) / 2
    lon_m   = LAT_M * math.cos(math.radians(mid_lat))
    dx = (bx - ax) * lon_m
    dy = (by - ay) * LAT_M
    ex = (px - ax) * lon_m
    ey = (py - ay) * LAT_M
    seg_sq = dx*dx + dy*dy
    if seg_sq < 1e-12:
        return haversine_m(px, py, ax, ay), ax, ay, 0.0
    t = max(0.0, min(1.0, (ex*dx + ey*dy) / seg_sq))
    proj_lon = ax + t * (bx - ax)
    proj_lat = ay + t * (by - ay)
    return haversine_m(px, py, proj_lon, proj_lat), proj_lon, proj_lat, t


def parse_gpx(path):
    import re
    content = open(path, encoding='utf-8').read()
    content = re.sub(r'xmlns="[^"]+"',        '', content)
    content = re.sub(r'xmlns:[a-zA-Z]+="[^"]+"', '', content)
    trkpt_re = re.compile(r'<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>(.*?)</trkpt>', re.DOTALL)
    ele_re   = re.compile(r'<ele>([^<]+)</ele>')
    pts = []
    for m in trkpt_re.finditer(content):
        lat, lon = float(m.group(1)), float(m.group(2))
        em  = ele_re.search(m.group(3))
        ele = float(em.group(1)) if em else None
        pts.append((lon, lat, ele))
    return pts


# ---------------------------------------------------------------------------
# Spatial indices
# ---------------------------------------------------------------------------

def build_global_seg_index(trackpoints_dict):
    """cell → list of (slug, seg_i, ax, ay, bx, by)."""
    idx = defaultdict(list)
    for slug, pts in trackpoints_dict.items():
        for i in range(len(pts) - 1):
            ax, ay = pts[i][0], pts[i][1]
            bx, by = pts[i+1][0], pts[i+1][1]
            cx0, cy0 = int(ax / GRID_DEG), int(ay / GRID_DEG)
            cx1, cy1 = int(bx / GRID_DEG), int(by / GRID_DEG)
            for cx in range(min(cx0, cx1), max(cx0, cx1) + 1):
                for cy in range(min(cy0, cy1), max(cy0, cy1) + 1):
                    idx[(cx, cy)].append((slug, i, ax, ay, bx, by))
    return idx


def build_node_grid(nodes):
    """cell → [nid, …]"""
    g = defaultdict(list)
    for nid, nd in nodes.items():
        cx = int(nd['coords'][0] / GRID_DEG)
        cy = int(nd['coords'][1] / GRID_DEG)
        g[(cx, cy)].append(nid)
    return g


def snap_to_node_fast(lon, lat, node_grid, nodes, threshold_m):
    """Return (nid, dist) of nearest node within threshold_m, else (None, dist)."""
    cx, cy = int(lon / GRID_DEG), int(lat / GRID_DEG)
    best_nid, best_dist = None, float('inf')
    for ddx in (-1, 0, 1):
        for ddy in (-1, 0, 1):
            for nid in node_grid.get((cx+ddx, cy+ddy), []):
                d = haversine_m(lon, lat, nodes[nid]['coords'][0], nodes[nid]['coords'][1])
                if d < best_dist:
                    best_dist, best_nid = d, nid
    return (best_nid if best_dist <= threshold_m else None), best_dist


# ---------------------------------------------------------------------------
# Junction detection — point-to-segment, run-based
# ---------------------------------------------------------------------------

def find_junctions(trackpoints_dict, global_seg_idx):
    """
    For each route A, for each point P_a find the nearest point on every other
    route B within JUNCTION_THRESHOLD_M.  Detect contiguous "overlap runs" and
    emit one junction at the start and one at the end of each run — not one per
    overlapping trackpoint.  This avoids flooding shared stretches with nodes.
    """
    raw = []  # (lon, lat)

    for slug_a, pts_a in trackpoints_dict.items():
        # nearest-on-B dist for each point in A, keyed by slug_b
        # nearest_b[slug_b][i] = (dist, proj_lon, proj_lat)
        nearest_b = defaultdict(dict)

        for i, pt_a in enumerate(pts_a):
            cx, cy = int(pt_a[0] / GRID_DEG), int(pt_a[1] / GRID_DEG)
            best_per_slug = {}
            for ddx in (-1, 0, 1):
                for ddy in (-1, 0, 1):
                    for (slug_b, si, ax, ay, bx, by) in global_seg_idx.get((cx+ddx, cy+ddy), []):
                        if slug_b == slug_a:
                            continue
                        d, plon, plat, _ = point_to_segment(pt_a[0], pt_a[1], ax, ay, bx, by)
                        if d <= JUNCTION_THRESHOLD_M:
                            prev = best_per_slug.get(slug_b)
                            if prev is None or d < prev[0]:
                                best_per_slug[slug_b] = (d, plon, plat)
            for slug_b, (d, plon, plat) in best_per_slug.items():
                nearest_b[slug_b][i] = (d, plon, plat)

        # For each candidate slug_b, find contiguous overlap runs in A
        for slug_b, hits in nearest_b.items():
            if not hits:
                continue
            indices = sorted(hits)
            runs = []
            run = [indices[0]]
            for k in range(1, len(indices)):
                if indices[k] == indices[k-1] + 1:
                    run.append(indices[k])
                else:
                    runs.append(run)
                    run = [indices[k]]
            runs.append(run)

            for run in runs:
                for endpoint_i in ([run[0]] if len(run) == 1 else [run[0], run[-1]]):
                    d, plon, plat = hits[endpoint_i]
                    pt_a = pts_a[endpoint_i]
                    # midpoint between route-A trackpoint and route-B projection
                    raw.append(((pt_a[0] + plon) / 2, (pt_a[1] + plat) / 2))

    return raw


def dedup_junctions(raw):
    """Merge raw junction points within NODE_DEDUP_M using a grid for speed."""
    cell = NODE_DEDUP_M / 2.0 / LAT_M  # degrees
    grid = defaultdict(list)            # cell → [result_idx, …]
    result = []

    for lon, lat in raw:
        cx = int(lon / cell)
        cy = int(lat / cell)
        merged = None
        for ddx in (-1, 0, 1):
            for ddy in (-1, 0, 1):
                for j in grid.get((cx+ddx, cy+ddy), []):
                    if haversine_m(lon, lat, result[j][0], result[j][1]) <= NODE_DEDUP_M:
                        merged = j
                        break
                if merged is not None:
                    break
            if merged is not None:
                break
        if merged is not None:
            old = result[merged]
            result[merged] = ((old[0]+lon)/2, (old[1]+lat)/2)
        else:
            grid[(cx, cy)].append(len(result))
            result.append((lon, lat))

    return result


# ---------------------------------------------------------------------------
# Route augmentation — insert junction nodes between trackpoints
# ---------------------------------------------------------------------------

def augment_route(pts, node_grid, nodes):
    """
    Return list of (lon, lat, ele, nid_or_None).
    - Existing trackpoints are snapped to the nearest node within SNAP_THRESHOLD_M.
    - Junction nodes that fall *between* two trackpoints (detected by projection)
      are inserted at the right position so edge-splitting sees them.
    """
    # Phase 1: snap existing trackpoints
    aug = []
    for p in pts:
        nid, _ = snap_to_node_fast(p[0], p[1], node_grid, nodes, SNAP_THRESHOLD_M)
        aug.append((p[0], p[1], p[2] if len(p) > 2 else None, nid))

    # Phase 2: find nodes that sit between trackpoints (need insertion)
    already_snapped = {item[3] for item in aug if item[3] is not None}

    candidate_nids = set()
    for p in pts:
        cx, cy = int(p[0] / GRID_DEG), int(p[1] / GRID_DEG)
        for ddx in (-1, 0, 1):
            for ddy in (-1, 0, 1):
                candidate_nids.update(node_grid.get((cx+ddx, cy+ddy), []))
    candidate_nids -= already_snapped

    insertions = []  # (seg_i, t, nlon, nlat, ele, nid)
    for nid in candidate_nids:
        nlon, nlat = nodes[nid]['coords']
        best_d, best_info = float('inf'), None
        for i in range(len(pts) - 1):
            d, _, _, t = point_to_segment(nlon, nlat, pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1])
            if d < best_d:
                best_d, best_info = d, (i, t)
        if best_d <= SNAP_THRESHOLD_M and best_info:
            si, t = best_info
            e1 = pts[si][2] if len(pts[si]) > 2 else None
            e2 = pts[si+1][2] if len(pts[si+1]) > 2 else None
            ele = (e1 + t*(e2-e1)) if (e1 is not None and e2 is not None) else None
            insertions.append((si, t, nlon, nlat, ele, nid))

    if not insertions:
        return aug

    insertions.sort(key=lambda x: (x[0], x[1]))

    # Rebuild, inserting between original trackpoints
    result = []
    ins_ptr = 0
    for i, item in enumerate(aug):
        while ins_ptr < len(insertions) and insertions[ins_ptr][0] == i - 1:
            _, t, ilon, ilat, iele, inid = insertions[ins_ptr]
            result.append((ilon, ilat, iele, inid))
            ins_ptr += 1
        result.append(item)

    return result


# ---------------------------------------------------------------------------
# Connectivity analysis
# ---------------------------------------------------------------------------

def connected_components(nodes, edges):
    adj = defaultdict(set)
    for edata in edges.values():
        adj[edata['from']].add(edata['to'])
        adj[edata['to']].add(edata['from'])
    visited = set()
    comps = []
    for nid in nodes:
        if nid in visited:
            continue
        comp, stack = set(), [nid]
        while stack:
            cur = stack.pop()
            if cur in visited:
                continue
            visited.add(cur)
            comp.add(cur)
            stack.extend(adj[cur] - visited)
        comps.append(comp)
    return sorted(comps, key=len, reverse=True)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=== TrailKit Trail Network Builder v2 ===")
    print(f"  JUNCTION_THRESHOLD={JUNCTION_THRESHOLD_M}m  NODE_DEDUP={NODE_DEDUP_M}m  MIN_EDGE={MIN_EDGE_M}m")

    # 1. Load routes
    routes_meta  = {}
    trackpoints  = {}
    for jf in sorted(ROUTES_DIR.glob("*.json")):
        d    = json.loads(jf.read_text(encoding='utf-8'))
        slug = d.get('slug')
        if not slug:
            continue
        gp = GPX_DIR / d.get('gpx_enriched_file', '')
        if not gp.exists():
            continue
        pts = parse_gpx(gp)
        if len(pts) < 2:
            continue
        trackpoints[slug]  = pts
        routes_meta[slug]  = {
            'is_loop':          d.get('is_loop', False),
            'title':            d.get('title', slug),
            'elevation_gain_m': d.get('elevation_gain_m') or 0,
            'elevation_loss_m': d.get('elevation_loss_m') or 0,
        }
    print(f"  Loaded {len(trackpoints)} routes")

    # 2. Global segment index
    print("  Building segment index …")
    gseg = build_global_seg_index(trackpoints)

    # 3. Find junctions
    print("  Finding junctions (point-to-segment, run-based) …")
    raw = find_junctions(trackpoints, gseg)
    print(f"  {len(raw)} raw junction candidates")

    # 4. Deduplicate
    print("  Deduplicating junctions …")
    junctions = dedup_junctions(raw)
    print(f"  {len(junctions)} unique junction points")

    # 5. Build node set
    print("  Building nodes …")
    nodes = {}

    def add_node(lon, lat):
        lon_r, lat_r = round(lon, 6), round(lat, 6)
        nid = f"n_{md5_8(f'{lon_r:.6f},{lat_r:.6f}')}"
        nodes.setdefault(nid, {'coords': [lon_r, lat_r]})
        return nid

    # Route endpoints
    for slug, pts in trackpoints.items():
        add_node(pts[0][0],  pts[0][1])
        add_node(pts[-1][0], pts[-1][1])

    # Junction nodes (dedup against existing)
    node_grid = build_node_grid(nodes)
    for jlon, jlat in junctions:
        existing, _ = snap_to_node_fast(jlon, jlat, node_grid, nodes, NODE_DEDUP_M)
        if existing is None:
            nid = add_node(jlon, jlat)
            cx, cy = int(jlon / GRID_DEG), int(jlat / GRID_DEG)
            node_grid[(cx, cy)].append(nid)

    node_grid = build_node_grid(nodes)   # rebuild fully
    print(f"  {len(nodes)} nodes")

    # 6. Split routes into edges
    print("  Splitting routes into edges …")
    edges = {}
    zero_edge = []
    total_km  = 0.0

    # Pre-compute total GPX distance per route for proportional elevation
    route_gpx_dist_m = {}
    for slug, pts in trackpoints.items():
        route_gpx_dist_m[slug] = sum(
            haversine_m(pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1])
            for i in range(len(pts) - 1)
        )

    for slug, pts in trackpoints.items():
        is_loop = routes_meta[slug]['is_loop']
        aug     = augment_route(pts, node_grid, nodes)

        current_from = None
        current_pts  = []
        route_edges  = []

        for lon, lat, ele, hint_nid in aug:
            nid = hint_nid
            if nid is None:
                nid, _ = snap_to_node_fast(lon, lat, node_grid, nodes, SNAP_THRESHOLD_M)

            pt = [lon, lat] if ele is None else [lon, lat, ele]

            if nid is not None:
                if current_from is None:
                    current_from = nid
                    current_pts  = [pt]
                elif nid != current_from:
                    current_pts.append(pt)
                    # Measure segment distance
                    seg_dist = sum(
                        haversine_m(current_pts[j-1][0], current_pts[j-1][1],
                                    current_pts[j][0],   current_pts[j][1])
                        for j in range(1, len(current_pts))
                    )
                    if seg_dist >= MIN_EDGE_M:
                        eid = f"e_{md5_8(current_from + nid + slug + str(len(route_edges)))}"
                        # Proportional elevation from route metadata (GPX has no <ele> tags)
                        route_dist = route_gpx_dist_m.get(slug, 0)
                        frac = seg_dist / route_dist if route_dist > 0 else 0
                        gain = routes_meta[slug]['elevation_gain_m'] * frac
                        loss = routes_meta[slug]['elevation_loss_m'] * frac
                        trail_edge = is_downhill_trail(slug)
                        edges[eid] = {
                            'from':            current_from,
                            'to':              nid,
                            'source_route_id': slug,
                            'geometry':        current_pts,
                            'distance_m':      int(seg_dist),
                            'bidirectional':   is_loop,
                            'ele_gain_m':      int(gain),
                            'ele_loss_m':      int(loss),
                            'one_way':         trail_edge,
                            'trail_edge':      trail_edge,
                        }
                        route_edges.append(eid)
                        total_km += seg_dist / 1000.0
                    current_from = nid
                    current_pts  = [pt]
                # else: same node — dithering near junction, skip
            else:
                if current_from is not None:
                    current_pts.append(pt)

        if not route_edges:
            zero_edge.append(slug)

    print(f"  {len(edges)} edges  ({total_km:.1f} km total)")
    if zero_edge:
        print(f"  WARNING: {len(zero_edge)} routes with 0 edges: {zero_edge[:8]}")

    # Deduplicate parallel one-way edges between the same node pair.
    # Multiple one-way edges between (from, to) arise when several overlapping
    # trails (e.g. fun-line + fun-line-mit-zufahrt) share the same corridor.
    # Keep only the shortest; the router then follows one consistent geometry
    # instead of zigzagging between the slightly-offset GPS tracks.
    from collections import defaultdict
    oneway_by_pair = defaultdict(list)
    for eid, ed in edges.items():
        if ed.get('one_way'):
            oneway_by_pair[(ed['from'], ed['to'])].append(eid)

    removed = 0
    for pair, eids in oneway_by_pair.items():
        if len(eids) <= 1:
            continue
        # Sort by distance, keep shortest
        eids.sort(key=lambda e: edges[e].get('distance_m', 0))
        for eid in eids[1:]:
            del edges[eid]
            removed += 1
    if removed:
        print(f"  Removed {removed} duplicate one-way edges (parallel trail GPS tracks)")

    # 7. Node→edges index
    node_edges = {nid: [] for nid in nodes}
    for eid, ed in edges.items():
        node_edges[ed['from']].append(eid)
        node_edges[ed['to']].append(eid)

    # 8. Connectivity analysis
    print("  Analysing connectivity …")
    comps = connected_components(nodes, edges)
    deg   = defaultdict(int)
    for nid in nodes:
        deg[len(node_edges[nid])] += 1

    avg_deg = sum(k*v for k, v in deg.items()) / max(len(nodes), 1)
    print(f"\n=== Build Stats ===")
    print(f"  Nodes:       {len(nodes)}")
    print(f"  Edges:       {len(edges)}")
    print(f"  Components:  {len(comps)}")
    print(f"  Main comp:   {len(comps[0])} nodes  ({100*len(comps[0])//len(nodes)}%)")
    print(f"  Avg degree:  {avg_deg:.1f}")
    print(f"  Degree-0:    {deg[0]}   Degree-1: {deg[1]}")
    print(f"  Total km:    {total_km:.1f}")
    if len(comps) > 1:
        sizes = [len(c) for c in comps[1:10]]
        print(f"  Small comps: {sizes}")

    # 9. Bridge isolated components
    print("  Bridging isolated components …")
    bridges_added = 0
    # Build spatial index for main component nodes only
    main_comp = comps[0]
    mc_grid = defaultdict(list)
    for nid in main_comp:
        lon, lat = nodes[nid]['coords']
        mc_grid[(int(lon / GRID_DEG), int(lat / GRID_DEG))].append(nid)

    def nearest_in_main(lon, lat):
        cx, cy = int(lon / GRID_DEG), int(lat / GRID_DEG)
        best_d, best_m = float('inf'), None
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                for m_nid in mc_grid.get((cx+dx, cy+dy), []):
                    d = haversine_m(lon, lat, nodes[m_nid]['coords'][0], nodes[m_nid]['coords'][1])
                    if d < best_d:
                        best_d, best_m = d, m_nid
        return best_d, best_m

    for comp in comps[1:]:
        best_d_comp, best_nid_comp, best_main = float('inf'), None, None
        for nid in comp:
            lon, lat = nodes[nid]['coords']
            d, m = nearest_in_main(lon, lat)
            if d < best_d_comp:
                best_d_comp, best_nid_comp, best_main = d, nid, m
        if best_d_comp <= BRIDGE_THRESHOLD_M and best_main is not None:
            eid = f"e_{md5_8(best_nid_comp + best_main + 'bridge')}"
            edges[eid] = {
                'from':            best_nid_comp,
                'to':              best_main,
                'source_route_id': '_bridge',
                'geometry':        [nodes[best_nid_comp]['coords'][:], nodes[best_main]['coords'][:]],
                'distance_m':      int(best_d_comp),
                'bidirectional':   True,
                'ele_gain_m':      0,
                'ele_loss_m':      0,
            }
            # Also add the bridged component's nodes into main for subsequent iterations
            for nid in comp:
                lon, lat = nodes[nid]['coords']
                mc_grid[(int(lon / GRID_DEG), int(lat / GRID_DEG))].append(nid)
            main_comp = main_comp | comp
            bridges_added += 1

    print(f"  Added {bridges_added} bridge edges")

    # 10. Connect near-duplicate nodes (micro-gap fix)
    # Route endpoints within MICRO_GAP_M that ended up as separate nodes due to
    # rounding/GPS drift — add a zero-cost bridge so Dijkstra can cross the gap.
    print("  Fixing micro-gaps …")
    micro_bridges = 0

    # Build direct-connection set from current edges
    direct_pairs = set()
    for ed in edges.values():
        a, b = ed['from'], ed['to']
        direct_pairs.add((min(a, b), max(a, b)))

    ng2 = build_node_grid(nodes)
    MICRO_CELL = int(MICRO_GAP_M / LAT_M / GRID_DEG) + 2  # cell radius to search

    seen_pairs = set()
    for nid, nd in nodes.items():
        lon, lat = nd['coords']
        cx, cy = int(lon / GRID_DEG), int(lat / GRID_DEG)
        for ddx in range(-MICRO_CELL, MICRO_CELL + 1):
            for ddy in range(-MICRO_CELL, MICRO_CELL + 1):
                for nid2 in ng2.get((cx+ddx, cy+ddy), []):
                    if nid2 <= nid:
                        continue
                    pair = (nid, nid2)
                    if pair in seen_pairs or pair in direct_pairs:
                        continue
                    seen_pairs.add(pair)
                    d = haversine_m(lon, lat, nodes[nid2]['coords'][0], nodes[nid2]['coords'][1])
                    if d <= MICRO_GAP_M:
                        eid = f"e_{md5_8(nid + nid2 + 'microgap')}"
                        edges[eid] = {
                            'from':            nid,
                            'to':              nid2,
                            'source_route_id': '_micro',
                            'geometry':        [nd['coords'][:], nodes[nid2]['coords'][:]],
                            'distance_m':      max(1, int(d)),
                            'bidirectional':   True,
                            'ele_gain_m':      0,
                            'ele_loss_m':      0,
                        }
                        direct_pairs.add(pair)
                        micro_bridges += 1

    print(f"  Added {micro_bridges} micro-gap bridges")

    # Rebuild node_edges index with bridge + micro edges
    node_edges = {nid: [] for nid in nodes}
    for eid, ed in edges.items():
        node_edges[ed['from']].append(eid)
        node_edges[ed['to']].append(eid)

    # Final connectivity stats
    comps2 = connected_components(nodes, edges)
    print(f"  After bridging: {len(comps2)} components, main={len(comps2[0])} nodes ({100*len(comps2[0])//len(nodes)}%)")

    # 11. Write output
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUTPUT_DIR / "trail_network.json"
    out.write_text(
        json.dumps({'nodes': nodes, 'edges': edges, 'node_edges': node_edges},
                   ensure_ascii=False, indent=2),
        encoding='utf-8'
    )
    print(f"\n  → {out}  ({out.stat().st_size/1024/1024:.1f} MB)")

    # 12. Write trail_edges.geojson for map directional-arrow visualization
    trail_features = [
        {
            'type': 'Feature',
            'geometry': {'type': 'LineString', 'coordinates': ed['geometry']},
            'properties': {'source_route_id': ed['source_route_id']},
        }
        for ed in edges.values()
        if ed.get('trail_edge')
    ]
    trail_out = OUTPUT_DIR / "trail_edges.json"
    trail_out.write_text(
        json.dumps({'type': 'FeatureCollection', 'features': trail_features},
                   ensure_ascii=False),
        encoding='utf-8'
    )
    print(f"  → {trail_out}  ({len(trail_features)} trail edges)")
    print("=== Done ===")


if __name__ == '__main__':
    main()
