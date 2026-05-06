/**
 * suggest.js — Route suggestion engine (pure function).
 *
 * No side effects. No DOM. No browser APIs.
 * Input: routes + connectivity + ride history + constraints
 * Output: ranked chain suggestions
 */

import { haversineM, routesNearPoint } from '../utils/geo.js'

const MAX_DEPTH = 5
const MAX_CANDIDATES = 200
const LOOP_THRESHOLD_M = 2000

/**
 * @param {{
 *   routes: Object[],
 *   connectivity: Object,
 *   rideHistory: Object[],
 *   startPoint: [number, number],
 *   endPoint: [number, number]|null,
 *   timeBudgetMinutes: number|null,
 *   minDistanceKm: number,
 *   maxDistanceKm: number,
 *   difficulty: string,
 *   preferUnridden: boolean,
 *   maxResults: number,
 * }} opts
 * @returns {Object[]} ranked chain suggestions
 */
export function suggestRoutes({
  routes,
  connectivity,
  rideHistory,
  startPoint,
  endPoint = null,
  timeBudgetMinutes = null,
  minDistanceKm = 0,
  maxDistanceKm = 80,
  difficulty = 'beliebig',
  preferUnridden = true,
  maxResults = 5,
}) {
  if (!startPoint) return []
  if (!routes || routes.length === 0) return []

  const rideIds = new Set(rideHistory.map((r) => r.routeId))
  const routeMap = Object.fromEntries(routes.map((r) => [r.id, r]))

  // Find candidate routes near start point
  const radiusKm = 10
  const nearby = routesNearPoint(routes, startPoint, radiusKm)
  if (nearby.length === 0) return []

  // Filter by difficulty and km range
  const startRoutes = nearby.filter((r) => {
    if (difficulty !== 'beliebig' && r.difficulty !== difficulty) return false
    const dist = r.distance_km || 0
    if (dist < minDistanceKm) return false
    if (maxDistanceKm < 80 && dist > maxDistanceKm) return false
    return true
  })

  // Recursive chain builder
  const allChains = []

  function walk(route, chain, walked, depth) {
    if (depth >= MAX_DEPTH) return
    allChains.push([...chain])
    const connectsTo = connectivity[route.id]?.connects_to || []
    for (const nextId of connectsTo) {
      if (walked.has(nextId)) continue
      const nextRoute = routeMap[nextId]
      if (!nextRoute) continue
      if (difficulty !== 'beliebig' && nextRoute.difficulty !== difficulty) continue
      const dist = nextRoute.distance_km || 0
      if (dist < minDistanceKm) continue
      if (maxDistanceKm < 80 && dist > maxDistanceKm) continue
      walked.add(nextId)
      chain.push(nextRoute)
      walk(nextRoute, chain, walked, depth + 1)
      chain.pop()
      walked.delete(nextId)
    }
  }

  for (const route of startRoutes) {
    const chain = [route]
    const walked = new Set([route.id])
    walk(route, chain, walked, 1)
  }

  if (allChains.length === 0) return []

  // Score and rank
  const scored = allChains
    .slice(0, MAX_CANDIDATES)
    .map((chain) => ({
      chain,
      score: scoreChain(chain, minDistanceKm, maxDistanceKm, difficulty, preferUnridden, rideIds, startPoint, endPoint),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)

  // Deduplicate subsets
  const results = []
  for (const { chain, score } of scored) {
    const key = chain.map((r) => r.id).join('|')
    let isSubset = false
    for (const existing of results) {
      if (existing.key && key.length < existing.key.length && existing.key.includes(key)) {
        isSubset = true
        break
      }
    }
    if (!isSubset) {
      results.push({
        chain,
        score,
        key,
        totalDistanceKm: chain.reduce((s, r) => s + (r.distance_km || 0), 0),
        totalDurationMinutes: chain.reduce((s, r) => s + (r.duration_minutes || 0), 0),
        totalElevationGain: chain.reduce((s, r) => s + (r.elevation_gain_m || 0), 0),
        maxDifficulty: chain.reduce((worst, r) => {
          const order = { schwer: 2, mittel: 1, leicht: 0 }
          return (order[r.difficulty] ?? 0) > (order[worst] ?? 0) ? r.difficulty : worst
        }, 'leicht'),
        unriddenCount: chain.filter((r) => !rideIds.has(r.id)).length,
        unriddenPercent: Math.round((chain.filter((r) => !rideIds.has(r.id)).length / chain.length) * 100),
        isLoop: isChainLoop(chain),
      })
    }
    if (results.length >= maxResults) break
  }

  return results
}

function isChainLoop(chain) {
  if (chain.length < 2) return false
  const first = chain[0].start_coords
  const last = chain[chain.length - 1].end_coords
  if (!first || !last) return false
  return haversineM(first, last) <= LOOP_THRESHOLD_M
}

function scoreChain(chain, minDistKm, maxDistKm, difficulty, preferUnridden, rideIds, startPoint, endPoint) {
  const totalDist = chain.reduce((s, r) => s + (r.distance_km || 0), 0)

  // Distance fit: penalize chains outside range
  let distFit = 1
  if (totalDist < minDistKm) distFit = totalDist / minDistKm
  else if (maxDistKm < 80 && totalDist > maxDistKm) distFit = maxDistKm / totalDist

  // Unridden ratio
  const unriddenCount = chain.filter((r) => !rideIds.has(r.id)).length
  const unriddenRatio = unriddenCount / chain.length

  // Difficulty match
  const diffMatch = difficulty === 'beliebig'
    ? 1
    : chain.filter((r) => r.difficulty === difficulty).length / chain.length

  let score = distFit * 0.4 + unriddenRatio * (preferUnridden ? 0.3 : 0) + diffMatch * 0.2

  if (isChainLoop(chain)) score += 0.15

  if (endPoint) {
    const lastRoute = chain[chain.length - 1]
    if (lastRoute.end_coords && haversineM(lastRoute.end_coords, endPoint) <= LOOP_THRESHOLD_M) {
      score += 0.25
    }
  }

  return score
}
