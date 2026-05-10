import { useState, useCallback, useMemo, useRef } from 'react'
import { valhallaRoute } from './utils/valhallaRouter.js'
import { computePathElevationProfile } from './utils/elevation.js'
import { downloadPathGPX } from './utils/export.js'
import { t } from './i18n/de.js'
import { Header } from './components/Header.jsx'
import { Map as MapView } from './components/Map.jsx'
import { FilterBar } from './components/FilterBar.jsx'
import { RouteList } from './components/RouteList.jsx'
import { RouteDetail } from './components/RouteDetail.jsx'
import { CoverageStats } from './components/CoverageStats.jsx'
import { RideHistory } from './components/RideHistory.jsx'
import { SuggestionFlow } from './components/SuggestionFlow.jsx'
import { Settings } from './components/Settings.jsx'
import { Plans } from './components/Plans.jsx'
import { BrushPanel, AddRouteModal } from './components/BrushPanel.jsx'
import { useTrailNetwork } from './hooks/useTrailNetwork.js'
import { useRoutes } from './hooks/useRoutes.js'
import { useRides, useRouteRides } from './hooks/useRides.js'
import { addRide, updateRide, deleteRide, addPlan } from './stores/rideStore.js'
import { computeElevationProfile } from './utils/elevation.js'
import './styles/tokens.css'

