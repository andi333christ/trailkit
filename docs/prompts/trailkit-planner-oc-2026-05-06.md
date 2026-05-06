# TrailKit — Waypoint Route Planner with Trail Topology Graph

## Project

TrailKit is a Wienerwald MTB explorer. React 18 + Vite 6 + MapLibre GL v5 +
Dexie 4. 150 named MTB routes from wienerwald.info. German UI throughout.
Code conventions: inline styles only, plain JS/JSX (no TypeScript, no CSS
modules), all strings via t() from src/i18n/de.js, even pixel values, no
console.log in production paths.

## Repo layout

```
src/
  App.jsx                    — top-level state + layout
  components/
    Map.jsx                  — MapLibre GL v5 (always mounted)
    BrushPanel.jsx           — right-side plan panel (chain of routes)
    ElevationProfile.jsx     — SVG elevation chart
    Header.jsx               — nav + "Ich will fahren" button
  utils/
    geo.js                   — haversine, mergeGeometries, etc.
    elevation.js             — computeElevationProfile(routes[])
    export.js                — downloadChainGPX
  stores/
    rideStore.js             — Dexie (rides + plans tables)
  data/
    routes.json              — 150 routes, GeoJSON LineString [lon,lat] coords
    connectivity.json        — route adjacency (100m threshold)
  i18n/de.js                 — all German strings
scripts/
  build_routes.py            — builds routes.json + connectivity.json from GPX
```

## Current brush mode (what we're replacing)

App.jsx tracks `brushMode` (bool) + `brushChain` (array of whole route objects).
When `brushMode=true`, clicking a map route feature calls `handleRouteClick` which
checks `connectivity.json` and appends to chain if connected. Whole named routes
only — no partial segments, no drag, no waypoints.

`BrushPanel.jsx` shows the chain list, elevation profile (via
`computeElevationProfile`), save/export buttons.

`Map.jsx` renders routes as GeoJSON on layer `routes-simplified`. Has
mousemove hover already. No drag or snap-preview logic.

## What we're building

Replace the click-chain brush mode with a Strava/Komoot-style waypoint
planner:

1. User enables planning mode (button in header)
2. Cursor moves near a trail → nearest trail edge snaps/glows as preview
3. User clicks → drops a waypoint (snapped to nearest point on trail graph)
4. After 2nd waypoint: auto-route between consecutive waypoints via Dijkstra
   on the trail graph → path highlighted on map
5. More waypoints = route threads through all of them in order
6. Supports partial segment selection — path uses only the portion of a named
   route that lies between two waypoints
7. Elevation profile updates live, now with real elevation from GPX
8. Save to plan + GPX export (existing functionality, adapted)
9. Undo button in panel removes last waypoint and re-routes

---

## Phase 1: Python — build trail_network.json

Add `scripts/build_trail_network.py`. Output: `src/data/trail_network.json`.

### Fix elevation bug first

In the existing `build_routes.py`, line ~339:
```python
coords = [[p[0], p[1]] for p in pts]
```
Change to:
```python
coords = [[p[0], p[1], p[2]] if len(p) >= 3 and p[2] is not None
          else [p[0], p[1]] for p in pts]
```
Apply the same fix to `geometry_simplified`. This preserves elevation from GPX
in `routes.json` geometry coordinates.

### Trail network build algorithm

Input: same GPX files as `build_routes.py`
(`~/bike-routes/data/ww-info/gpx-enriched/*.gpx`) + routes.json slug list

**Step 1** — Load all trackpoints WITH elevation as `[(lon, lat, ele_or_None)]`

**Step 2** — Find junction points

For every pair of routes whose bboxes overlap (spatial index, grid cell =
0.001° ≈ 80m, same approach as `build_routes.py`), find all point pairs within
`JUNCTION_THRESHOLD = 8m`. A junction = a point on route A that is within 8m
of a point on route B. Snap both points to their midpoint. Collect all junction
coords.

**Step 3** — Build nodes

Nodes = all route endpoints + all junction midpoints.
Deduplicate: snap nodes within 5m of each other to single node.
Node id: `"n_"` + first 8 chars of `md5(f"{lon:.6f},{lat:.6f}")`.
Node: `{ id, coords: [lon, lat] }`

**Step 4** — Split routes into edges

