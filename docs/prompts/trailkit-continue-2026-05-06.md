# TrailKit — Developer Brief for OC

## Project

**TrailKit** is a Wienerwald MTB Explorer — a React PWA that displays 150 mountain bike routes scraped from wienerwald.info, lets the user track rides, filter routes, and get a suggested route chain based on start point + time budget.

**Stack:** React 18 · Vite 6 · MapLibre GL v5 · Dexie 4 (IndexedDB) · Python build scripts

---

## Repo layout

```
trailkit/
├── src/
│   ├── App.jsx                  — top-level state + layout
│   ├── components/
│   │   ├── Map.jsx              — MapLibre GL (always mounted)
│   │   ├── Header.jsx           — "Ich will fahren" button
│   │   ├── SuggestionFlow.jsx   — route suggestion panel
│   │   ├── RouteList.jsx        — left sidebar (150 routes + filters)
│   │   ├── RouteDetail.jsx      — right panel for selected route
│   │   ├── FilterBar.jsx        — difficulty/distance/duration filters
│   │   ├── CoverageStats.jsx
│   │   ├── RideHistory.jsx
│   │   └── Settings.jsx
│   ├── services/
│   │   └── suggest.js           — pure suggestion engine (chains via connectivity)
│   ├── stores/
│   │   └── rideStore.js         — Dexie IndexedDB (ride history)
│   ├── hooks/
│   │   ├── useRoutes.js         — loads routes.json + connectivity.json
│   │   └── useRides.js          — ride CRUD
│   ├── utils/
│   │   ├── geo.js               — haversine, bbox, routesNearPoint
│   │   ├── filters.js           — applyFilters, sortRoutes
│   │   └── export.js            — GPX/KML generation + download
│   ├── i18n/de.js               — all German UI strings
│   └── styles/tokens.css        — dark theme CSS custom properties
├── scripts/
│   └── build_routes.py          — converts scraper JSON+GPX → src/data/
├── src/data/
│   ├── routes.json              — 150 routes with GeoJSON geometries (3.3 MB)
│   └── connectivity.json        — which routes connect within 100 m
└── docs/prompts/                — this file
```

---

## Data pipeline

Route data originates from the `bike-routes` scraper repo (`/Users/simongraf/projects/bike-routes`):
- `data/ww-info/routes/*.json` — one JSON per route
- `data/ww-info/gpx-enriched/*.gpx` — full trackpoints

After new scraper data:
```bash
python scripts/build_routes.py
# → src/data/routes.json + src/data/connectivity.json
```

---

## Running locally

```bash
npm run dev          # http://localhost:5173
```

Vite resolves `src/data/routes.json` and `src/data/connectivity.json` at build time (static imports in `useRoutes.js`). Run the build script before dev if data is stale.

---

## Current state (as of 2026-05-06)

### Map (Map.jsx)
- MapLibre GL v5 — WebGL support check bypassed (`useState(true)` + try/catch on init); `maplibregl.supported()` returns false on ungoogled-chromium despite working WebGL
- Stale closure fix: `onMapClick` and `onRouteClick` use `useRef` pattern so map event handlers always call the latest prop
- Line widths: zoom-interpolated
  - Normal: zoom 9 → 4 px, zoom 15 → 14 px
  - Highlighted: zoom 9 → 6 px, zoom 15 → 20 px
- Map background: `raster-saturation: -0.4`, `raster-brightness-max: 0.9`, `raster-opacity: 0.8`
- Selected route: gold color `#d4a853` + white glow layer (`routes-selected-glow`) with `line-blur: 4`
- Tile layer switch also updates saturation paint property (gelande: −0.4, satellit: −0.6)

