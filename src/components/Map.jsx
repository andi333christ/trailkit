import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// Trail route classification for directional arrow layer
const _TRAIL_ARROW_KEYWORDS = ['trail', 'flow', 'fun', 'blackberry', 'raspberry', 'enduro']
const _TRAIL_ARROW_EXCLUDE  = ['verbindungsweg', 'zubringer', 'uphill', 'auffahrt', 'mit-zufahrt']
function isDownhillTrailRoute(id) {
  if (_TRAIL_ARROW_EXCLUDE.some((k) => id.includes(k))) return false
  return _TRAIL_ARROW_KEYWORDS.some((k) => id.includes(k))
}

const TILE_LAYERS = {
  gelande: {
    label: 'Gelände',
    url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors, SRTM | OpenTopoMap',
  },
  karte: {
    label: 'Karte',
    url: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
    attribution: '© OpenStreetMap contributors © CARTO',
  },
  satellit: {
    label: 'Satellit',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri',
  },
}

const DIFFICULTY_COLOR = {
  leicht: '#5a9060',
  mittel: '#4878b0',
  schwer: '#c04838',
}

const DEFAULT_CENTER = [16.05, 48.15] // [lon, lat]
const DEFAULT_ZOOM = 11

export function Map({
  routes,
  connectivity,
  selectedRouteId,
  highlightedRouteIds = [],
  colorMode = 'difficulty', // 'difficulty' | 'coverage'
  riddenIds = new Set(),
  tileLayer = 'gelande',
  allRoutes = [],
  onTileLayerChange,
  onRouteClick,
  onMapClick,
  onRouteHover,
  startPoint,
  onStartPointSet,
  // Planner props
  plannerMode = false,
  plannedPath = null,
  planWaypoints = [],
  snapPreview = null,
  hoveredRouteId,
  onPlannerClick,
  onPlannerMouseMove,
  onWaypointDrag,
  elevationHoverPoint = null,
  onRoutePointInsert,
}) {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const waypointMarkersRef = useRef([])
  const onMapClickRef = useRef(onMapClick)
  const onRouteClickRef = useRef(onRouteClick)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [maplibreSupported, setMaplibreSupported] = useState(true)
  const [terrain3d, setTerrain3d] = useState(false)

  useEffect(() => { onMapClickRef.current = onMapClick }, [onMapClick])
  useEffect(() => { onRouteClickRef.current = onRouteClick }, [onRouteClick])
  const onRouteHoverRef = useRef(onRouteHover)
  useEffect(() => { onRouteHoverRef.current = onRouteHover }, [onRouteHover])
  const onPlannerClickRef = useRef(onPlannerClick)
  const onPlannerMouseMoveRef = useRef(onPlannerMouseMove)
  const onWaypointDragRef = useRef(onWaypointDrag)
  useEffect(() => { onPlannerClickRef.current = onPlannerClick }, [onPlannerClick])
  useEffect(() => { onPlannerMouseMoveRef.current = onPlannerMouseMove }, [onPlannerMouseMove])
  useEffect(() => { onWaypointDragRef.current = onWaypointDrag }, [onWaypointDrag])
  const onRoutePointInsertRef = useRef(onRoutePointInsert)
  useEffect(() => { onRoutePointInsertRef.current = onRoutePointInsert }, [onRoutePointInsert])
  const plannedPathRef = useRef(plannedPath)
  useEffect(() => { plannedPathRef.current = plannedPath }, [plannedPath])
  const planWaypointsRef = useRef(planWaypoints)
  useEffect(() => { planWaypointsRef.current = planWaypoints }, [planWaypoints])
  const routeDragRef = useRef(null) // { insertAfterIdx } when dragging
  const plannerModeRef = useRef(plannerMode)
  useEffect(() => {
    plannerModeRef.current = plannerMode
    if (!plannerMode && map.current) {
      map.current.getCanvas().style.cursor = ''
    }
  }, [plannerMode])

  // Route-drag helpers
  function closestIdxOnLine(coords, [lng, lat]) {
    let minD = Infinity, idx = 0
    for (let i = 0; i < coords.length; i++) {
      const dx = coords[i][0] - lng, dy = coords[i][1] - lat
      const d = dx * dx + dy * dy
      if (d < minD) { minD = d; idx = i }
    }
    return idx
  }

  function findInsertAfterIdx(routeCoords, waypoints, dragIdx) {
    if (!waypoints || waypoints.length < 2) return 0
    const wpIdxs = waypoints.map((wp) => closestIdxOnLine(routeCoords, wp.coords))
    let insertAfter = 0
    for (let i = 0; i < wpIdxs.length - 1; i++) {
      if (dragIdx >= wpIdxs[i]) insertAfter = i
    }
    return insertAfter
  }

  // Init map
  useEffect(() => {
    if (map.current || !mapContainer.current) return
    let cleanup = null
    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            'osm-tiles': {
              type: 'raster',
              tiles: [TILE_LAYERS[tileLayer].url],
              tileSize: 256,
              attribution: TILE_LAYERS[tileLayer].attribution,
            },
          },
          layers: [
            {
              id: 'osm-tiles-layer',
              type: 'raster',
              source: 'osm-tiles',
              paint: { 'raster-saturation': -0.2, 'raster-brightness-max': 1.0, 'raster-opacity': 1.0 },
            },
          ],
        },
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        minZoom: 9,
        maxZoom: 17,
      })

      map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      map.current.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-right')

      map.current.on('load', () => {
        map.current.addSource('routes', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          promoteId: 'id',   // use properties.id (string slug) as feature ID for setFeatureState
        })

        // Hover outline — shows on mouseover (below selected, below route line)
        map.current.addLayer({
          id: 'routes-hover-outline',
          type: 'line',
          source: 'routes',
          paint: {
            'line-color': '#e07838',
            'line-width': ['interpolate', ['linear'], ['zoom'], 9, 9, 15, 16],
            'line-opacity': ['case', ['boolean', ['feature-state', 'hovered'], false], 0.6, 0],
          },
        })

        // Selected outline — fully opaque amber glow
        map.current.addLayer({
          id: 'routes-selected-outline',
          type: 'line',
          source: 'routes',
          filter: ['boolean', ['get', 'selected'], false],
          paint: {
            'line-color': '#e07838',
            'line-width': ['interpolate', ['linear'], ['zoom'], 9, 9, 15, 16],
            'line-opacity': 1.0,
          },
        })

        // All routes (colored, on top of outlines)
        map.current.addLayer({
          id: 'routes-simplified',
          type: 'line',
          source: 'routes',
          paint: {
            'line-color': ['get', 'color'],
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              9, ['case',
                ['any', ['boolean', ['feature-state', 'hovered'], false], ['get', 'highlighted']], 5,
                2,
              ],
              15, ['case',
                ['any', ['boolean', ['feature-state', 'hovered'], false], ['get', 'highlighted']], 12,
                5,
              ],
            ],
            'line-opacity': 1.0,
          },
        })

        // Direction arrows on all routes — symbol layer on the routes source
        map.current.addLayer({
          id: 'route-arrows',
          type: 'symbol',
          source: 'routes',
          minzoom: 12,
          layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 140,
            'text-field': ['case', ['boolean', ['get', 'isTrail'], false], '›T', '›'],
            'text-size': 28,
            'text-rotation-alignment': 'map',
            'text-keep-upright': false,
            'text-allow-overlap': false,
            'text-ignore-placement': false,
          },
          paint: {
            'text-color': ['case',
              ['boolean', ['get', 'isTrail'], false],
              'rgba(255,255,255,0.9)',
              'rgba(255,255,255,0.55)',
            ],
            'text-halo-color': 'rgba(0,0,0,0.25)',
            'text-halo-width': 1,
          },
        })

        map.current.addSource('start-point', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })

        map.current.addLayer({
          id: 'start-point-circle',
          type: 'circle',
          source: 'start-point',
          paint: {
            'circle-radius': 8,
            'circle-color': '#b86040',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#f2ece0',
          },
        })

        // ── Planner sources + layers ──────────────────────────────────────
        map.current.addSource('plan-path', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.current.addLayer({
          id: 'plan-path-line',
          type: 'line',
          source: 'plan-path',
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#c87840',
            'line-width': ['interpolate', ['linear'], ['zoom'], 12, 5, 15, 9],
            'line-opacity': 0.95,
          },
        })

        map.current.addSource('snap-preview', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.current.addLayer({
          id: 'snap-preview-circle',
          type: 'circle',
          source: 'snap-preview',
          paint: {
            'circle-radius': 5,
            'circle-color': '#f2ece0',
            'circle-opacity': 0.9,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#b86040',
          },
        })


        // Route-drag: hover handle + preview dashed lines
        map.current.addSource('route-drag-handle', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.current.addLayer({
          id: 'route-drag-handle-circle',
          type: 'circle',
          source: 'route-drag-handle',
          paint: {
            'circle-radius': 6,
            'circle-color': '#f2ece0',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#c87840',
            'circle-opacity': 0.9,
          },
        })
        map.current.addSource('route-drag-preview', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.current.addLayer({
          id: 'route-drag-preview-line',
          type: 'line',
          source: 'route-drag-preview',
          paint: {
            'line-color': '#c87840',
            'line-width': 2,
            'line-opacity': 0.55,
            'line-dasharray': [5, 4],
          },
        })

        // Elevation-profile hover marker
        map.current.addSource('elevation-hover', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.current.addLayer({
          id: 'elevation-hover-dot',
          type: 'circle',
          source: 'elevation-hover',
          paint: {
            'circle-radius': 7,
            'circle-color': '#f2ece0',
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#c87840',
            'circle-opacity': 0.95,
          },
        })

        // Terrain DEM source (AWS Terrain Tiles, terrarium encoding, free/no-key)
        map.current.addSource('terrain-dem', {
          type: 'raster-dem',
          tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
          tileSize: 256,
          encoding: 'terrarium',
          maxzoom: 15,
        })

        setMapLoaded(true)

        // Fit all routes on initial load so nothing is cut off
        if (allRoutes && allRoutes.length > 0) {
          const lons = []
          const lats = []
          for (const r of allRoutes) {
            if (r.bbox) {
              lons.push(r.bbox[0], r.bbox[2])
              lats.push(r.bbox[1], r.bbox[3])
            }
          }
          if (lons.length > 0) {
            map.current.fitBounds(
              [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
              { padding: { top: 80, bottom: 80, left: 400, right: 80 }, maxZoom: 12, duration: 0 }
            )
          }
        }
      })

      let routeDragOccurred = false

      map.current.on('click', (e) => {
        if (routeDragOccurred) { routeDragOccurred = false; return }
        if (plannerModeRef.current) {
          onPlannerClickRef.current?.([e.lngLat.lng, e.lngLat.lat])
        } else {
          onMapClickRef.current?.([e.lngLat.lng, e.lngLat.lat])
        }
      })

      map.current.on('route-click', (e) => {
        onRouteClickRef.current?.(e.routeId)
      })

      let hoveredRouteId = null
      let lastPlannerMove = 0

      // Hover over planned route line → show grab handle
      map.current.on('mousemove', 'plan-path-line', (e) => {
        if (!plannerModeRef.current || routeDragRef.current) return
        const routeCoords = plannedPathRef.current?.segments?.[0]?.geometry
        if (!routeCoords) return
        map.current.getCanvas().style.cursor = 'grab'
        const idx = closestIdxOnLine(routeCoords, [e.lngLat.lng, e.lngLat.lat])
        const pt = routeCoords[idx]
        map.current.getSource('route-drag-handle')?.setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: pt }, properties: {} }],
        })
      })

      map.current.on('mouseleave', 'plan-path-line', () => {
        if (routeDragRef.current) return
        map.current.getSource('route-drag-handle')?.setData({ type: 'FeatureCollection', features: [] })
        if (plannerModeRef.current) map.current.getCanvas().style.cursor = 'crosshair'
      })

      // Mousedown on planned route → start drag
      map.current.on('mousedown', 'plan-path-line', (e) => {
        if (!plannerModeRef.current) return
        e.preventDefault()
        const routeCoords = plannedPathRef.current?.segments?.[0]?.geometry
        if (!routeCoords) return
        const [lng, lat] = [e.lngLat.lng, e.lngLat.lat]
        const dragIdx = closestIdxOnLine(routeCoords, [lng, lat])
        const insertAfterIdx = findInsertAfterIdx(routeCoords, planWaypointsRef.current, dragIdx)
        routeDragRef.current = { insertAfterIdx }
        map.current.dragPan.disable()
        map.current.getCanvas().style.cursor = 'grabbing'
      })

      // Global mouseup → finish drag
      map.current.on('mouseup', (e) => {
        if (!routeDragRef.current) return
        const { insertAfterIdx } = routeDragRef.current
        const coords = [e.lngLat.lng, e.lngLat.lat]
        routeDragRef.current = null
        routeDragOccurred = true
        map.current.dragPan.enable()
        if (plannerModeRef.current) map.current.getCanvas().style.cursor = 'crosshair'
        map.current.getSource('route-drag-handle')?.setData({ type: 'FeatureCollection', features: [] })
        map.current.getSource('route-drag-preview')?.setData({ type: 'FeatureCollection', features: [] })
        onRoutePointInsertRef.current?.(coords, insertAfterIdx)
      })

      // General mousemove: planner snap preview + route drag preview
      map.current.on('mousemove', (e) => {
        const [lng, lat] = [e.lngLat.lng, e.lngLat.lat]

        if (routeDragRef.current) {
          // Move drag handle with mouse
          map.current.getSource('route-drag-handle')?.setData({
            type: 'FeatureCollection',
            features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: {} }],
          })
          // Show dashed preview lines to adjacent waypoints
          const wps = planWaypointsRef.current || []
          const { insertAfterIdx } = routeDragRef.current
          const lines = []
          if (wps[insertAfterIdx]) lines.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [wps[insertAfterIdx].coords, [lng, lat]] }, properties: {} })
          if (wps[insertAfterIdx + 1]) lines.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[lng, lat], wps[insertAfterIdx + 1].coords] }, properties: {} })
          map.current.getSource('route-drag-preview')?.setData({ type: 'FeatureCollection', features: lines })
          return
        }

        if (!plannerModeRef.current) return
        map.current.getCanvas().style.cursor = 'crosshair'
        const now = Date.now()
        if (now - lastPlannerMove > 16) {
          onPlannerMouseMoveRef.current?.([lng, lat])
          lastPlannerMove = now
        }
      })

      map.current.on('mousemove', 'routes-simplified', (e) => {
        if (plannerModeRef.current) return
        if (e.features.length > 0) {
          if (hoveredRouteId !== null) {
            map.current.setFeatureState({ source: 'routes', id: hoveredRouteId }, { hovered: false })
          }
          hoveredRouteId = e.features[0].id
          map.current.setFeatureState({ source: 'routes', id: hoveredRouteId }, { hovered: true })
          map.current.getCanvas().style.cursor = 'pointer'
          onRouteHoverRef.current?.(e.features[0].properties?.id || null)
        }
      })
      map.current.on('mouseleave', 'routes-simplified', () => {
        if (plannerModeRef.current) return
        if (hoveredRouteId !== null) {
          map.current.setFeatureState({ source: 'routes', id: hoveredRouteId }, { hovered: false })
        }
        hoveredRouteId = null
        map.current.getCanvas().style.cursor = ''
        onRouteHoverRef.current?.(null)
      })

      cleanup = () => {
        waypointMarkersRef.current.forEach((m) => m.remove())
        waypointMarkersRef.current = []
        if (map.current) {
          map.current.remove()
          map.current = null
        }
      }
    } catch (err) {
      console.error('MapLibre init failed:', err)
      setMaplibreSupported(false)
      map.current = null
    }
    return cleanup
  }, [])

  // Terrain 3D toggle
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (terrain3d) {
      map.current.setTerrain({ source: 'terrain-dem', exaggeration: 2 })
      map.current.easeTo({ pitch: 50, duration: 600 })
    } else {
      map.current.setTerrain(null)
      map.current.easeTo({ pitch: 0, duration: 600 })
    }
  }, [terrain3d, mapLoaded])

  // Update tile layer
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    const layer = TILE_LAYERS[tileLayer]
    const source = map.current.getSource('osm-tiles')
    if (source) {
      source.setTiles([layer.url])
      map.current.setPaintProperty('osm-tiles-layer', 'raster-saturation', tileLayer === 'satellit' ? 0.0 : -0.15)
      map.current.setPaintProperty('osm-tiles-layer', 'raster-opacity', 1.0)
    }
  }, [tileLayer, mapLoaded])

  // Elevation-profile hover point on map
  useEffect(() => {
    if (!mapLoaded || !map.current) return
    const source = map.current.getSource('elevation-hover')
    if (!source) return
    if (!elevationHoverPoint) {
      source.setData({ type: 'FeatureCollection', features: [] })
      return
    }
    source.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: elevationHoverPoint }, properties: {} }],
    })
  }, [elevationHoverPoint, mapLoaded])

  // Build GeoJSON features
  useEffect(() => {
    if (!mapLoaded || !map.current) return

    const features = routes
      .filter((r) => r.geometry || r.geometry_simplified)
      .map((r) => {
        const geom = r.geometry_simplified || r.geometry
        const isRidden = riddenIds.has(r.id)
        const isSelected = r.id === selectedRouteId
        const isHighlighted = highlightedRouteIds.includes(r.id)
        const isDimmed = highlightedRouteIds.length > 0 && !isHighlighted

        let color
        if (colorMode === 'coverage') {
          color = isRidden ? '#e8e6e1' : '#4a4a44'
        } else {
          color = DIFFICULTY_COLOR[r.difficulty] || '#c4943d'
        }

        // Verbindungsweg and Zubringer render in muted army green
        if (r.id.includes('verbindungsweg') || r.id.includes('zubringer')) {
          color = '#7a8c60'
        }

        return {
          type: 'Feature',
          id: r.id,
          geometry: geom,
          properties: {
            id: r.id,
            color: color,
            highlighted: isHighlighted,
            dimmed: isDimmed,
            selected: isSelected,
            title: r.title,
            isTrail: isDownhillTrailRoute(r.id),
          },
        }
      })

    const source = map.current.getSource('routes')
    if (source) {
      source.setData({ type: 'FeatureCollection', features })
    }

    // Click handler on source
    if (features.length > 0) {
      map.current.off('click', handleRouteClick)
      map.current.on('click', 'routes-simplified', handleRouteClick)
    }
  }, [routes, colorMode, riddenIds, selectedRouteId, highlightedRouteIds, mapLoaded])

  function handleRouteClick(e) {
    if (plannerModeRef.current) return
    const feature = e.features?.[0]
    if (feature) onRouteClickRef.current?.(feature.properties.id)
  }

  // Start point marker
  useEffect(() => {
    if (!mapLoaded || !map.current) return
    const source = map.current.getSource('start-point')
    if (!source) return

    if (startPoint) {
      source.setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: startPoint } }],
      })
    } else {
      source.setData({ type: 'FeatureCollection', features: [] })
    }
  }, [startPoint, mapLoaded])

    // ── Planner reactive sources ────────────────────────────────────────────────
  // plan-path
  useEffect(() => {
    if (!mapLoaded || !map.current) return
    const source = map.current.getSource('plan-path')
    if (!source) return
    if (!plannedPath || !plannedPath.segments || plannedPath.segments.length === 0) {
      source.setData({ type: 'FeatureCollection', features: [] })
      return
    }
    const features = plannedPath.segments.map((seg) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: seg.geometry },
      properties: {},
    }))
    source.setData({ type: 'FeatureCollection', features })
  }, [plannedPath, mapLoaded])

  // plan-waypoints — numbered HTML markers
  useEffect(() => {
    if (!mapLoaded || !map.current) return
    waypointMarkersRef.current.forEach((m) => m.remove())
    waypointMarkersRef.current = []
    planWaypoints.forEach((wp, i) => {
      // Outer el: MapLibre owns its transform for positioning — don't touch it
      const el = document.createElement('div')
      Object.assign(el.style, { width: '24px', height: '24px' })
      el.setAttribute('draggable', 'false')
      el.addEventListener('dragstart', (e) => e.preventDefault())

      // Inner circle: safe to apply scale/cursor without conflicting with MapLibre
      const inner = document.createElement('div')
      Object.assign(inner.style, {
        width: '100%', height: '100%', borderRadius: '50%',
        background: '#b86040', border: '2.5px solid #f2ece0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#f2ece0', fontWeight: '700', fontSize: '11px',
        fontFamily: 'system-ui, sans-serif',
        boxShadow: '0 1px 5px rgba(44,34,24,0.35)',
        cursor: 'grab', userSelect: 'none',
        transition: 'transform 0.1s',
      })
      inner.textContent = String(i + 1)
      el.appendChild(inner)

      const marker = new maplibregl.Marker({ element: el, anchor: 'center', draggable: true })
        .setLngLat(wp.coords)
        .addTo(map.current)
      el.addEventListener('mousedown', () => { inner.style.cursor = 'grabbing'; inner.style.transform = 'scale(1.2)' })
      el.addEventListener('mouseup', () => { inner.style.cursor = 'grab'; inner.style.transform = '' })
      marker.on('dragend', () => {
        inner.style.cursor = 'grab'
        inner.style.transform = ''
        const { lng, lat } = marker.getLngLat()
        onWaypointDragRef.current?.(wp.id, [lng, lat])
      })
      waypointMarkersRef.current.push(marker)
    })
  }, [planWaypoints, mapLoaded])

  // Sync list-hover → map feature state
  const prevListHoveredRef = useRef(null)
  useEffect(() => {
    if (!mapLoaded || !map.current) return
    if (prevListHoveredRef.current) {
      map.current.setFeatureState({ source: 'routes', id: prevListHoveredRef.current }, { hovered: false })
    }
    if (hoveredRouteId) {
      map.current.setFeatureState({ source: 'routes', id: hoveredRouteId }, { hovered: true })
    }
    prevListHoveredRef.current = hoveredRouteId
  }, [hoveredRouteId, mapLoaded])

  // snap-preview
  useEffect(() => {
    if (!mapLoaded || !map.current) return
    const source = map.current.getSource('snap-preview')
    if (!source) return
    if (!snapPreview || !snapPreview.coords) {
      source.setData({ type: 'FeatureCollection', features: [] })
      return
    }
    source.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: snapPreview.coords }, properties: {} }],
    })
  }, [snapPreview, mapLoaded])

