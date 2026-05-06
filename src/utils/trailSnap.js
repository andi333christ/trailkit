/**
 * trailSnap.js — Snap cursor to nearest trail edge / node.
 * All coords in [lon, lat].
 */

import { haversineM } from './geo.js'

/**
 * Build a bbox index over all edges for fast spatial filtering.
 * Returns Map<edgeId, [minLon, minLat, maxLon, maxLat]>.
 */
export function buildEdgeBBoxIndex(trailNetwork) {
  const bboxMap = new Map()
  for (const [eid, edge] of Object.entries(trailNetwork.edges)) {
    const lons = edge.geometry.map((p) => p[0])
    const lats = edge.geometry.map((p) => p[1])
    bboxMap.set(eid, [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)])
  }
  return bboxMap
}

/**
 * Find the nearest point on a polyline segment to a query point.
 * Returns { t, distM } where t is in [0, 1] along the segment.
 */
function nearestPointOnSegment(qx, qy, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return { t: 0, distM: haversineM([qx, qy], [ax, ay]) }
  const t = Math.max(0, Math.min(1, ((qx - ax) * dx + (qy - ay) * dy) / lenSq))
  const projX = ax + t * dx
  const projY = ay + t * dy
  return { t, distM: haversineM([qx, qy], [projX, projY]) }
}

/**
 * Snap a map cursor to the nearest trail network node.
 *
 * @param {[lon, lat]} lngLat     — query point
 * @param {Object} trailNetwork    — { nodes, edges }
 * @param {Map} edgeBBoxIndex     — Map<edgeId, [minLon,...] from buildEdgeBBoxIndex
 * @param {number} maxDistM       — max snap distance in meters (default 150)
 * @returns {{ nodeId, edgeId, snappedCoords: [lon,lat], distM } | null}
 */
export function snapToTrail(lngLat, trailNetwork, edgeBBoxIndex, maxDistM = 150) {
  const [qx, qy] = lngLat
  const { nodes, edges } = trailNetwork

  let bestDist = Infinity
  let bestNodeId = null
  let bestEdgeId = null
  let bestSnappedCoords = null

  // Spatial filter: skip edges whose bbox is > 0.01° from query
  const FILTER_DEG = 0.01

  for (const [eid, edge] of Object.entries(edges)) {
    const bbox = edgeBBoxIndex.get(eid)
    if (!bbox) continue
    if (qx < bbox[0] - FILTER_DEG || qx > bbox[2] + FILTER_DEG) continue
    if (qy < bbox[1] - FILTER_DEG || qy > bbox[3] + FILTER_DEG) continue

    const geom = edge.geometry
    if (!geom || geom.length < 2) continue

    // Check each segment of this edge's polyline
    for (let i = 0; i < geom.length - 1; i++) {
      const [ax, ay] = geom[i]
      const [bx, by] = geom[i + 1]
      const { t, distM } = nearestPointOnSegment(qx, qy, ax, ay, bx, by)
      if (distM < bestDist && distM <= maxDistM) {
        bestDist = distM
        bestEdgeId = eid

        // Snapped coords — project point onto segment
        const dx = bx - ax
        const dy = by - ay
        const snappedX = ax + t * dx
        const snappedY = ay + t * dy
        bestSnappedCoords = [round6(snappedX), round6(snappedY)]
      }
    }
  }

  if (!bestEdgeId) return null

  // Return the nearest node (from_node or to_node of the nearest edge,
  // whichever is closer to the projected point)
  const edge = edges[bestEdgeId]
  const fromCoords = nodes[edge.from]?.coords
  const toCoords = nodes[edge.to]?.coords
  const fromDist = fromCoords ? haversineM(bestSnappedCoords, fromCoords) : Infinity
  const toDist = toCoords ? haversineM(bestSnappedCoords, toCoords) : Infinity
  bestNodeId = fromDist <= toDist ? edge.from : edge.to

  return {
    nodeId: bestNodeId,
    edgeId: bestEdgeId,
    snappedCoords: bestSnappedCoords,
    distM: Math.round(bestDist),
  }
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6
}
