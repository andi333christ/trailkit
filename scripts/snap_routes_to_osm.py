#!/usr/bin/env python3
"""
snap_routes_to_osm.py — Map-match GPX tracks to OSM via Valhalla trace_route,
then attach SRTM elevation for snapped points via Valhalla /height.

Input:  ~/bike-routes/data/ww-info/gpx-enriched/*.gpx
Output: ~/bike-routes/data/ww-info/gpx-snapped/*.gpx

build_routes.py prefers gpx-snapped/ when present; falls back to gpx-enriched/
for any route that was not snapped (or for areas where snapping was not run).

Run:
  python scripts/snap_routes_to_osm.py                  # all routes
  python scripts/snap_routes_to_osm.py --only slug       # single route (test first!)
  python scripts/snap_routes_to_osm.py --fix-missing-ele # re-fetch /height for snapped files missing elevation
"""

import json
import math
import re
import sys
import time
from argparse import ArgumentParser
from pathlib import Path

import requests

VALHALLA        = "https://valhalla1.openstreetmap.de"
GPX_DIR         = Path("/Users/simongraf/projects/bike-routes/data/ww-info/gpx-enriched")
SNAPPED_DIR     = Path("/Users/simongraf/projects/bike-routes/data/ww-info/gpx-snapped")
ROUTES_DIR      = Path("/Users/simongraf/projects/bike-routes/data/ww-info/routes")

MAX_SHAPE_PTS   = 400   # max points sent to trace_route
MIN_SAMPLE_M    = 8.0   # distance-based thinning threshold (meters)
DELAY_S         = 1.5   # seconds between routes (rate-limit guard)


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def haversine_m(lat1, lon1, lat2, lon2):
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((phi2 - phi1) / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def sample_by_distance(pts, min_m=MIN_SAMPLE_M):
    """Keep points ≥ min_m apart. Always preserve first and last."""
    if len(pts) <= 2:
        return pts
    out = [pts[0]]
    for pt in pts[1:-1]:
        if haversine_m(*out[-1], *pt) >= min_m:
            out.append(pt)
    out.append(pts[-1])
    return out


def thin_to_max(pts, max_pts=MAX_SHAPE_PTS):
    """Uniform-stride fallback if distance sampling still leaves >max_pts."""
    if len(pts) <= max_pts:
        return pts
    step = len(pts) / max_pts
    indices = sorted({int(i * step) for i in range(max_pts)} | {len(pts) - 1})
    return [pts[i] for i in indices]


def decode_polyline6(encoded):
    """Decode Valhalla precision-6 polyline → [(lat, lon), ...]."""
    coords = []
    index = lat = lon = 0
    while index < len(encoded):
        for is_lat in (True, False):
            shift = result = 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                result |= (b & 0x1f) << shift
                shift += 5
                if b < 0x20:
                    break
            delta = ~(result >> 1) if (result & 1) else (result >> 1)
            if is_lat:
                lat += delta
            else:
                lon += delta
        coords.append((lat / 1e6, lon / 1e6))
    return coords


# ---------------------------------------------------------------------------
# GPX I/O
# ---------------------------------------------------------------------------

def parse_gpx(path):
    """Parse GPX → [(lat, lon), ...]. Strips XML namespace before matching."""
    content = path.read_text(encoding="utf-8")
    content = re.sub(r'xmlns(?::[a-zA-Z]+)?="[^"]+"', '', content)
    return [
        (float(m.group(1)), float(m.group(2)))
        for m in re.finditer(r'<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"', content)
    ]


def write_gpx(path, name, pts):
    """
    Write GPX with explicit </trkpt> closing tags (not self-closing).
    pts: [(lat, lon, ele_m_or_None), ...]
    """
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1"'
        ' creator="snap_routes_to_osm">',
        '  <trk>',
        f'    <name><![CDATA[{name}]]></name>',
        '    <trkseg>',
    ]
    for lat, lon, ele in pts:
        inner = f'<ele>{ele:.1f}</ele>' if ele is not None else ''
        lines.append(f'      <trkpt lat="{lat:.6f}" lon="{lon:.6f}">{inner}</trkpt>')
    lines += ['    </trkseg>', '  </trk>', '</gpx>']
    path.write_text('\n'.join(lines), encoding='utf-8')


# ---------------------------------------------------------------------------
# Valhalla API calls
# ---------------------------------------------------------------------------

