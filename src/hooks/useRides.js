/**
 * useRides.js — Ride data + plan access hooks.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  getAllRides,
  getRidesForRoute,
  getRiddenRouteIds,
  getRideCount,
  addRide,
  updateRide,
  deleteRide,
  getAllPlans,
  addPlan,
  deletePlan,
} from '../stores/rideStore.js'

export function useRides() {
  const [rides, setRides] = useState([])
  const [riddenIds, setRiddenIds] = useState(new Set())
  const [rideCount, setRideCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [allRides, ids, count] = await Promise.all([
      getAllRides(),
      getRiddenRouteIds(),
      getRideCount(),
    ])
    setRides(allRides)
    setRiddenIds(ids)
    setRideCount(count)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { rides, riddenIds, rideCount, loading, refresh }
}

export function useRouteRides(routeId) {
  const [rides, setRides] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const r = await getRidesForRoute(routeId)
    setRides(r)
    setLoading(false)
  }, [routeId])

  useEffect(() => { refresh() }, [refresh])

  return { rides, loading, refresh }
}

export function usePlans() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const p = await getAllPlans()
    setPlans(p)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleAddPlan = useCallback(async (planData) => {
    await addPlan(planData)
    await refresh()
  }, [refresh])

  const handleDeletePlan = useCallback(async (id) => {
    await deletePlan(id)
    await refresh()
  }, [refresh])

  return { plans, loading, refresh, addPlan: handleAddPlan, deletePlan: handleDeletePlan }
}