### SuggestionFlow (SuggestionFlow.jsx)
- Opens as `position: absolute; inset: 0` full-screen overlay — **see Bug #1 below**
- Inputs: start point (map click or dropdown), time budget (30 min–6 h), min distance (0–30 km, step 2), difficulty, prefer unridden
- Results: up to 5 route chains sorted by score, with GPX export per chain
- On result: calls `onHighlightRoutes(chain[0].ids)` — highlights first result only
- Starting point dropdown currently lists ALL unique `start_point` values from route data — too many, needs curation (see Feature #6)

### suggest.js
- Pure function: `suggestRoutes({ routes, connectivity, rideHistory, startPoint, endPoint, timeBudgetMinutes, minDistanceKm, difficulty, preferUnridden, maxResults })`
- Finds routes within 10 km of start point, walks connectivity graph up to depth 5, ranks by score (unridden bonus, loop bonus, time fit)

### rideStore.js (Dexie)
- Table: `rides` — `{ id, routeId, riddenAt, notes, duration, distance }`
- Exports: `addRide`, `updateRide`, `deleteRide`, `getAllRides`, `getRidesForRoute`, `getRiddenRouteIds`, `getRideCount`

---

## Features to implement

### Bug #1 — SuggestionFlow layout (CRITICAL)

**Problem:** SuggestionFlow is a full-screen overlay. The map is invisible while the user browses suggestions. Map-click to set start point is blocked.

**Fix:** Convert SuggestionFlow to a right-side panel (~340 px wide), same layout pattern as `RouteDetail`. The map stays fully visible. When suggestions are computed, highlighted routes show on the map behind the panel.

In `App.jsx`, SuggestionFlow currently renders as:
```jsx
{view === 'suggest' && <SuggestionFlow ... />}
```
Place it as a sibling to `RouteDetail` in the right column. The map should remain interactive.

Also fix: when user clicks a different result card in SuggestionFlow, call `onHighlightRoutes` with that chain's route IDs, updating the map highlight.

---

### Feature #2 — Save planned routes

Add the ability to save a suggested route chain as a named "Plan".

**Store** — add `plans` table to the existing Dexie database in `rideStore.js`:
```js
plans: '++id, name, createdAt'
// fields: id, name (string), routeIds (array), totalDurationMinutes, totalDistanceKm, totalElevationGain, createdAt
```

**UI in SuggestionFlow results:** Each result card gets a "Speichern" button. On click:
1. Show an inline text input pre-filled with an auto-generated name (e.g. `"Anninger Trail → Bach Trail → Augustiner Trail"` — first 3 route titles joined with ` → `, truncated at ~60 chars)
2. User can edit the name
3. "Bestätigen" saves to Dexie; field disappears, button changes to "Gespeichert ✓"

**Pläne view** — add "Pläne" button to `Header.jsx` (alongside Stats, History, Settings). New `Plans.jsx` component:
- Lists saved plans (most recent first)
- Each plan: name, total distance + duration, route count
- Click → highlights routes on map via `onHighlightRoutes`
- "GPX Export" button per plan (use existing `downloadChainGPX` from `export.js` — needs to fetch full route objects from `allRoutes` by ID)
- "Löschen" button (with confirm)

**Hooks** — add `usePlans()` in `useRides.js` (same pattern as `useRides`).

---

### Feature #3 — "Ich will fahren" — replace Zeitbudget with km range slider

**Remove** the "Zeitbudget" (time budget) slider entirely from `SuggestionFlow.jsx` and from `suggestRoutes()` in `suggest.js`. Remove `timeBudgetMinutes` and `timeTolerance` from the suggestion engine — time is too hard to estimate and not how users think about rides.

**Replace with a single dual-handle km range slider** (min km ↔ max km):
- Min: 0 km, Max: 80 km, step: 2, default: min=0, max=40
- Use two `<input type="range">` overlaid (standard CSS trick for dual-handle range) OR a simple two-row approach with min/max sliders stacked — both must update `[minKm, maxKm]` state
- Label: `"Streckenlänge — {minKm}–{maxKm} km"` (or `"beliebig"` if min=0 and max=80)
- Pass `minDistanceKm` and `maxDistanceKm` to `suggestRoutes()`
- In `suggest.js`, filter: `r.distance_km >= minDistanceKm && (maxDistanceKm >= 80 || r.distance_km <= maxDistanceKm)`

Also remove the separate `minDist` state/slider already added in the last session — the new range slider replaces both.

---

### Feature #4 — TrailKit title → home navigation

In `Header.jsx`, the "TrailKit" wordmark is a plain `<span>`. Make it a `<button className="btn-ghost">` that calls a new `onHomeClick` prop. In `App.jsx`, wire `onHomeClick={() => setView('map')}`. Style: same font/weight as the current span, no underline, cursor pointer.

---

### Bug #2 — Sidebar overflow / invisible buttons

The route list sidebar (`position: absolute; top: 0; left: 0; bottom: 0; width: 320px`) has layout issues:
- The last visible element in `FilterBar` overflows onto the map (its bottom edge is clipped by the map)
- A button at the bottom of the sidebar (probably a "reset filters" or similar) is hidden

**Fix:**
1. Ensure the sidebar is `display: flex; flex-direction: column; overflow: hidden` at the top level
2. `FilterBar` should not overflow — if it is taller than available space, make it scrollable: `overflow-y: auto` on the FilterBar container
3. `RouteList` below FilterBar should take `flex: 1; overflow-y: auto` so it scrolls independently
4. Add `className` attributes to key layout divs (`filterbar`, `route-list`, `sidebar`, `map-container`, etc.) so they can be targeted in DevTools without nth-child selectors

---

### Feature #5 — Main page FilterBar: km range slider

`FilterBar.jsx` currently has separate `minDist` / `maxDist` inputs (number inputs or sliders). Replace with the same dual-handle km range slider pattern as Feature #3:
- Same visual style, same range (0–80 km, step 2)
- Label: `"Distanz — {minDist}–{maxDist} km"`
- Update `filters.minDist` and `filters.maxDist` in App state via `onChange`
- `applyFilters` in `filters.js` already uses `minDist`/`maxDist` — no change needed there

---

### Feature #6 — Curated starting points

The `SuggestionFlow` dropdown for starting point currently lists every unique `start_point` string from `routes.json` (100+ entries, raw place names from the scraper, inconsistent formatting).

**Replace with a curated static list of max 20 logical starting points** with clean area names and coordinates. Hardcode this list directly in `SuggestionFlow.jsx` (no build script needed):

```js
const CURATED_STARTS = [
  { label: 'Wien / Dornbach',         coords: [16.268, 48.232] },
  { label: 'Wien / Liesing',          coords: [16.308, 48.136] },
  { label: 'Wien / Neuwaldegg',       coords: [16.278, 48.248] },
  { label: 'Wien / Perchtoldsdorf',   coords: [16.270, 48.116] },
  { label: 'Klosterneuburg',          coords: [16.325, 48.305] },
  { label: 'Korneuburg',              coords: [16.333, 48.349] },
  { label: 'Mödling',                 coords: [16.289, 48.086] },
  { label: 'Baden',                   coords: [16.232, 48.001] },
  { label: 'Pressbaum',               coords: [15.992, 48.183] },
  { label: 'Purkersdorf',             coords: [16.178, 48.207] },
  { label: 'Mauerbach',               coords: [16.174, 48.243] },
  { label: 'Tulbing / Tulbinger Kogel', coords: [15.943, 48.267] },
  { label: 'Kaltenleutgeben',         coords: [16.202, 48.096] },
  { label: 'Gumpoldskirchen',         coords: [16.282, 48.053] },
  { label: 'Alland',                  coords: [16.063, 48.042] },
  { label: 'Heiligenkreuz',           coords: [16.127, 48.052] },
  { label: 'Perchtoldsdorf',          coords: [16.270, 48.116] },
  { label: 'Gaaden',                  coords: [16.176, 48.069] },
  { label: 'Hinterbrühl',             coords: [16.249, 48.076] },
  { label: 'Wienerwald / Mitte',      coords: [16.100, 48.180] },
]
```

Coordinates are approximate — fine-tune to nearest logical trailhead. When user selects a label, call `onStartPointSet(coords)` directly (no need to match against route data). Remove the current `startOptions` derivation from route data.

---

### Feature #3 — i18n for new strings

Add to `src/i18n/de.js`:
```js
plaene: 'Pläne',
speichern: 'Speichern',
gespeichert: 'Gespeichert',
bestaetigen: 'Bestätigen',
planLoeschen: 'Plan löschen',
keinPlan: 'Noch keine Pläne gespeichert.',
planName: 'Planname',
```

---

## Code conventions

- Inline styles only (no CSS modules, no Tailwind)
- Plain JS/JSX — no TypeScript
- All user-facing text in German via `t()` from `src/i18n/de.js`
- Dexie 4 API — see existing `rideStore.js` for pattern
- Even pixel values for sizes
- No comments unless the why is non-obvious
- No console.log in production paths
