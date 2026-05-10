# Session prompt — Map-match GPX tracks to OSM via Valhalla

Paste this at the start of a new Claude Code session in `/Users/simongraf/projects/trailkit`.

---

## What we are doing

Trailkit is a React MTB route-planning app for the Wienerwald (Vienna Woods).
We are on branch **feature-brouter**. The previous session implemented Valhalla-based
route planning. The next task is **B: map-match all GPX tracks to OSM via Valhalla
`/trace_route`** so that the stored GPX geometry aligns with OSM path geometry.

### The problem

Two geometry sources are visible simultaneously on the map:
- **GPX route lines** — stored in `src/data/routes.json`, built from enriched GPX files.
  Low-res (coarse GPS sampling), zig-zaggy, sometimes offset 5–15 m from OSM.
- **Valhalla planned route** — fetched live from `valhalla1.openstreetmap.de`, derived
  from OSM geometry, smooth and accurate.

When users design routes in planner mode, both are visible at once and look inconsistent.
The fix is to replace GPX geometry in `routes.json` with Valhalla-snapped geometry.

### The plan

Write a Python script `scripts/snap_routes_to_osm.py` that:
1. Reads every enriched GPX file from
   `/Users/simongraf/projects/bike-routes/data/ww-info/gpx-enriched/`
2. Sends the trackpoints to `https://valhalla1.openstreetmap.de/trace_route`
   (Valhalla map-matching endpoint, free, no API key)
3. Gets back OSM-snapped geometry (precision-6 polyline)
4. Writes snapped GPX files to a new folder `gpx-snapped/` next to `gpx-enriched/`
5. After snapping, re-run `build_routes.py` pointing at `gpx-snapped/` instead of
   `gpx-enriched/` so `src/data/routes.json` gets the clean geometry

### Valhalla trace_route API

```
POST https://valhalla1.openstreetmap.de/trace_route
Content-Type: application/json

{
  "shape": [
    {"lat": 48.123, "lon": 16.456, "type": "via"},
    ...
  ],
  "costing": "bicycle",
  "costing_options": {
    "bicycle": {
      "bicycle_type": "Mountain",
      "use_trails": 1.0,
      "use_roads": 0.0,
      "use_hills": 1.0,
      "avoid_bad_surfaces": 0.0
    }
  },
  "shape_match": "map_snap",
  "format": "json"
}
```

Response: same shape as `/route` — `trip.legs[].shape` is precision-6 encoded polyline.
Decode with the same `decodePolyline6` logic already in `src/utils/valhallaRouter.js`.

### Key constraints

- Valhalla public instance rate-limits aggressively. Send max ~500 points per request
  (sample if track has more). Add 1–2 s delay between routes.
- If a route fails (trail not in OSM, rate-limit, etc.) → keep original GPX, log warning.
  Do NOT fail the whole batch.
- Some routes are loops; start/end at same point. Handle gracefully.
- The GPX files use explicit `<trkpt lat="..." lon="..."></trkpt>` closing tags
  (not self-closing `<trkpt/>`). Write snapped GPX the same way.

### Project layout

```
trailkit/
  scripts/
    build_routes.py        # reads gpx-enriched/, writes src/data/routes.json
    build_trail_network.py # reads routes.json, writes trail_network.json
    snap_routes_to_osm.py  # NEW — to be written
  src/
    data/
      routes.json          # built by build_routes.py
      trail_network.json   # built by build_trail_network.py
    utils/
      valhallaRouter.js    # has decodePolyline6() for reference

/Users/simongraf/projects/bike-routes/data/ww-info/
  routes/                  # one JSON per route (metadata + slug)
  gpx-enriched/            # source GPX files used by build_routes.py
  gpx-snapped/             # NEW — output of snap_routes_to_osm.py
```

### build_routes.py — relevant constant to change after snapping

```python
GPX_DIR = DATA_DIR / "gpx-enriched"   # ← change to "gpx-snapped" after script runs
```

### After snapping

1. Run `python scripts/snap_routes_to_osm.py`
2. Check a few snapped GPX files visually (QGIS or geojson.io)
3. Update `GPX_DIR` in `build_routes.py` to `gpx-snapped`
4. Run `python scripts/build_routes.py`
5. Run `python scripts/build_trail_network.py`
6. `npm run build` in trailkit/, verify routes look clean on the map
7. Commit everything on `feature-brouter`

### Open questions to resolve at start of new session

- Does `/trace_route` work for MTB paths in the Wienerwald or does it fall back to roads?
  Test with one known trail (e.g. Fun-Line) before batch-processing all.
- What sampling interval should we use? Track density varies: some have 1 point/3 m,
  others 1 point/30 m. Target: ~200–400 points per request.
