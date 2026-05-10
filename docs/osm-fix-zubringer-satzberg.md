# Fix: Zubringer Satzberg-Kreuzeichenwiese not routable in Valhalla

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
