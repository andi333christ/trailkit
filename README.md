# TrailKit — Wienerwald MTB Explorer

A static web app for exploring the Wienerwald MTB route network. Browse ~150 official routes on a map, track what you've ridden, and get AI-powered route suggestions.

## Setup

```bash
# Install dependencies
npm install

# Generate route data bundle from scraped data
python3 scripts/build_routes.py

# Start dev server
npm run dev

# Build for production
npm run build
```

**Data generation requires:** `~/bike-routes/data/ww-info/` with scraped route JSON + GPX files.

## Features

- **Route browser** with full map, filter bar, difficulty/coverage color modes
- **Route detail** with description, surface, ride logging + GPX export
- **"Ich will fahren"** suggestion engine — chains routes by connectivity
- **Coverage stats** — tracks ridden routes, km, Hm, by difficulty and bike type
- **Ride history** with edit/delete
- **Import/Export** — JSON backup of all ride data
- **3 tile layers** — OpenTopoMap, CartoDB Voyager, ArcGIS Satellite
- **German UI** throughout
- **PWA** — installable, works offline

## Architecture

Static React app. Route data bundle generated at build time by `scripts/build_routes.py`:
- `routes.json` — all metadata + GeoJSON geometries
- `connectivity.json` — which routes connect (full trackpoint proximity)

App: `useRoutes()` hook → `routes.json` | `rideStore` (Dexie/IndexedDB) → ride logs

## Tech

- Vite + React 18 + PWA
- MapLibre GL JS
- Dexie.js (IndexedDB)
- Pure Python build script (no external deps beyond stdlib)
