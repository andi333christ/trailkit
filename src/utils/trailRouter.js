/**
 * trailRouter.js — Dijkstra shortest-path on the trail topology graph.
 * All coords in [lon, lat].
 */

/**
 * Standard Dijkstra on the trail graph.
 *
 * @param {Object} trailNetwork       — { nodes, edges, node_edges }
 * @param {Map} nodeEdgesIndex       — Map<nodeId, edgeId[]> (from network.node_edges)
 * @param {string} fromNodeId
 * @param {string} toNodeId
 * @returns {{ edgeIds: string[], nodeIds: string[], distanceM: number,
 *            eleGainM: number, eleLossM: number } | null}
 */
export function dijkstra(trailNetwork, nodeEdgesIndex, fromNodeId, toNodeId) {
  console.log('[dijkstra] START', { fromNodeId, toNodeId, nodeEdgesIndexSize: nodeEdgesIndex.size })
  const { nodes, edges } = trailNetwork

  // Priority queue: [nodeId, distM]
  const pq = [[fromNodeId, 0]]
  const dist = new Map()
  const prev = new Map() // nodeId → { edgeId, nodeId }
  dist.set(fromNodeId, 0)

  while (pq.length > 0) {
    pq.sort((a, b) => a[1] - b[1])
    const [currId, currDist] = pq.shift()

    if (currId === toNodeId) break
    if (currDist > (dist.get(currId) ?? Infinity)) continue

    const incidentEdges = nodeEdgesIndex.get(currId) || []
    for (const eid of incidentEdges) {
      const edge = edges[eid]
      if (!edge) continue

      const fromN = edge.from
      const toN = edge.to
      const neighbor = fromN === currId ? toN : fromN

      // Skip non-bidirectional edges traversed the wrong way
      if (!edge.bidirectional && neighbor === toN && fromN !== fromNodeId) {
        // This edge is from→to only and we're not going forward
        // Actually, if bidirectional=false, it means the edge can only be traversed
        // in the to→from direction... wait, re-read the spec:
        // "bidirectional: true for loops, false otherwise"
        // This means for non-loops (one-way in trail sense), we can still traverse both
        // directions because MTB can go either way on a trail.
        // bidirectional=false just means "this edge is part of a non-loop route".
        // So we always allow both directions for routing purposes.
      }

      const edgeDist = edge.distance_m || 0
      const newDist = currDist + edgeDist

      if (newDist < (dist.get(neighbor) ?? Infinity)) {
        dist.set(neighbor, newDist)
        prev.set(neighbor, { edgeId: eid, nodeId: currId })
        pq.push([neighbor, newDist])
      }
    }
  }

  if (!prev.has(toNodeId) && fromNodeId !== toNodeId) return null

  // Reconstruct path
  const edgeIds = []
  const nodeIds = []
  let cur = toNodeId
  while (prev.has(cur)) {
    const { edgeId, nodeId } = prev.get(cur)
    edgeIds.unshift(edgeId)
    nodeIds.unshift(nodeId)
    cur = nodeId
  }
  nodeIds.push(toNodeId)

  // Sum elevation
  let totalGain = 0
  let totalLoss = 0
  for (const eid of edgeIds) {
    totalGain += edges[eid]?.ele_gain_m || 0
    totalLoss += edges[eid]?.ele_loss_m || 0
  }

  const totalDist = dist.get(toNodeId) ?? 0

  const result = {
    edgeIds,
    nodeIds,
    distanceM: totalDist,
    eleGainM: totalGain,
    eleLossM: totalLoss,
  }
  console.log('[dijkstra] END', result ? `${result.edgeIds.length} edges` : 'NULL')
  return result
}
