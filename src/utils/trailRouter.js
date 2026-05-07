/**
 * trailRouter.js — Dijkstra + virtual-node routing on the trail topology graph.
 * All coords in [lon, lat].
 */

import { haversineM } from './geo.js'

function geomDist(geometry) {
  let d = 0
  for (let i = 1; i < geometry.length; i++) d += haversineM(geometry[i - 1], geometry[i])
  return d
}

/**
 * Dijkstra shortest-path.
 * nodeEdgesIndex must be a Map<nodeId, edgeId[]>.
 */
export function dijkstra(trailNetwork, nodeEdgesIndex, fromNodeId, toNodeId) {
  const { nodes, edges } = trailNetwork

  const pq = [[fromNodeId, 0]]
  const dist = new Map()
  const prev = new Map()
  dist.set(fromNodeId, 0)

  while (pq.length > 0) {
    pq.sort((a, b) => a[1] - b[1])
    const [currId, currDist] = pq.shift()

    if (currId === toNodeId) break
    if (currDist > (dist.get(currId) ?? Infinity)) continue

    for (const eid of (nodeEdgesIndex.get(currId) || [])) {
      const edge = edges[eid]
      if (!edge) continue
      // One-way trail edges: only traversable in the recorded (downhill) from→to direction
      if (edge.one_way && edge.from !== currId) continue
      const neighbor = edge.from === currId ? edge.to : edge.from
      const newDist = currDist + (edge.distance_m || 0)
      if (newDist < (dist.get(neighbor) ?? Infinity)) {
        dist.set(neighbor, newDist)
        prev.set(neighbor, { edgeId: eid, nodeId: currId })
        pq.push([neighbor, newDist])
      }
    }
  }

  if (!prev.has(toNodeId) && fromNodeId !== toNodeId) return null

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

  let totalGain = 0, totalLoss = 0
  for (const eid of edgeIds) {
    totalGain += edges[eid]?.ele_gain_m || 0
    totalLoss += edges[eid]?.ele_loss_m || 0
  }

  return { edgeIds, nodeIds, distanceM: dist.get(toNodeId) ?? 0, eleGainM: totalGain, eleLossM: totalLoss }
}

/**
 * Route between two multi-candidate snaps using virtual node insertion.
 * Tries all candidate pairs and returns the shortest result.
 *
 * snap1/snap2: { snappedCoords, candidates: [{ edgeId, snappedCoords, splitSegIdx }] }
 */
export function routeWithVirtualNodes(network, nodeEdgesIndex, snap1, snap2) {
  const cands1 = snap1.candidates || [snap1]
  const cands2 = snap2.candidates || [snap2]
  let best = null

  // Virtual node pairs: insert split points at exact click positions
  for (const c1 of cands1) {
    for (const c2 of cands2) {
      const r = routeSinglePair(network, nodeEdgesIndex, c1, c2)
      if (r && (!best || r.distanceM < best.distanceM)) best = r
    }
  }

  // Real node pairs: try nearest graph nodes directly — catches junctions the
  // edge-split approach misses when click is on a different route than the junction
  const nn1 = snap1.nearestNodes || []
  const nn2 = snap2.nearestNodes || []
  for (const n1 of nn1) {
    for (const n2 of nn2) {
      if (n1.nodeId === n2.nodeId) continue
      const r = dijkstra(network, nodeEdgesIndex, n1.nodeId, n2.nodeId)
      if (r && (!best || r.distanceM < best.distanceM)) {
        best = { ...r, augEdges: network.edges }
      }
    }
  }

  return best
}

function routeSinglePair(network, nodeEdgesIndex, snap1, snap2) {
  const { edges } = network

  const VN1 = '__vn1__'
  const VN2 = '__vn2__'

  // Shallow-copy nodes + edges; we'll add virtual entries without mutating originals.
  const augNodes = { ...network.nodes, [VN1]: { coords: snap1.snappedCoords }, [VN2]: { coords: snap2.snappedCoords } }
  const augEdges = { ...edges }

  // Deep-copy nodeEdges index (Map of arrays)
  const augNE = new Map()
  for (const [nid, eids] of nodeEdgesIndex) augNE.set(nid, [...eids])

  function splitEdge(snap, vnId) {
    const edge = augEdges[snap.edgeId]
    if (!edge) return   // already removed (same-edge second split handled below)

    const geom = edge.geometry
    const si = snap.splitSegIdx

    const geomA = [...geom.slice(0, si + 1), snap.snappedCoords]
    const geomB = [snap.snappedCoords, ...geom.slice(si + 1)]

    const distA = Math.round(geomDist(geomA))
    const distB = Math.round(geomDist(geomB))
    const total = distA + distB || 1
    const fracA = distA / total

    const eaId = snap.edgeId + ':a:' + vnId
    const ebId = snap.edgeId + ':b:' + vnId

    augEdges[eaId] = {
      from: edge.from, to: vnId, geometry: geomA, distance_m: distA,
      source_route_id: edge.source_route_id,
      ele_gain_m: Math.round((edge.ele_gain_m || 0) * fracA),
      ele_loss_m: Math.round((edge.ele_loss_m || 0) * fracA),
      one_way: edge.one_way || false,
    }
    augEdges[ebId] = {
      from: vnId, to: edge.to, geometry: geomB, distance_m: distB,
      source_route_id: edge.source_route_id,
      ele_gain_m: Math.round((edge.ele_gain_m || 0) * (1 - fracA)),
      ele_loss_m: Math.round((edge.ele_loss_m || 0) * (1 - fracA)),
      one_way: edge.one_way || false,
    }

    delete augEdges[snap.edgeId]

    // Update node-edge index: replace original edge with the two halves
    augNE.set(edge.from, [...(augNE.get(edge.from) || []).filter((e) => e !== snap.edgeId), eaId])
    augNE.set(edge.to,   [...(augNE.get(edge.to)   || []).filter((e) => e !== snap.edgeId), ebId])
    augNE.set(vnId, [eaId, ebId])

    return { eaId, ebId, edge }
  }

  const s1 = splitEdge(snap1, VN1)

  if (snap1.edgeId === snap2.edgeId) {
    // Same edge: snap1 split it into s1.eaId (from→VN1) and s1.ebId (VN1→to).
    // Determine which half contains snap2 and split that half.
    const si1 = snap1.splitSegIdx
    const si2 = snap2.splitSegIdx
    const origGeom = s1.edge.geometry

    let segForSnap2, halfEdgeId
    if (si2 < si1 || (si2 === si1)) {
      // snap2 is in the "a" half (from→VN1); re-map splitSegIdx to local coords
      halfEdgeId = s1.eaId
      segForSnap2 = { edgeId: s1.eaId, snappedCoords: snap2.snappedCoords, splitSegIdx: si2 }
    } else {
      // snap2 is in the "b" half (VN1→to); adjust splitSegIdx (geomB starts at si1+1)
      halfEdgeId = s1.ebId
      segForSnap2 = { edgeId: s1.ebId, snappedCoords: snap2.snappedCoords, splitSegIdx: si2 - si1 }
    }
    splitEdge(segForSnap2, VN2)
  } else {
    splitEdge(snap2, VN2)
  }

  const result = dijkstra({ nodes: augNodes, edges: augEdges }, augNE, VN1, VN2)
  return result ? { ...result, augEdges } : null
}
