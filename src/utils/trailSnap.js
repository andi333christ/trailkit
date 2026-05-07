/**
 * trailSnap.js — Snap cursor to nearest trail edge(s).
 * All coords in [lon, lat].
 */

import { haversineM } from './geo.js'

export function buildEdgeBBoxIndex(trailNetwork) {
  const bboxMap = new Map()
  for (const [eid, edge] of Object.entries(trailNetwork.edges)) {
    const lons = edge.geometry.map((p) => p[0])
    const lats = edge.geometry.map((p) => p[1])
    bboxMap.set(eid, [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)])
  }
  return bboxMap
}

function nearestPointOnSegment(qx, qy, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return { t: 0, projX: ax, projY: ay, distM: haversineM([qx, qy], [ax, ay]) }
  const t = Math.max(0, Math.min(1, ((qx - ax) * dx + (qy - ay) * dy) / lenSq))
  const projX = ax + t * dx, projY = ay + t * dy
  return { t, projX, projY, distM: haversineM([qx, qy], [projX, projY]) }
}

/**
 * Returns the primary snap (nearest edge) plus up to maxCandidates alternative snap
 * edges within maxDistM. Caller can try all candidates for routing to handle
 * cases where the click is between two disconnected route segments.
 *
 * Each candidate: { edgeId, snappedCoords, splitSegIdx, distM }
 * Return: { snappedCoords, candidates } or null.
 */
export function snapToTrail(lngLat, trailNetwork, edgeBBoxIndex, maxDistM = 200, maxCandidates = 6) {
  const [qx, qy] = lngLat
  const { edges } = trailNetwork
  const FILTER_DEG = 0.01

  // Collect best match per edge
  const edgeBest = new Map()

  for (const [eid, edge] of Object.entries(edges)) {
    const bbox = edgeBBoxIndex.get(eid)
    if (!bbox) continue
    if (qx < bbox[0] - FILTER_DEG || qx > bbox[2] + FILTER_DEG) continue
    if (qy < bbox[1] - FILTER_DEG || qy > bbox[3] + FILTER_DEG) continue
    const geom = edge.geometry
    if (!geom || geom.length < 2) continue

    let eBest = null
    for (let i = 0; i < geom.length - 1; i++) {
      const [ax, ay] = geom[i], [bx, by] = geom[i + 1]
      const { projX, projY, distM } = nearestPointOnSegment(qx, qy, ax, ay, bx, by)
      if (distM <= maxDistM && (!eBest || distM < eBest.distM)) {
        eBest = { edgeId: eid, snappedCoords: [r6(projX), r6(projY)], splitSegIdx: i, distM }
      }
    }
    if (eBest) edgeBest.set(eid, eBest)
  }

  if (edgeBest.size === 0) return null

  const sorted = [...edgeBest.values()].sort((a, b) => a.distM - b.distM)
  const candidates = sorted.slice(0, maxCandidates)

  // Nearest graph nodes — catches junction nodes the virtual-edge split might miss
  const nodeCandidates = []
  for (const [nid, node] of Object.entries(trailNetwork.nodes)) {
    const d = haversineM([qx, qy], node.coords)
    if (d <= maxDistM) nodeCandidates.push({ nodeId: nid, distM: d })
  }
  nodeCandidates.sort((a, b) => a.distM - b.distM)

  return {
    snappedCoords: candidates[0].snappedCoords,
    candidates,
    nearestNodes: nodeCandidates.slice(0, 6),
  }
}

function r6(n) { return Math.round(n * 1e6) / 1e6 }