def _post(endpoint, payload):
    resp = requests.post(f"{VALHALLA}/{endpoint}", json=payload, timeout=60)
    resp.raise_for_status()
    return resp.json()


def _decode_legs(resp):
    snapped = []
    for leg in resp["trip"]["legs"]:
        leg_pts = decode_polyline6(leg["shape"])
        if snapped:
            leg_pts = leg_pts[1:]   # drop duplicate junction point
        snapped.extend(leg_pts)
    return snapped


CHUNK_SIZE = 60   # pts per chunk for chunked fallback


def _path_length_m(pts):
    return sum(haversine_m(*pts[i], *pts[i + 1]) for i in range(len(pts) - 1))


def _snap_single(pts, costing, costing_options=None):
    payload = {
        "shape": [{"lat": lat, "lon": lon, "type": "via"} for lat, lon in pts],
        "costing": costing,
        "shape_match": "map_snap",
        "format": "json",
    }
    if costing_options:
        payload["costing_options"] = costing_options
    return _decode_legs(_post("trace_route", payload))


def _snap_chunked(pts, costing):
    """Snap in CHUNK_SIZE-pt windows with 1-pt overlap; concatenate results."""
    snapped = []
    for start in range(0, len(pts), CHUNK_SIZE):
        chunk = pts[start:start + CHUNK_SIZE + 1]
        if len(chunk) < 2:
            break
        chunk_snapped = _snap_single(chunk, costing)
        if snapped:
            chunk_snapped = chunk_snapped[1:]
        snapped.extend(chunk_snapped)
        if start + CHUNK_SIZE < len(pts):
            time.sleep(0.5)
    return snapped


def snap_route(pts):
    """
    Snap (lat, lon) pts to OSM via Valhalla trace_route.
    Fallback chain:
      1. MTB bicycle costing (best quality)
      2. Pedestrian costing if MTB 504s/400s or result <40% input length
         (trails exist in OSM but not tagged MTB)
      3. Chunked pedestrian if single-pass still <40% input length
         (OSM path connectivity has gaps across long route)
    Raises on all fallbacks failing.
    """
    input_len = _path_length_m(pts)
    mtb_opts = {"bicycle": {"bicycle_type": "Mountain", "use_trails": 1.0,
                            "use_roads": 0.0, "use_hills": 1.0,
                            "avoid_bad_surfaces": 0.0}}

    # Step 1 — MTB
    try:
        snapped = _snap_single(pts, "bicycle", mtb_opts)
        if _path_length_m(snapped) >= input_len * 0.4:
            return snapped
        print(f"\n    MTB snap too short ({_path_length_m(snapped)/1000:.1f} km vs {input_len/1000:.1f} km input), trying pedestrian", end=" ", flush=True)
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code in (400, 504):
            print(f"\n    MTB snap {e.response.status_code}, trying pedestrian", end=" ", flush=True)
        else:
            raise

    # Step 2 — pedestrian single-pass
    snapped = _snap_single(pts, "pedestrian")
    if _path_length_m(snapped) >= input_len * 0.4:
        return snapped
    print(f"\n    pedestrian snap too short ({_path_length_m(snapped)/1000:.1f} km), trying chunked", end=" ", flush=True)

    # Step 3 — chunked pedestrian
    snapped = _snap_chunked(pts, "pedestrian")

    # Final guard — if still too short, trails not in OSM; caller falls back to enriched GPX
    if _path_length_m(snapped) < input_len * 0.4:
        raise ValueError(
            f"all snap attempts too short "
            f"({_path_length_m(snapped)/1000:.2f} km vs {input_len/1000:.2f} km input) "
            f"— trails likely not in OSM"
        )

    return snapped


def fetch_elevation(pts):
    """
    Fetch SRTM elevation for [(lat, lon), ...] via Valhalla /height.
    Returns [ele_m, ...] aligned to pts, or None on failure.
    """
    try:
        resp = _post("height", {
            "shape": [{"lat": lat, "lon": lon} for lat, lon in pts],
            "range": False,
        })
        return resp.get("height")
    except Exception as e:
        print(f"\n    WARNING: /height failed: {e}", file=sys.stderr)
        return None


# ---------------------------------------------------------------------------
# Per-route processing
# ---------------------------------------------------------------------------

