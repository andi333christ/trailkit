/**
 * valhallaRouter.js — Route planning via Valhalla (openstreetmap.de free instance).
 * No API key required. Uses bicycle/Mountain profile which respects MTB trails + oneway.
 */

const VALHALLA_URL = 'https://valhalla1.openstreetmap.de/route'

// Decode Valhalla's precision-6 encoded polyline → [[lon,lat], ...]
function decodePolyline6(encoded) {
  let index = 0, lat = 0, lon = 0
  const coords = []
  while (index < encoded.length) {
    let shift = 0, result = 0, b
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lat += (result & 1) ? ~(result >> 1) : result >> 1

    shift = 0; result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lon += (result & 1) ? ~(result >> 1) : result >> 1

    coords.push([lon / 1e6, lat / 1e6])
  }
  return coords
}

/**
 * Route between an ordered list of [lon, lat] waypoints.
 * Returns { coords: [[lon,lat],...], distanceM, eleGainM, eleLossM } or null.
 */
export async function valhallaRoute(waypoints) {
  if (waypoints.length < 2) return null

  const body = {
    locations: waypoints.map(([lon, lat]) => ({ lon, lat, type: 'break' })),
    costing: 'bicycle',
    costing_options: {
      bicycle: {
        bicycle_type: 'Mountain',
        use_trails: 1.0,       // strongly prefer trails
        use_roads: 0.3,        // use roads when needed
        use_hills: 0.8,        // willing to climb
      },
    },
    format: 'json',
    directions_options: { units: 'km' },
  }

  const res = await fetch(VALHALLA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('Valhalla error:', res.status, err)
    return null
  }

  const data = await res.json()
  const trip = data.trip
  if (!trip || trip.status !== 0) return null

  // Collect all leg shapes into one coordinate array
  const allCoords = []
  let distanceM = 0, eleGainM = 0, eleLossM = 0

  for (const leg of trip.legs) {
    const coords = decodePolyline6(leg.shape)
    // Avoid duplicate junction points between legs
    if (allCoords.length > 0) coords.shift()
    allCoords.push(...coords)

    distanceM += leg.summary.length * 1000

    // Valhalla provides max_up_slope/max_down_slope but not cumulative gain.
    // Use maneuver-level elevation if available, else leave 0 for now.
    for (const m of leg.maneuvers || []) {
      if (m.elevation_gain) eleGainM += m.elevation_gain
      if (m.elevation_loss) eleLossM += m.elevation_loss
    }
  }

  return { coords: allCoords, distanceM: Math.round(distanceM), eleGainM, eleLossM }
}
