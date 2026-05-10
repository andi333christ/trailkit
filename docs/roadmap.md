# Trailkit — Roadmap

Last updated: 2026-05-11

---

## Branch strategy

```
main        ← stable, shippable
dev         ← integration branch, always ahead of main
feature/*   ← feature work, PR into dev
```

New features branch off `dev`, PR back to `dev`. Periodically `dev` → `main`.

---

## Current status

### Done — ready to merge

| Branch | What |
|---|---|
| `feature-brouter` | Valhalla routing, drag-reroute, elevation profile, direction arrows |
| `feature/snap-routes-osm` | All 151 GPX tracks snapped to OSM via Valhalla trace_route + SRTM elevation |

**Immediate action:** `feature/snap-routes-osm` → `feature-brouter` → `dev` → `main`.

---

## Shelved approaches

### Trail-network Dijkstra planner (`docs/prompts/trailkit-planner-oc-2026-05-06.md`)

Built a full trail-topology graph (nodes at junctions, edges = route segments,
Dijkstra routing). Superseded by Valhalla, which offers better routing quality,
handles gaps between named trails, and routes through road/trail combinations
without a custom graph. The `trail_network.json` and `trail_edges.json` build
pipeline is kept (used for connectivity analysis), but the Dijkstra frontend
planner was never shipped.

**Archive:** prompt and build scripts remain in repo for reference. No further work planned.

---

## Next up

### OSM contribution automation

**Goal:** Scan all 151 routes, identify which trail segments are unroutable in
Valhalla bicycle costing (missing `bicycle=yes` / `mtb:scale`), and give Simon
a reviewed, explained list of OSM edits to approve before any changes are made.

**Why:** 26 routes currently use pedestrian fallback for geometry snapping, meaning
Valhalla live routing (drag-reroute in planner) avoids those trails. Fixing OSM
fixes routing permanently and benefits the whole OSM community.

**Proposed workflow:**
1. Script scans each snapped route via `trace_attributes` → collects all OSM way IDs
   used, their current tags, and their Valhalla routable status
2. For each way that blocks bicycle routing: show current tags, explain why Valhalla
   skips it, propose the specific tag change (e.g. `access=unknown` → `access=yes`,
   add `bicycle=yes`)
3. Output a human-readable review table (markdown or HTML) — Simon reviews and
   approves/rejects per-way before anything touches OSM
4. Approved changes can optionally be applied via OSM API (OAuth) or exported as
   JOSM changefile for manual upload

**Sanity checks:**
- Never change tags that have `fixme`, `note`, or `access=private` without explicit approval
- Show the way's relation memberships (is it in a protected area boundary?) before suggesting edits
- Diff view: current tags vs proposed tags, one row per way

**Known priority items** (`docs/osm-fix-zubringer-satzberg.md`):
- Lainzer Tiergarten — ~30+ path ways missing `bicycle=yes`
- Allander MTB-Runde — unnamed rough paths need MTB tagging
- 24 other routes with pedestrian-only segments

---

## Deferred

- **Milestone / launch target** — to be defined in a dedicated session
