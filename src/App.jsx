import { useState, useCallback, useMemo } from 'react'
import { Header } from './components/Header.jsx'
import { Map } from './components/Map.jsx'
import { FilterBar } from './components/FilterBar.jsx'
import { RouteList } from './components/RouteList.jsx'
import { RouteDetail } from './components/RouteDetail.jsx'
import { CoverageStats } from './components/CoverageStats.jsx'
import { RideHistory } from './components/RideHistory.jsx'
import { SuggestionFlow } from './components/SuggestionFlow.jsx'
import { Settings } from './components/Settings.jsx'
import { Plans } from './components/Plans.jsx'
import { BrushPanel, AddRouteModal } from './components/BrushPanel.jsx'
import { useRoutes } from './hooks/useRoutes.js'
import { useRides, useRouteRides } from './hooks/useRides.js'
import { addRide, updateRide, deleteRide, addPlan } from './stores/rideStore.js'
import { computeElevationProfile } from './utils/elevation.js'
import './styles/tokens.css'

export default function App() {
  const [selectedRouteId, setSelectedRouteId] = useState(null)
  const [highlightedRouteIds, setHighlightedRouteIds] = useState([])
  const [colorMode, setColorMode] = useState('difficulty')
  const [tileLayer, setTileLayer] = useState('satellit')
  const [view, setView] = useState('map') // 'map' | 'stats' | 'history' | 'suggest' | 'settings' | 'plans'
  const [startPoint, setStartPoint] = useState(null)

  // Brush mode state
  const [brushMode, setBrushMode] = useState(false)
  const [brushChain, setBrushChain] = useState([]) // ordered array of route objects
  const [showAddModal, setShowAddModal] = useState(false)

  const [filters, setFilters] = useState({
    difficulties: [],
    minDist: 0,
    maxDist: 80,
    minElev: 0,
    maxElev: 9999,
    minDur: 0,
    maxDur: 999,
    loopOnly: false,
    status: 'all',
    search: '',
    sortBy: 'name',
  })

  const { rides, riddenIds, refresh } = useRides()
  const { routes, allRoutes, connectivity } = useRoutes(filters, filters.sortBy || 'name')

  const selectedRoute = allRoutes.find((r) => r.id === selectedRouteId) || null
  const filteredCount = routes.length
  const totalCount = allRoutes.length

  const handleLogRide = useCallback(async (rideData) => {
    await addRide(rideData)
    await refresh()
  }, [refresh])

  const handleEditRide = useCallback(async (id, changes) => {
    await updateRide(id, changes)
    await refresh()
  }, [refresh])

  const handleDeleteRide = useCallback(async (id) => {
    await deleteRide(id)
    await refresh()
  }, [refresh])

  // ── Elevation profile for brush chain ──────────────────────────────────
  const elevationData = useMemo(() => {
    if (brushChain.length === 0) return null
    return computeElevationProfile(brushChain)
  }, [brushChain])

  // ── Route click handler ──────────────────────────────────────────────────
  const handleRouteClick = useCallback((routeId) => {
    const route = allRoutes.find((r) => r.id === routeId)
    if (!route) return

    if (brushMode) {
      // Sticky brush logic
      if (brushChain.length === 0) {
        // Always accept the first route
        setBrushChain([route])
        setHighlightedRouteIds([routeId])
        return
      }

      const lastRoute = brushChain[brushChain.length - 1]
      const connectsTo = connectivity[lastRoute.id]?.connects_to || []

      if (connectsTo.includes(routeId)) {
        // Append to chain
        const next = [...brushChain, route]
        setBrushChain(next)
        setHighlightedRouteIds(next.map((r) => r.id))
      } else {
        // Show hint: this route doesn't connect to the last one
        setHighlightedRouteIds([...brushChain.map((r) => r.id), routeId])
      }
      return
    }

    // Normal mode
    setSelectedRouteId(routeId)
    setHighlightedRouteIds([])
  }, [brushMode, brushChain, connectivity, allRoutes])

  // ── Brush actions ────────────────────────────────────────────────────────
  function handleBrushClose() {
    setBrushMode(false)
    setBrushChain([])
    setHighlightedRouteIds([])
  }

  function handleBrushRemove(routeId) {
    const idx = brushChain.findIndex((r) => r.id === routeId)
    if (idx === -1) return
    const next = brushChain.filter((_, i) => i !== idx)
    setBrushChain(next)
    setHighlightedRouteIds(next.map((r) => r.id))
  }

  function handleBrushClear() {
    setBrushChain([])
    setHighlightedRouteIds([])
  }

  async function handleBrushSave(routeIds, chainName) {
    const profile = elevationData
    await addPlan({
      name: chainName,
      routeIds,
      totalDistanceKm: elevationData?.totalDistKm ?? brushChain.reduce((s, r) => s + (r.distance_km || 0), 0),
      totalDurationMinutes: 0,
      totalElevationGain: elevationData?.totalEleGain ?? 0,
      elevationProfile: profile ? {
        points: profile.points,
        totalDistKm: profile.totalDistKm,
        totalEleGain: profile.totalEleGain,
        totalEleLoss: profile.totalEleLoss,
      } : null,
    })
    setBrushChain([])
    setHighlightedRouteIds([])
    setBrushMode(false)
    setView('plans')
  }

  function handleAddFromList() {
    setShowAddModal(true)
  }

  function handleAddFromModal(route) {
    setBrushChain((prev) => {
      const next = [...prev, route]
      setHighlightedRouteIds(next.map((r) => r.id))
      return next
    })
    setShowAddModal(false)
  }

  // ── "Ich will fahren" ────────────────────────────────────────────────────
  function handleSuggestClick() {
    setBrushMode(true)
    setBrushChain([])
    setHighlightedRouteIds([])
    setView('map')
  }

  function handleMapClick([lon, lat]) {
    if (view === 'suggest') {
      setStartPoint([lon, lat])
    }
  }

  function handleHighlightRoutes(ids) {
    setHighlightedRouteIds(ids)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      <Header
        onSuggestClick={handleSuggestClick}
        onStatsClick={() => setView(view === 'stats' ? 'map' : 'stats')}
        onHistoryClick={() => setView(view === 'history' ? 'map' : 'history')}
        onPlansClick={() => setView(view === 'plans' ? 'map' : 'plans')}
        onSettingsClick={() => setView(view === 'settings' ? 'map' : 'settings')}
        onHomeClick={() => { setView('map'); setBrushMode(false); setBrushChain([]) }}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Map */}
        <div style={{ flex: 1, position: 'relative' }}>
          <Map
            routes={routes}
            allRoutes={allRoutes}
            connectivity={connectivity}
            selectedRouteId={selectedRouteId}
            highlightedRouteIds={highlightedRouteIds}
            colorMode={colorMode}
            riddenIds={riddenIds}
            tileLayer={tileLayer}
            onTileLayerChange={setTileLayer}
            onRouteClick={handleRouteClick}
            onMapClick={handleMapClick}
            startPoint={startPoint}
          />

          {/* Color mode toggle */}
          <div style={{
            position: 'absolute', top: 56, left: 8,
            display: 'flex', gap: 4,
            background: 'var(--map-control-bg)',
            backdropFilter: 'blur(8px)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            padding: 4,
            zIndex: 10,
          }}>
            {[['difficulty', 'Schwierigkeit'], ['coverage', 'Entdeckt']].map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setColorMode(mode)}
                style={{
                  padding: '4px 10px', fontSize: 11, fontWeight: 500, borderRadius: 3,
                  background: colorMode === mode ? 'var(--accent)' : 'transparent',
                  color: colorMode === mode ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  transition: 'all 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Brush mode banner */}
          {brushMode && (
            <div style={{
              position: 'absolute', top: 56, left: '50%', transform: 'translateX(-50%)',
              background: 'var(--accent)',
              color: 'var(--bg-primary)',
              padding: '5px 14px',
              borderRadius: 'var(--radius)',
              fontSize: 12, fontWeight: 600,
              zIndex: 15,
              pointerEvents: 'none',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/>
              </svg>
              Planungsmodus — Klicke Strecken an um sie zu verbinden
            </div>
          )}

          {/* Sidebar */}
          <div style={{
            position: 'absolute', top: 0, left: 0, bottom: 0, width: 320,
            display: 'flex', flexDirection: 'column',
            background: 'var(--panel-bg)',
            backdropFilter: 'var(--panel-backdrop)',
            borderRight: '1px solid var(--border)',
            zIndex: 20,
            pointerEvents: 'all',
            overflow: 'hidden',
          }}>
            <FilterBar
              filters={filters}
              onChange={setFilters}
              totalCount={totalCount}
              filteredCount={filteredCount}
            />
            <RouteList
              routes={routes}
              riddenIds={riddenIds}
              selectedRouteId={selectedRouteId}
              onRouteClick={handleRouteClick}
            />
          </div>
        </div>

        {/* Route detail right panel */}
        {selectedRoute && view === 'map' && !brushMode && (
          <RouteDetailWithRides
            route={selectedRoute}
            riddenIds={riddenIds}
            onClose={() => setSelectedRouteId(null)}
            onLogRide={handleLogRide}
            onEditRide={handleEditRide}
            onDeleteRide={handleDeleteRide}
          />
        )}

        {/* Brush panel */}
        {(brushMode || brushChain.length > 0) && (
          <BrushPanel
            chain={brushChain}
            allRoutes={allRoutes}
            elevationData={elevationData}
            onRemove={handleBrushRemove}
            onClear={handleBrushClear}
            onSave={handleBrushSave}
            onAddFromList={handleAddFromList}
            onClose={handleBrushClose}
          />
        )}

        {/* SuggestionFlow */}
        {view === 'suggest' && !brushMode && (
          <SuggestionFlow
            allRoutes={allRoutes}
            connectivity={connectivity}
            rideHistory={rides}
            startPoint={startPoint}
            onStartPointSet={(pt) => { setStartPoint(pt); if (pt) setView('map') }}
            onClose={() => { setView('map'); setHighlightedRouteIds([]) }}
            onRouteClick={(id) => { setSelectedRouteId(id); setView('map') }}
            onHighlightRoutes={handleHighlightRoutes}
          />
        )}

        {/* Overlays */}
        {view === 'stats' && (
          <CoverageStats rides={rides} riddenIds={riddenIds} allRoutes={allRoutes} />
        )}
        {view === 'history' && (
          <RideHistory rides={rides} allRoutes={allRoutes} onRouteClick={(id) => { setSelectedRouteId(id); setView('map') }} />
        )}
        {view === 'settings' && (
          <Settings tileLayer={tileLayer} onTileLayerChange={setTileLayer} onClose={() => setView('map')} />
        )}
        {view === 'plans' && (
          <Plans allRoutes={allRoutes} onClose={() => setView('map')} onHighlightRoutes={handleHighlightRoutes} />
        )}
      </div>

      {/* Add route modal */}
      {showAddModal && (
        <AddRouteModal
          chain={brushChain}
          allRoutes={allRoutes}
          connectivity={connectivity}
          onAdd={handleAddFromModal}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}

function RouteDetailWithRides({ route, riddenIds, onClose, onLogRide, onEditRide, onDeleteRide }) {
  const { rides } = useRouteRides(route.id)
  return (
    <RouteDetail
      route={route}
      rides={rides}
      riddenIds={riddenIds}
      onClose={onClose}
      onLogRide={onLogRide}
      onEditRide={onEditRide}
      onDeleteRide={onDeleteRide}
    />
  )
}