// Fly to selected route
  useEffect(() => {
    if (!mapLoaded || !map.current || !selectedRouteId) return
    const route = routes.find((r) => r.id === selectedRouteId)
    if (route?.bbox) {
      map.current.fitBounds(
        [[route.bbox[0], route.bbox[1]], [route.bbox[2], route.bbox[3]]],
        { padding: { top: 80, bottom: 80, left: 400, right: 80 }, maxZoom: 15, duration: 600 }
      )
    }
  }, [selectedRouteId, mapLoaded])

  // Fly to highlighted chain
  useEffect(() => {
    if (!mapLoaded || !map.current || highlightedRouteIds.length === 0) return
    const pts = routes
      .filter((r) => highlightedRouteIds.includes(r.id) && r.bbox)
      .flatMap((r) => [[r.bbox[0], r.bbox[1]], [r.bbox[2], r.bbox[3]]])
    if (pts.length > 0) {
      const lons = pts.map((p) => p[0])
      const lats = pts.map((p) => p[1])
      map.current.fitBounds(
        [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: { top: 80, bottom: 80, left: 400, right: 80 }, maxZoom: 14, duration: 800 }
      )
    }
  }, [highlightedRouteIds, mapLoaded])

  if (!maplibreSupported) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
        <p>MapLibre GL wird von deinem Browser nicht unterstützt.</p>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {/* Tile layer switcher */}
      <div style={{
        position: 'absolute', top: 8, right: 8,
        display: 'flex', flexDirection: 'column', gap: 4,
        background: 'var(--map-control-bg)',
        backdropFilter: 'blur(8px)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        padding: 4,
        zIndex: 10,
      }}>
        {Object.entries(TILE_LAYERS).map(([key, layer]) => (
          <button
            key={key}
            onClick={() => onTileLayerChange?.(key)}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 3,
              background: tileLayer === key ? 'var(--accent)' : 'transparent',
              color: tileLayer === key ? 'var(--bg-primary)' : 'var(--text-secondary)',
              transition: 'all 0.15s',
              textAlign: 'left',
            }}
          >
            {layer.label}
          </button>
        ))}
        <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
        <button
          onClick={() => setTerrain3d((v) => !v)}
          style={{
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 500,
            borderRadius: 3,
            background: terrain3d ? 'var(--accent)' : 'transparent',
            color: terrain3d ? 'var(--bg-primary)' : 'var(--text-secondary)',
            transition: 'all 0.15s',
            textAlign: 'left',
          }}
        >
          3D
        </button>
      </div>

      {/* Color mode toggle */}
      <div style={{
        position: 'absolute', top: 8, left: 8,
        display: 'flex', gap: 4,
        background: 'var(--map-control-bg)',
        backdropFilter: 'blur(8px)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        padding: 4,
        zIndex: 10,
      }}>
        {['difficulty', 'coverage'].map((mode) => (
          <button
            key={mode}
            onClick={() => {/* handled in App */}}
            data-mode={mode}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 3,
              background: colorMode === mode ? 'var(--accent)' : 'transparent',
              color: colorMode === mode ? 'var(--bg-primary)' : 'var(--text-secondary)',
              transition: 'all 0.15s',
            }}
          >
            {mode === 'difficulty' ? 'Schwierigkeit' : 'Entdeckt'}
          </button>
        ))}
      </div>
    </div>
  )
}