export default function App() {
  const [selectedRouteId, setSelectedRouteId] = useState(null)
  const [hoveredRouteId, setHoveredRouteId] = useState(null)
  const [highlightedRouteIds, setHighlightedRouteIds] = useState([])
  const [colorMode, setColorMode] = useState('difficulty')
  const [tileLayer, setTileLayer] = useState('satellit')
  const [view, setView] = useState('map') // 'map' | 'stats' | 'history' | 'suggest' | 'settings' | 'plans'
  const [startPoint, setStartPoint] = useState(null)

  // Brush mode state
  const [brushMode, setBrushMode] = useState(false)
  const [brushChain, setBrushChain] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)

  // Planner state
  const [plannerMode, setPlannerMode] = useState(false)
  const [waypoints, setWaypoints] = useState([])
  const [plannedPath, setPlannedPath] = useState(null)
  const [snapPreview, setSnapPreview] = useState(null)
  const [toast, setToast] = useState(null) // { message, id }
  const [elevationHoverPoint, setElevationHoverPoint] = useState(null)

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
    setPlannerMode(true)
    setWaypoints([])
    setPlannedPath(null)
    setSnapPreview(null)
    setHighlightedRouteIds([])
    setView('map')
  }

  function handleMapClick([lon, lat]) {
    if (view === 'suggest') {
      setStartPoint([lon, lat])
    }
  }

  // ── Planner handlers ──────────────────────────────────────────────────────
  const lastMoveMs = useRef(0)

  async function rerouteAllWaypoints(wps) {
    if (wps.length < 2) { setPlannedPath(null); return }
    const result = await valhallaRoute(wps.map((wp) => wp.coords))
    if (!result) {
      setPlannedPath(null)
      setToast({ message: t('keineVerbindung'), id: Date.now() })
      setTimeout(() => setToast(null), 3000)
    } else {
      const elevationData = result.elevationProfile ? {
        points: result.elevationProfile,
        totalDistKm: result.distanceM / 1000,
        totalEleGain: result.eleGainM,
        totalEleLoss: result.eleLossM,
      } : null
      setPlannedPath({
        segments: [{ geometry: result.coords, ele_gain_m: result.eleGainM, ele_loss_m: result.eleLossM }],
        totalDistM: result.distanceM,
        totalEleGainM: result.eleGainM,
        totalEleLossM: result.eleLossM,
        elevationData,
      })
    }
  }

  function handlePlannerMouseMove() {}  // no snap preview needed with Valhalla

  async function handlePlannerClick([lng, lat]) {
    const newWp = { id: `wp_${Date.now()}`, coords: [lng, lat] }
    const newWaypoints = [...waypoints, newWp]
    setWaypoints(newWaypoints)
    if (newWaypoints.length >= 2) await rerouteAllWaypoints(newWaypoints)
  }

  function handleWaypointRemove(id) {
    const newWps = waypoints.filter((wp) => wp.id !== id)
    setWaypoints(newWps)
    rerouteAllWaypoints(newWps)
  }

  function handleWaypointDrag(id, [lng, lat]) {
    const newWps = waypoints.map((wp) => wp.id === id ? { ...wp, coords: [lng, lat] } : wp)
    setWaypoints(newWps)
    rerouteAllWaypoints(newWps)
  }

  function handleReorderWaypoints(fromIdx, toIdx) {
    if (fromIdx === toIdx) return
    const newWps = [...waypoints]
    const [moved] = newWps.splice(fromIdx, 1)
    newWps.splice(toIdx, 0, moved)
    setWaypoints(newWps)
    rerouteAllWaypoints(newWps)
  }

  function handleWaypointClear() {
    setWaypoints([])
    setPlannedPath(null)
    setSnapPreview(null)
    setHighlightedRouteIds([])
  }

  function handleRoutePointInsert(coords, insertAfterIdx) {
    const newWp = { id: `wp_${Date.now()}`, coords }
    const newWps = [...waypoints]
    newWps.splice(insertAfterIdx + 1, 0, newWp)
    setWaypoints(newWps)
    rerouteAllWaypoints(newWps)
  }

  function handleElevationHover(distKm) {
    if (distKm == null || !plannedPath?.segments?.[0]?.geometry) {
      setElevationHoverPoint(null)
      return
    }
    const coords = plannedPath.segments[0].geometry
    const total = plannedPath.elevationData?.totalDistKm
    if (!total || coords.length === 0) { setElevationHoverPoint(null); return }
    const fraction = Math.min(1, Math.max(0, distKm / total))
    const idx = Math.round(fraction * (coords.length - 1))
    setElevationHoverPoint(coords[idx] || null)
  }

  function handlePlannerClose() {
    setPlannerMode(false)
    setWaypoints([])
    setPlannedPath(null)
    setSnapPreview(null)
    setHighlightedRouteIds([])
  }

  function handlePlannerSave() {
    if (!plannedPath) return
    const name = `Plan ${new Date().toLocaleDateString('de-AT')}`
    downloadPathGPX(plannedPath.segments, name)
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
          <MapView
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
            onRouteHover={setHoveredRouteId}
            hoveredRouteId={hoveredRouteId}
            onMapClick={handleMapClick}
            startPoint={startPoint}
            plannerMode={plannerMode}
            plannedPath={plannedPath}
            planWaypoints={waypoints}
            snapPreview={snapPreview}
            onPlannerClick={handlePlannerClick}
            onPlannerMouseMove={handlePlannerMouseMove}
            onWaypointDrag={handleWaypointDrag}
            elevationHoverPoint={elevationHoverPoint}
            onRoutePointInsert={handleRoutePointInsert}
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

          {/* Planner mode banner */}
          {plannerMode && (
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
              {t('wegpunktSetzen')}
            </div>
          )}

          {/* Toast notification */}
          {toast && (
            <div style={{
              position: 'absolute', top: 90, left: '50%', transform: 'translateX(-50%)',
              background: 'var(--bg-primary)',
              color: 'var(--text)',
              padding: '6px 14px',
              borderRadius: 'var(--radius)',
              fontSize: 12, fontWeight: 500,
              zIndex: 20,
              border: '1px solid var(--border)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}>
              {toast.message}
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
              hoveredRouteId={hoveredRouteId}
              onRouteClick={handleRouteClick}
              onRouteHover={setHoveredRouteId}
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

        {/* Brush panel (old chain mode) */}
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

        {/* Planner panel */}
        {plannerMode && (
          <BrushPanel
            waypoints={waypoints}
            plannedPath={plannedPath}
            elevationData={plannedPath?.elevationData ?? null}
            onRemoveWaypoint={handleWaypointRemove}
            onReorderWaypoints={handleReorderWaypoints}
            onClear={handleWaypointClear}
            onPlannerSave={handlePlannerSave}
            onClose={handlePlannerClose}
            onElevationHover={handleElevationHover}
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
