# feature-brouter — What we built and why

Branch off `feature-iwf`. Goal: replace the custom Dijkstra trail-network router with
a production-quality routing engine that eliminates routing gaps and zig-zag artifacts.

---

## Why we switched to Valhalla

The original router (`feature-iwf`) ran Dijkstra on a custom trail-network graph built
from our GPX files. It worked well on-trail but had two hard problems:

1. **Routing gaps** — when waypoints landed outside the trail network (parking, road
   access, trailheads), the router returned null and showed no route at all.
2. **Zig-zag artifacts** — parallel topology edges (e.g. fun-line + fun-line-mit-zufahrt)
   caused the router to bounce between them, creating a visually messy route.

We investigated three OSM routing APIs (OSRM, BRouter, Valhalla). OSRM ignores MTB
paths. BRouter's public server blocks non-browser requests. Valhalla
(`valhalla1.openstreetmap.de`) works, supports `bicycle_type: Mountain`, routes through
MTB paths in the Weidlingbach trailpark (Fun-Line, Flow-Line, etc.), and has a free
elevation API. No API key required.

**Trade-off accepted:** Valhalla cannot prefer unpaved trails over shorter paved paths —
its cost model has no "prefer unpaved" option. `shortest: true` (distance optimization)
partially mitigates this, but a paved shortcut still wins over a longer trail. Users can
work around this by placing more waypoints.

---

## What was built

### 1. Valhalla routing client (`src/utils/valhallaRouter.js`)

- `valhallaRoute(waypoints)` — POSTs to `/route`, decodes precision-6 polyline,
  returns `{ coords, elevationProfile, distanceM, eleGainM, eleLossM }`.
- Elevation via separate `/height` POST (up to 500 sampled points), which returns
  `range_height: [[dist_m, ele_m], ...]`. Non-blocking: route works even if height fails.
- Costing: `bicycle / Mountain`, `use_trails: 1.0`, `use_roads: 0.0`,
  `avoid_bad_surfaces: 0.0`, `shortest: true`.

### 2. Simplified planner in `App.jsx`

- Waypoints are `{ id, coords: [lon, lat] }` — no snapping, no trail-network lookup.
- `rerouteAllWaypoints(wps)` — async, calls `valhallaRoute`, updates `plannedPath`.
- Waypoints can be dragged (existing MapLibre marker drag) → reroutes on dragend.
- Waypoints can be reordered in the BrushPanel list via drag-and-drop.

### 3. Route drag-reroute (`Map.jsx` + `App.jsx`)

Komoot-style: hover over planned route line → grab cursor + snap dot appears.
Click and drag → dashed preview lines show the new segment. On release, a new
intermediate waypoint is inserted at the correct position in the waypoints array and
Valhalla reroutes.

Implementation:
- `closestIdxOnLine(routeCoords, point)` — finds nearest point index on route geometry.
- `findInsertAfterIdx(routeCoords, waypoints, dragIdx)` — maps drag position to
  waypoint interval by comparing drag index to each waypoint's route index.
- Sources: `route-drag-handle` (circle), `route-drag-preview` (dashed lines).
- `map.dragPan.disable()` during drag to prevent map panning.
- `routeDragOccurred` flag suppresses the subsequent `click` event.

### 4. Elevation profile hover → map marker

When hovering over the elevation chart in BrushPanel, a moving orange/white circle
tracks the corresponding position on the planned route on the map.

- `ElevationProfile` fires `onHoverDistKm(distKm | null)` via new prop.
- `handleElevationHover(distKm)` in App computes `fraction = distKm / totalDistKm`,
  indexes into `plannedPath.segments[0].geometry` to get `[lon, lat]`.
- Map renders `elevation-hover-dot` circle layer on `elevation-hover` source.

### 5. Direction arrows on all routes (`Map.jsx`)

Symbol layer `route-arrows` on the existing `routes` source (no separate source needed).
`symbol-placement: 'line'` makes `›` characters follow line direction.
Data-driven text: `›T` for MTB downhill trails, `›` for all others.
Size 28px, slight dark halo for legibility on satellite imagery.

`isTrail` boolean property added to every route feature so the paint expression can
distinguish trail vs non-trail without a separate data fetch.

### 6. Elevation profile in RouteDetail sidebar

`computeElevationProfile([route])` called in RouteDetail via `useMemo`.
Shows "Höhenprofil" section with the ElevationProfile chart for any route that has
elevation data in its GPX geometry (z-coordinate). Graceful fallback: "Keine Höhendaten
verfügbar" if elevation is absent.

---

## Done: map-matching GPX to OSM (branch `feature/snap-routes-osm`)

All 151 GPX tracks have been snapped to OSM geometry via `scripts/snap_routes_to_osm.py`.
Snapped files live in `gpx-snapped/`; `build_routes.py` prefers them over `gpx-enriched/`.

**Snap fallback chain per route:**
1. Valhalla `trace_route` with MTB costing (best quality)
2. Pedestrian costing if MTB snap fails or returns <40% of input length
3. Chunked pedestrian (60-pt windows) if single-pass is still too short
4. If all three fail length check: file deleted, `build_routes.py` falls back to enriched GPX

**Known routing gap:** 26 routes used pedestrian fallback because their trails aren't
tagged `bicycle=yes` / `mtb:scale` in OSM. These display correctly (snapped geometry),
but Valhalla live routing (drag-reroute in planner) routes around them via roads.
Priority cases: Lainzer Tiergarten, Allander MTB-Runde.
Full list + fix instructions: `docs/osm-fix-zubringer-satzberg.md`.

---

## Files changed vs main

| File | Change |
|------|--------|
| `src/utils/valhallaRouter.js` | New — Valhalla API client |
| `src/App.jsx` | Planner rewritten for Valhalla; drag-reroute; elevation hover |
| `src/components/Map.jsx` | Route drag, direction arrows, elevation hover marker |
| `src/components/BrushPanel.jsx` | Passes `onElevationHover` to ElevationProfile |
| `src/components/ElevationProfile.jsx` | `onHoverDistKm` callback prop |
| `src/components/RouteDetail.jsx` | Elevation profile section added |
| `docs/osm-fix-zubringer-satzberg.md` | OSM contribution backlog (routing gaps) |
| `docs/session-prompt-map-matching.md` | Session prompt used for map-matching work |
| `scripts/snap_routes_to_osm.py` | Map-match GPX tracks to OSM via Valhalla |
