/**
 * valhallaRouter.js — Route planning via Valhalla (openstreetmap.de free instance).
 * No API key required. Uses bicycle/Mountain profile which respects MTB trails + oneway.
 */

const VALHALLA_BASE = 'https://valhalla1.openstreetmap.de'

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

// Fetch elevations for [[lon,lat],...] coords via Valhalla /height.
// Samples every Nth point to stay under request limits, then interpolates.
async function fetchElevations(coords) {
  const STEP = Math.max(1, Math.floor(coords.length / 500))
  const sampled = coords.filter((_, i) => i % STEP === 0 || i === coords.length - 1)

  const res = await fetch(`${VALHALLA_BASE}/height`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      range: true,
      shape: sampled.map(([lon, lat]) => ({ lon, lat })),
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  // Returns { range_height: [[dist_m, ele_m], ...] }
  return data.range_height || null
}

/**
 * Route between an ordered list of [lon, lat] waypoints.
 * Returns { coords: [[lon,lat],...], elevationProfile: [{distKm, eleM},...], distanceM, eleGainM, eleLossM }
 * or null on failure.
 */
export async function valhallaRoute(waypoints) {
  if (waypoints.length < 2) return null

  const body = {
    locations: waypoints.map(([lon, lat]) => ({ lon, lat, type: 'break' })),
    costing: 'bicycle',
    costing_options: {
      bicycle: {
        bicycle_type: 'Mountain',
        use_trails: 1.0,         // max preference for trails/paths
        use_roads: 0.0,          // max penalty for paved roads
        use_hills: 1.0,          // fully willing to climb
        avoid_bad_surfaces: 0.0, // MTB handles any surface
      },
    },
    shortest: true,              // optimize distance not time — trails are direct, roads go around
    format: 'json',
    directions_options: { units: 'km' },
  }

  const res = await fetch(`${VALHALLA_BASE}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    console.error('Valhalla route error:', res.status, await res.text())
    return null
  }

  const data = await res.json()
  const trip = data.trip
  if (!trip || trip.status !== 0) return null

  const allCoords = []
  let distanceM = 0

  for (const leg of trip.legs) {
    const coords = decodePolyline6(leg.shape)
    if (allCoords.length > 0) coords.shift()
    allCoords.push(...coords)
    distanceM += leg.summary.length * 1000
  }

  // Fetch elevations in parallel — non-blocking: route still works if it fails
  let elevationProfile = null, eleGainM = 0, eleLossM = 0
  try {
    const rangeHeight = await fetchElevations(allCoords)
    if (rangeHeight && rangeHeight.length >= 2) {
      elevationProfile = rangeHeight.map(([distM, eleM]) => ({
        distKm: distM / 1000,
        eleM: Math.round(eleM),
      }))
      for (let i = 1; i < rangeHeight.length; i++) {
        const diff = rangeHeight[i][1] - rangeHeight[i - 1][1]
        if (diff > 0) eleGainM += diff
        else eleLossM += -diff
      }
      eleGainM = Math.round(eleGainM)
      eleLossM = Math.round(eleLossM)
    }
  } catch (e) {
    console.warn('Valhalla /height failed:', e)
  }

  return {
    coords: allCoords,
    elevationProfile,
    distanceM: Math.round(distanceM),
    eleGainM,
    eleLossM,
  }
}
