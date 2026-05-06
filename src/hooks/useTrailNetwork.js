/**
 * useTrailNetwork.js — Loads trail_network.json and builds the bbox index.
 */

import { useMemo } from 'react'
import trailNetworkData from '../data/trail_network.json'
import { buildEdgeBBoxIndex } from '../utils/trailSnap.js'

export function useTrailNetwork() {
  const network = trailNetworkData

  const edgeBBoxIndex = useMemo(() => {
    return buildEdgeBBoxIndex(network)
  }, [network])

  return { network, edgeBBoxIndex, ready: !!network }
}
