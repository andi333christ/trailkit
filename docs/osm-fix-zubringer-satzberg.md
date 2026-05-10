# OSM contribution backlog — Wienerwald routing gaps

These are paths the Wienerwald routes follow that are not (or incorrectly) tagged in OSM,
causing Valhalla bicycle routing to avoid them. The routes display correctly in Trailkit
(geometry snapped via pedestrian costing), but live drag-reroute in the planner will
route around them until OSM is fixed.

General fix steps for each item below: open the way on openstreetmap.org, click
**Edit → iD**, add/fix the relevant tag, save with a clear commit message.
Valhalla's public instance updates roughly daily.

---

## Fix: Zubringer Satzberg-Kreuzeichenwiese not routable in Valhalla

## Problem

The trail exists in OSM as relation **12562316** ("Zubringer Satzberg-Kreuzeichenwiese",
operated by Wienerwald Tourismus), but Valhalla's bicycle/Mountain profile skips it because
three of its member ways have blocking tags:

| Way ID | Issue |
|--------|-------|
| 26559565 | `access=unknown` + `fixme=check radroute` |
| 485620075 | `access=unknown` |
| 164448384 | `vehicle=forestry` with no explicit `bicycle=yes` |

## Fix in OSM (browser, no tools needed)

**1. Create an account**
Register at openstreetmap.org (free).

**2. Open each problem way directly**
- openstreetmap.org/way/26559565
- openstreetmap.org/way/485620075
- openstreetmap.org/way/164448384

Click **Edit → Edit with iD**.

**3. Fix ways 26559565 and 485620075**
Select the way on the map. In the tag panel on the left:
- Change `access = unknown` → `access = yes`
- Delete the `fixme` tag (if present)

**4. Fix way 164448384**
Select the way. Add a new tag:
- Key: `bicycle` → Value: `yes`

**5. Save**
Click **Save** (top right). Commit message:
> Fix bicycle access on Zubringer Satzberg-Kreuzeichenwiese: access=unknown→yes, add bicycle=yes to forestry track

**6. Wait ~24 h**
Valhalla's public instance (`valhalla1.openstreetmap.de`) updates from OSM roughly daily.
After the next update the trail will be routable.

---

## Known gap: Lainzer Tiergarten trails not tagged bicycle=yes

**Affected route:** `lainzer-tiergarten-strecke` (23.9 km loop, Wien)

**Symptom:** Valhalla bicycle routing goes 36 km around the park via roads instead of
24 km through it. Drag-reroute in the planner fails in the Tiergarten area.

**Root cause:** The trails inside are mapped in OSM as `highway=path` and `highway=track`
but lack `bicycle=yes`. Valhalla correctly skips them. The Tiergarten does allow cycling
on designated paths — OSM just doesn't reflect this.

**What to tag:** Find path/track ways inside the Lainzer Tiergarten boundary
(relation [1247836](https://openstreetmap.org/relation/1247836)).
For each trail segment that cyclists are permitted on, add:
- `bicycle = yes`
- optionally `mtb:scale = 0` or `1` depending on difficulty

Use the actual Wienerwald info route as reference geometry (our `gpx-enriched/` file
has the correct path). Start at the trailhead near
[Lainzer Tor](https://openstreetmap.org/?mlat=48.166&mlon=16.257).

---

## Known gap: Allander MTB-Runde not tagged as MTB in OSM

**Affected route:** `allander-mtb-runde` (9.6 km loop, Alland)

**Symptom:** Valhalla MTB costing cannot route the loop at all (server timeout).
Snapped using chunked pedestrian costing — geometry is correct but routing won't follow it.

**Root cause:** The trail sections exist in OSM as unnamed rough paths but have no
MTB-specific tags. Valhalla's `bicycle_type: Mountain` profile with `use_roads: 0.0`
cannot find a continuous MTB-tagged path.

**What to tag:** Find the trail segments in the bbox
`lat 48.040–48.058, lon 16.047–16.089`.
For each trail segment:
- Add `bicycle = yes` (if cycling is permitted)
- Add `mtb:scale = 0` / `1` / `2` as appropriate
- If a segment is a proper singletrack: `highway = path` + `surface = ground`

---

## Routes that used pedestrian fallback during snap (OSM MTB tags missing)

These routes snapped correctly via pedestrian costing but Valhalla MTB routing avoids them.
Lower priority than the two above — geometry is fine, only drag-reroute is affected in
trail sections.

| Route slug | Approx area |
|---|---|
| `augustiner-trail` | Kaltenleutgeben |
| `bach-trail` | Baden area |
| `badner-lindkogel-runde` | Baden/Lindkogel |
| `georgenberg-strecke` | Georgenberg |
| `hafnerberg` | Hafnerberg |
| `hameau-strecke` | Hameau/Weidlingbach |
| `haengender-stein-strecke` | Hängender Stein |
| `helenental-strecke` | Helenental |
| `hohe-wand-wiese-strecke` | Hohe Wand Wiese |
| `kahlenbergerdorf-strecke` | Kahlenbergerdorf |
| `kaltenleutgeben-strecke` | Kaltenleutgeben |
| `klammhoehe-strecke` | Klammhöhe |
| `kleine-drei-berge-runde` | Drei Berge |
| `krapfenwaldl-uphill` | Krapfenwaldl |
| `laaben-strecke` | Laaben |
| `laurenzi-strecke` | Laurenzi |
| `mostalm-uphilltrail` | Mostalm |
| `pfalzau-strecke` | Pfalzau |
| `riesenbach-strecke` | Riesenbach |
| `schoepfl-strecke` | Schöpfl |
| `schottenhof-strecke` | Schottenhof |
| `steinwandklamm-strecke` | Steinwandklamm |
| `suedtiroler-uphilltrail` | Süd-Tirol Trail area |
| `thallern-strecke` | Thallern |
| `wilhelminenberg-strecke` | Wilhelminenberg |
| `wolfsgeist-strecke` | Wolfsgeist |