For each route, walk its trackpoints. Whenever the current trackpoint is
within 8m of any node (other than the edge's own start node), close the
current edge and start a new one.

Each edge:
- `id`: `"e_"` + first 8 chars of `md5(from_node_id + to_node_id + source_route_id)`
- `from_node`: node_id
- `to_node`: node_id
- `source_route_id`: slug
- `geometry`: `[[lon, lat, ele_or_null], ...]` — the trackpoints of this segment
- `distance_m`: haversine sum along segment
- `ele_gain_m`: cumulative positive elevation change (int)
- `ele_loss_m`: cumulative negative elevation change (int, positive number)
- `bidirectional`: true for loops (use route `is_loop` field), false otherwise

Minimum edge length: discard edges < 50m (noise from junction clustering).

**Step 5** — Build node→edges index

For each node, collect all edge ids where node appears as `from_node` or `to_node`.

### Output format `trail_network.json`

```json
{
  "nodes": {
    "n_abc12345": { "coords": [16.123, 48.456] }
  },
  "edges": {
    "e_abc12345": {
      "from": "n_...",
      "to": "n_...",
      "source_route_id": "allander-mtb-runde",
      "geometry": [[16.123, 48.456, 320.5], ...],
      "distance_m": 1234,
      "ele_gain_m": 56,
      "ele_loss_m": 12,
      "bidirectional": true
    }
  },
  "node_edges": {
    "n_abc12345": ["e_...", "e_..."]
  }
}
```

Print build stats: node count, edge count, avg edges per node, routes with
zero edges (isolated), total graph distance km.

---

## Phase 2: Frontend

### New files

**`src/utils/trailSnap.js`**

```js
export function snapToTrail(lngLat, trailNetwork, edgeBBoxIndex, maxDistM = 150)
```
Returns `{ nodeId, edgeId, snappedCoords: [lon,lat], distM }` or `null`.

Algorithm:
- For each edge in `trailNetwork.edges`, use `edgeBBoxIndex` to skip edges
  whose bbox is > 0.01° away from `lngLat`.
- For remaining edges, find nearest point on the edge's geometry to `lngLat`
  (project lngLat onto each segment, clamp t to [0,1]).
- Track globally nearest point across all edges.
- Return the nearest node (`from_node` or `to_node` of nearest edge, whichever
  endpoint is closer to the projected point).

```js
export function buildEdgeBBoxIndex(trailNetwork)
```
Returns `Map<edgeId, [minLon, minLat, maxLon, maxLat]>` for fast filtering.
Build once on load, pass into `snapToTrail`.

---

**`src/utils/trailRouter.js`**

```js
export function dijkstra(network, nodeEdgesIndex, fromNodeId, toNodeId)
```
Standard Dijkstra on the trail graph. Edge weight = `edge.distance_m`.
For `bidirectional` edges, traverse both directions (from→to and to→from).

Returns:
```js
{ edgeIds: string[], nodeIds: string[], distanceM: number,
  eleGainM: number, eleLossM: number }
```
or `null` if no path found (disconnected graph).

`nodeEdgesIndex`: `Map<nodeId, edgeId[]>` built from `network.node_edges`.

---

**`src/hooks/useTrailNetwork.js`**

```js
import trailNetworkData from '../data/trail_network.json'

export function useTrailNetwork() {
  // returns { network, edgeBBoxIndex, ready }
  // memoizes edgeBBoxIndex on first call via useMemo
}
```

---

### Changes to existing files

**`App.jsx`**

Replace `brushMode`/`brushChain` state with planner state:

```js
const [plannerMode, setPlannerMode] = useState(false)
const [waypoints, setWaypoints] = useState([])
// waypoint: { id: string, nodeId: string, coords: [lon, lat] }
const [plannedPath, setPlannedPath] = useState(null)
// plannedPath: {
//   segments: Array<{ edgeId, geometry, source_route_id }>,
//   totalDistM, totalEleGainM, totalEleLossM
// }
const [snapPreview, setSnapPreview] = useState(null)
// snapPreview: { coords: [lon, lat] } | null
```

`handlePlannerClick(lngLat)`:
1. `snapToTrail(lngLat, network, edgeBBoxIndex)` → snap result
2. If null: show brief toast "Kein Weg in der Nähe" (set state, auto-clear 2s)
3. Add waypoint to `waypoints[]`
4. If `waypoints.length >= 2`: run `dijkstra` for each consecutive pair,
   merge results into `plannedPath`
5. `setHighlightedRouteIds` with all unique `source_route_id` values from path

`handlePlannerMouseMove(lngLat)`:
- `snapToTrail(lngLat, network, edgeBBoxIndex)` → `setSnapPreview(result)`
- Throttle to ~60 fps (use `useRef` timestamp check)

`handleWaypointRemove(id)`: filter waypoints, re-route remaining.
`handleWaypointClear()`: clear all.
`handlePlannerClose()`: `plannerMode=false`, clear waypoints + path + snapPreview.

Elevation: compute via `computePathElevationProfile(plannedPath.segments)`.

---

**`Map.jsx`**

New props:
```js
plannerMode: bool
plannedPath: object | null
planWaypoints: Array<{id, coords}>
snapPreview: { coords: [lon,lat] } | null
onPlannerClick(lngLat)
onPlannerMouseMove(lngLat)
```

New MapLibre sources + layers (add in `'load'` handler):

```
Source 'plan-path'       — GeoJSON FeatureCollection of LineStrings
Layer  'plan-path-line'  — line, color #d4a853 (accent), width 6 at zoom 12,
                           opacity 0.9, line-cap round, line-join round
                           Renders above 'routes-simplified'

Source 'plan-waypoints'  — GeoJSON FeatureCollection of Points
Layer  'plan-waypoints-circle' — circle, radius 8, color #d4a853, stroke 2 #fff

Source 'snap-preview'    — GeoJSON Point (single feature or empty)
Layer  'snap-preview-circle' — circle, radius 5, color #fff, opacity 0.85,
                               stroke 1.5 #d4a853
```

When `plannerMode=true`:
- Map cursor = `'crosshair'`
- `map.on('mousemove')` → call `onPlannerMouseMove(lngLat)` (throttled)
- `map.on('click')` → call `onPlannerClick(lngLat)` (suppress normal route click)

Update source data reactively:
- `plan-path`: build LineString features from `plannedPath.segments[].geometry`
- `plan-waypoints`: Point features from `planWaypoints[].coords`
- `snap-preview`: single Point from `snapPreview.coords` or empty collection

Use `useEffect` + `useRef` pattern for each (same stale-closure pattern already
used for `onMapClick` and `onRouteClick`).

---

**`BrushPanel.jsx`**

New props (replacing chain-based props):
```js
waypoints, plannedPath, elevationData,
onRemoveWaypoint, onClear, onSave, onClose
```

Waypoint list: numbered list, each with a remove button.
Stats: from `plannedPath` totals (distanceM→km, eleGainM, eleLossM).
Undo button: `onRemoveWaypoint(waypoints[waypoints.length - 1].id)`.
Warning per segment if `dijkstra` returned null: "Keine Verbindung zwischen
Wegpunkt N und N+1" inline in the list.

Keep: `ElevationProfile`, save/export footer, empty hint.

Hint when empty: `t('wegpunktSetzen')`.

---

**`src/utils/elevation.js`**

Add:
```js
export function computePathElevationProfile(segments)
```
`segments`: `Array<{ geometry: [[lon, lat, ele_or_null], ...] }>`

Concatenate all segment geometries (drop duplicate junction coord between
consecutive segments). Same output format as `computeElevationProfile`:
`{ points, totalDistKm, totalEleGain, totalEleLoss }`.

Keep existing `computeElevationProfile` unchanged (used by Plans view).

---

**`src/utils/export.js`**

Add:
```js
export function downloadPathGPX(segments, name)
```
`segments`: `Array<{ geometry: [[lon, lat, ele_or_null], ...], source_route_id }>`

Writes one GPX track with all coords in order. Track name = `name`.
Include `<ele>` tags when elevation is present in coords.

---

**`src/i18n/de.js`** — add keys:
```js
planungsmodus: 'Planungsmodus',
wegpunktSetzen: 'Klicke auf einen Weg, um einen Wegpunkt zu setzen.',
keinWegInDerNaehe: 'Kein Weg in der Nähe.',
keineVerbindung: 'Keine Verbindung',
wegpunktEntfernen: 'Wegpunkt entfernen',
rueckgaengig: 'Rückgängig',
```

---

## What to NOT change

- `ElevationProfile.jsx` — no changes; just feed it the new profile data
- `FilterBar.jsx`, `RouteList.jsx`, `RouteDetail.jsx` — untouched
- `SuggestionFlow.jsx` — untouched
- `Plans.jsx` — untouched
- `rideStore.js` plans table — untouched
- `connectivity.json` — keep generating (still used by SuggestionFlow)

---

## Open questions (confirm with Simon before implementing)

1. **Planner vs existing brush coexistence** — completely replace the old
   click-brush mode, or keep both (old for quick whole-route chaining, new for
   precision routing)?

2. **trail_network.json size** — with ~150 routes × ~200 trackpoints each,
   the JSON could be 2–4 MB on top of existing 3.3 MB routes.json. Accepted,
   or implement lazy-load?

---

## Delivery checklist

**Python:**
- [ ] `build_routes.py`: elevation preserved in `geometry.coordinates`
- [ ] `scripts/build_trail_network.py`: runs without error, produces valid JSON
- [ ] `trail_network.json` generated: > 0 nodes, > 0 edges, build stats printed

**Frontend:**
- [ ] `src/utils/trailSnap.js`: `snapToTrail` + `buildEdgeBBoxIndex` exported
- [ ] `src/utils/trailRouter.js`: `dijkstra` exported, handles disconnected graph (returns null)
- [ ] `src/hooks/useTrailNetwork.js`: imports + memoizes `trail_network.json`
- [ ] `Map.jsx`: plan-path, plan-waypoints, snap-preview sources+layers added; planner mousemove/click handled; cursor changes in planner mode
- [ ] `App.jsx`: planner state replaces brush state; snap+route on click; path recomputes on each new waypoint
- [ ] `BrushPanel.jsx`: renders waypoints list, path stats, undo button; works with new props
- [ ] `elevation.js`: `computePathElevationProfile` added
- [ ] `export.js`: `downloadPathGPX` added
- [ ] No TypeScript, no CSS modules, no Tailwind, German strings via `t()`
- [ ] `npm run dev` starts without errors after running `build_trail_network.py`
