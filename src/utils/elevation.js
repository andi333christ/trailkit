/**
 * computeElevationProfile — merge route geometries and compute
 * cumulative distance + elevation for an elevation chart.
 *
 * Returns an array of { distKm, eleM, cumulativeEleM } sampled roughly every 20m.
 */

import { mergeGeometries } from './geo.js'

const SAMPLE_INTERVAL_M = 20

/**
 * @param {Object[]} routes - ordered array of route objects with geometry.coordinates
 * @returns {{ points: Array<{distKm: number, eleM: number, cumulativeEleM: number}>, totalDistKm: number, totalEleGain: number, totalEleLoss: number }}
 */
export function computeElevationProfile(routes) {
  if (!routes || routes.length === 0) return null

  const merged = mergeGeometries(routes.map((r) => r.geometry))
  if (!merged || !merged.coordinates || merged.coordinates.length < 2) return null

  const rawPoints = merged.coordinates // [lon, lat, ele?] or [lon, lat]

  // Haversine step per coordinate
  function segmentDistM(i) {
    if (i === 0) return 0
    const [lon1, lat1] = rawPoints[i - 1]
    const [lon2, lat2] = rawPoints[i]
    return haversineM([lon1, lat1], [lon2, lat2])
  }

  const result = []
  let cumDistM = 0
  let cumEleGain = 0
  let cumEleLoss = 0
  let lastEle = null

  for (let i = 0; i < rawPoints.length; i++) {
    const pt = rawPoints[i]
    const lon = pt[0], lat = pt[1], ele = pt.length >= 3 ? pt[2] : null

    if (i > 0) cumDistM += segmentDistM(i)

    let cumulativeEleM = 0
    if (ele !== null && ele !== undefined) {
      if (lastEle !== null) {
        const diff = ele - lastEle
        if (diff > 0) cumEleGain += diff
        else cumEleLoss += Math.abs(diff)
      }
      lastEle = ele
      cumulativeEleM = cumEleGain - cumEleLoss
    }

    result.push({ distKm: cumDistM / 1000, eleM: ele, cumulativeEleM })
  }

  const totalDistKm = cumDistM / 1000

  return {
    points: result,
    totalDistKm,
    totalEleGain: Math.round(cumEleGain),
    totalEleLoss: Math.round(cumEleLoss),
  }
}

function haversineM([lon1, lat1], [lon2, lat2]) {
  const EARTH_RADIUS_M = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const phi1 = toRad(lat1), phi2 = toRad(lat2)
  const dPhi = toRad(lat2 - lat1)
  const dLam = toRad(lon2 - lon1)
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
