import { useState, useCallback } from 'react'
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
import { useRoutes } from './hooks/useRoutes.js'
import { useRides, useRouteRides } from './hooks/useRides.js'
import { addRide, updateRide, deleteRide } from './stores/rideStore.js'
import './styles/tokens.css'

export default function App() {
  const [selectedRouteId, setSelectedRouteId] = useState(null)
  const [highlightedRouteIds, setHighlightedRouteIds] = useState([])
  const [colorMode, setColorMode] = useState('difficulty')
  const [tileLayer, setTileLayer] = useState('gelande')
  const [view, setView] = useState('map') // 'map' | 'stats' | 'history' | 'suggest' | 'settings' | 'plans'
  const [startPoint, setStartPoint] = useState(null)
  const [endPoint, setEndPoint] = useState(null)

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

  function handleRouteClick(routeId) {
    setSelectedRouteId(routeId)
    setHighlightedRouteIds([])
  }

  function handleSuggestClick() {
    setView('suggest')
  }

  function handleColorModeChange(mode) {
    setColorMode(mode)
  }

  function handleMapClick([lon, lat]) {
    if (view === 'suggest') {
      setStartPoint([lon, lat])
    }
  }

  function handleHighlightRoutes(ids) {
    setHighlightedRouteIds(ids)
  }

  const filteredCount = routes.length
  const totalCount = allRoutes.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      <Header
        onSuggestClick={handleSuggestClick}
        onStatsClick={() => setView(view === 'stats' ? 'map' : 'stats')}
        onHistoryClick={() => setView(view === 'history' ? 'map' : 'history')}
        onPlansClick={() => setView(view === 'plans' ? 'map' : 'plans')}
        onSettingsClick={() => setView(view === 'settings' ? 'map' : 'settings')}
        onHomeClick={() => setView('map')}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Map + sidebar */}
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
                onClick={() => handleColorModeChange(mode)}
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

          {/* Sidebar: route list */}
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
        {selectedRoute && view === 'map' && (
          <RouteDetailWithRides
            route={selectedRoute}
            riddenIds={riddenIds}
            onClose={() => setSelectedRouteId(null)}
            onLogRide={handleLogRide}
            onEditRide={handleEditRide}
            onDeleteRide={handleDeleteRide}
          />
        )}

        {/* SuggestionFlow right panel */}
        {view === 'suggest' && (
          <SuggestionFlow
            allRoutes={allRoutes}
            connectivity={connectivity}
            rideHistory={rides}
            startPoint={startPoint}
            endPoint={endPoint}
            onStartPointSet={setStartPoint}
            onEndPointSet={setEndPoint}
            onClose={() => { setView('map'); setHighlightedRouteIds([]) }}
            onRouteClick={(id) => { setSelectedRouteId(id); setView('map') }}
            onHighlightRoutes={handleHighlightRoutes}
          />
        )}

        {/* Overlays: full-screen */}
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