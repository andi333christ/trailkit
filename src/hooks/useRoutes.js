/**
 * useRoutes.js — Route data access hook.
 *
 * Today: filters bundled routes.json.
 * Tomorrow: API calls. Components don't know or care.
 */

import { useState, useEffect, useMemo } from 'react'
import { applyFilters, sortRoutes } from '../utils/filters.js'

// Bundled data (imported at build time — webpack handles this)
import routesData from '../data/routes.json'
import connectivityData from '../data/connectivity.json'

export function useRoutes(filters = {}, sortBy = 'name') {
  const filtered = useMemo(
    () => sortRoutes(applyFilters(routesData, filters), sortBy),
    [filters, sortBy]
  )
  return { routes: filtered, allRoutes: routesData, connectivity: connectivityData }
}

export function useRoute(id) {
  return useMemo(() => routesData.find((r) => r.id === id) || null, [id])
}