def process_route(slug, gpx_filename, name):
    src = GPX_DIR / gpx_filename
    dst = SNAPPED_DIR / gpx_filename

    if not src.exists():
        print(f"  SKIP (no GPX): {slug}", file=sys.stderr)
        return False

    pts = parse_gpx(src)
    if not pts:
        print(f"  SKIP (no points): {slug}", file=sys.stderr)
        return False

    orig_n = len(pts)
    pts = sample_by_distance(pts)
    pts = thin_to_max(pts)

    print(f"  {slug}: {orig_n} → {len(pts)} sent", end=" ", flush=True)

    try:
        snapped = snap_route(pts)
    except Exception as e:
        print(f"\n    WARNING: snap failed ({e}), falling back to enriched GPX", file=sys.stderr)
        if dst.exists():
            dst.unlink()
        return False

    elevations = fetch_elevation(snapped)

    write_gpx(dst, name, [
        (lat, lon, elevations[i] if elevations and i < len(elevations) else None)
        for i, (lat, lon) in enumerate(snapped)
    ])

    print(f"→ {len(snapped)} snapped {'+ ele' if elevations else '(no ele)'}")
    return True


# ---------------------------------------------------------------------------
# --fix-missing-ele mode
# ---------------------------------------------------------------------------

def fix_missing_ele(only_slug=None):
    """
    Re-fetch /height for snapped GPX files that have no <ele> tags.
    Rewrites the file in place; geometry is not touched.
    """
    files = sorted(SNAPPED_DIR.glob("*.gpx"))
    if only_slug:
        files = [f for f in files if only_slug in f.name]

    targets = []
    for f in files:
        content = f.read_text(encoding="utf-8")
        if "<ele>" not in content:
            targets.append(f)

    if not targets:
        print("No snapped files missing elevation.")
        return

    print(f"Fixing elevation for {len(targets)} file(s):")
    ok = fail = 0
    for i, path in enumerate(targets, 1):
        pts = parse_gpx(path)
        if not pts:
            print(f"  [{i}] SKIP (no points): {path.name}", file=sys.stderr)
            continue

        print(f"  [{i}/{len(targets)}] {path.stem} ({len(pts)} pts)", end=" ", flush=True)
        elevations = fetch_elevation(pts)
        if not elevations:
            print("FAIL (still no elevation)", file=sys.stderr)
            fail += 1
            continue

        # Re-parse name from existing file
        content = path.read_text(encoding="utf-8")
        name_m = re.search(r'<name><!\[CDATA\[([^\]]+)\]\]></name>', content)
        name = name_m.group(1) if name_m else path.stem

        write_gpx(path, name, [
            (lat, lon, elevations[i] if i < len(elevations) else None)
            for i, (lat, lon) in enumerate(pts)
        ])
        print(f"+ ele")
        ok += 1
        time.sleep(DELAY_S)

    print(f"\nDone: {ok} fixed, {fail} still missing elevation")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--only", metavar="SLUG",
                        help="Process only routes whose slug contains SLUG (use for testing)")
    parser.add_argument("--fix-missing-ele", action="store_true",
                        help="Re-fetch /height for snapped files missing elevation; don't re-snap")
    args = parser.parse_args()

    SNAPPED_DIR.mkdir(parents=True, exist_ok=True)

    if args.fix_missing_ele:
        fix_missing_ele(only_slug=args.only)
        return

    routes = []
    for jf in sorted(ROUTES_DIR.glob("*.json")):
        d = json.loads(jf.read_text(encoding="utf-8"))
        slug = d.get("slug")
        gpx_file = d.get("gpx_enriched_file")
        if slug and gpx_file:
            routes.append((slug, gpx_file, d.get("title", slug)))

    if args.only:
        routes = [(s, g, n) for s, g, n in routes if args.only in s]
        if not routes:
            print(f"No route matching '{args.only}'", file=sys.stderr)
            sys.exit(1)

    total = len(routes)
    ok = fail = 0

    print(f"Snapping {total} route(s) → {SNAPPED_DIR}")
    for i, (slug, gpx_file, name) in enumerate(routes, 1):
        print(f"[{i}/{total}]", end=" ")
        if process_route(slug, gpx_file, name):
            ok += 1
        else:
            fail += 1
        if i < total:
            time.sleep(DELAY_S)

    print(f"\nDone: {ok} snapped, {fail} skipped/failed (build_routes.py will fall back to gpx-enriched/)")


if __name__ == "__main__":
    main()
