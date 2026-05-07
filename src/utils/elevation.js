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

const PROFILE_SAMPLE_M = 25  // synthetic profile sample interval

/**
 * Elevation profile for a planned path (array of edge segments).
 * Each segment carries ele_gain_m / ele_loss_m from the trail network.
 * Since source GPX files have no per-point elevation, a synthetic profile
 * is generated: each segment ramps up (gain) then down (loss) linearly,
 * sampled every PROFILE_SAMPLE_M metres for a smooth curve.
 *
 * @param {Array<{geometry, ele_gain_m, ele_loss_m}>} segments
 * @returns {{ points, totalDistKm, totalEleGain, totalEleLoss }}
 */
export function computePathElevationProfile(segments) {
  if (!segments || segments.length === 0) return null

  const result = []
  let cumDistM = 0
  let totalEleGain = 0
  let totalEleLoss = 0
  let currentEle = 400  // Wienerwald rough starting elevation (m)

  for (const seg of segments) {
    const geom = seg.geometry
    if (!geom || geom.length < 2) continue

    const gain = seg.ele_gain_m || 0
    const loss = seg.ele_loss_m || 0
    totalEleGain += gain
    totalEleLoss += loss

    // Total segment length
    let segTotal = 0
    for (let i = 1; i < geom.length; i++) {
      segTotal += haversineM([geom[i-1][0], geom[i-1][1]], [geom[i][0], geom[i][1]])
    }

    // Shape: ramp up over first upFrac of distance, then down
    const upFrac = (gain + loss) > 0 ? gain / (gain + loss) : 0.5
    const startEle = currentEle

    // Resample at PROFILE_SAMPLE_M intervals so the curve is smooth regardless
    // of how many geometry vertices the underlying edge has
    const nSamples = Math.max(2, Math.ceil(segTotal / PROFILE_SAMPLE_M) + 1)
    for (let s = 0; s < nSamples; s++) {
      const t = s / (nSamples - 1)
      const sampleDist = t * segTotal
      let eleM
      if (t <= upFrac) {
        eleM = startEle + (upFrac > 0 ? (t / upFrac) * gain : 0)
      } else {
        eleM = startEle + gain - (upFrac < 1 ? ((t - upFrac) / (1 - upFrac)) * loss : 0)
      }
      result.push({ distKm: (cumDistM + sampleDist) / 1000, eleM: Math.round(eleM) })
    }

    cumDistM += segTotal
    currentEle += gain - loss
  }

  if (result.length < 2) return null

  return {
    points: result,
    totalDistKm: Math.round(cumDistM / 1000 * 100) / 100,
    totalEleGain: Math.round(totalEleGain),
    totalEleLoss: Math.round(totalEleLoss),
  }
}
