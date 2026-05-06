/**
 * filters.js — Route filtering and sorting utilities.
 */

export const DIFFICULTIES = ['leicht', 'mittel', 'schwer']
export const BIKE_TYPES = ['mtb', 'ebike', 'gravel']

export const PREDEFINED_TAGS = [
  'flow', 'scenic', 'technical', 'muddy', 'rocky',
  'rooty', 'exposed', 'beginner-friendly', 'family-friendly', 'panoramic',
]

/**
 * Filter an array of routes by the given filter params.
 * @param {Object[]} routes  - all routes
 * @param {Object} filters
 */
export function applyFilters(routes, filters = {}) {
  const {
    difficulties = [],
    minDist = 0,
    maxDist = Infinity,
    minElev = 0,
    maxElev = Infinity,
    minDur = 0,
    maxDur = Infinity,
    loopOnly = false,
    status = 'all', // 'all' | 'ridden' | 'unridden'
    search = '',
    riddenIds = new Set(),
  } = filters

  return routes.filter((r) => {
    if (difficulties.length > 0 && !difficulties.includes(r.difficulty)) return false
    if (r.distance_km < minDist || r.distance_km > maxDist) return false
    if ((r.elevation_gain_m || 0) < minElev || (r.elevation_gain_m || 0) > maxElev) return false
    if ((r.duration_minutes || 0) < minDur || (r.duration_minutes || 0) > maxDur) return false
    if (loopOnly && !r.is_loop) return false
    const isRidden = riddenIds.has(r.id)
    if (status === 'ridden' && !isRidden) return false
    if (status === 'unridden' && isRidden) return false
    if (search) {
      const q = search.toLowerCase()
      const haystack = `${r.title} ${r.description || ''} ${r.start_point || ''}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
}

export const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'distance', label: 'Entfernung' },
  { value: 'elevation', label: 'Höhenmeter' },
  { value: 'duration', label: 'Dauer' },
  { value: 'difficulty', label: 'Schwierigkeit' },
]

export function sortRoutes(routes, sortBy = 'name') {
  const sorted = [...routes]
  switch (sortBy) {
    case 'distance':
      return sorted.sort((a, b) => (b.distance_km || 0) - (a.distance_km || 0))
    case 'elevation':
      return sorted.sort((a, b) => (b.elevation_gain_m || 0) - (a.elevation_gain_m || 0))
    case 'duration':
      return sorted.sort((a, b) => (b.duration_minutes || 0) - (a.duration_minutes || 0))
    case 'difficulty': {
      const order = { leicht: 0, mittel: 1, schwer: 2 }
      return sorted.sort((a, b) => (order[a.difficulty] ?? 0) - (order[b.difficulty] ?? 0))
    }
    default: // name
      return sorted.sort((a, b) => a.title.localeCompare(b.title))
  }
}