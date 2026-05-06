/**
 * geo.js — Geometry utilities for TrailKit
 * All coords in [lon, lat] GeoJSON order.
 */

const EARTH_RADIUS_M = 6371000

/**
 * Haversine distance between two points in meters.
 */
export function haversineM([lon1, lat1], [lon2, lat2]) {
  const toRad = (d) => (d * Math.PI) / 180
  const phi1 = toRad(lat1)
  const phi2 = toRad(lat2)
  const dPhi = toRad(lat2 - lat1)
  const dLam = toRad(lon2 - lon1)
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Bounding box check. bbox = [minLon, minLat, maxLon, maxLat].
 */
export function pointInBBox([lon, lat], bbox) {
  return (
    lon >= bbox[0] &&
    lon <= bbox[2] &&
    lat >= bbox[1] &&
    lat <= bbox[3]
  )
}

/**
 * BBox intersection check.
 */
export function bboxIntersects(a, b) {
  return (
    a[0] <= b[2] &&
    a[2] >= b[0] &&
    a[1] <= b[3] &&
    a[3] >= b[1]
  )
}

/**
 * Filter routes whose start point is within radiusKm of a point.
 */
export function routesNearPoint(routes, [lon, lat], radiusKm = 5) {
  return routes.filter((r) => {
    if (!r.start_coords) return false
    return haversineM([lon, lat], r.start_coords) <= radiusKm * 1000
  })
}

/**
 * Merge an array of route geometries into a single GeoJSON LineString.
 * Routes are joined at the end→start seam with a straight connector.
 */
export function mergeGeometries(routeGeos) {
  if (!routeGeos || routeGeos.length === 0) return null
  if (routeGeos.length === 1) return routeGeos[0]

  const merged = [...routeGeos[0].coordinates]

  for (let i = 1; i < routeGeos.length; i++) {
    const prev = merged[merged.length - 1]
    const next = routeGeos[i].coordinates[0]
    // Add connector only if they're not already the same point
    if (prev[0] !== next[0] || prev[1] !== next[1]) {
      merged.push(next)
    }
    // Append all but the first point (avoid duplication)
    merged.push(...routeGeos[i].coordinates.slice(1))
  }

  return { type: 'LineString', coordinates: merged }
}

/**
 * Total duration in minutes for an array of route objects.
 */
export function totalDuration(routes) {
  return routes.reduce((sum, r) => sum + (r.duration_minutes || 0), 0)
}

/**
 * Total elevation gain for an array of route objects.
 */
export function totalElevationGain(routes) {
  return routes.reduce((sum, r) => sum + (r.elevation_gain_m || 0), 0)
}

/**
 * Total distance in km for an array of route objects.
 */
export function totalDistanceKm(routes) {
  return routes.reduce((sum, r) => sum + (r.distance_km || 0), 0)
}

/**
 * Check if a chain of routes forms a loop (last route ends near first route start).
 * Threshold: 2km.
 */
export function isLoop(routes, thresholdM = 2000) {
  if (routes.length < 2) return false
  const first = routes[0].start_coords
  const last = routes[routes.length - 1].end_coords
  if (!first || !last) return false
  return haversineM(first, last) <= thresholdM
}