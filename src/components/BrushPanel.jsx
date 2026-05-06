import { useState, useMemo } from 'react'
import { ElevationProfile } from './ElevationProfile.jsx'
import { downloadChainGPX } from '../utils/export.js'
import { t } from '../i18n/de.js'

export function BrushPanel({
  chain,
  allRoutes,
  elevationData,
  onRemove,
  onClear,
  onSave,
  onAddFromList,
  onClose,
  // Planner props
  waypoints,
  plannedPath,
  onRemoveWaypoint,
  onPlannerSave,
}) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showHints, setShowHints] = useState(true)
  const isPlanner = waypoints !== undefined

  const totalKm = chain ? chain.reduce((s, r) => s + (r.distance_km || 0), 0) : 0
  const totalHm = chain ? chain.reduce((s, r) => s + (r.elevation_gain_m || 0), 0) : 0
  const chainName = chain ? chain.map((r) => r.title).join(' → ') : ''

  function handleExport() {
    if (isPlanner) {
      // handled via onPlannerSave
      return
    }
    downloadChainGPX(chain || [], chainName)
  }

  async function handleSave() {
    if (isPlanner) return
    setSaving(true)
    await onSave(chain.map((r) => r.id), chainName)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="brush-panel">
      {/* Header */}
      <div className="brush-panel__header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
            <path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/>
          </svg>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Route planen</span>
        </div>
        <button className="btn-ghost" onClick={onClose} style={{ padding: 4 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Planner waypoint view */}
      {waypoints !== undefined && waypoints.length === 0 && (
        <div className="brush-panel__hint">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p>{t('wegpunktSetzen')}</p>
        </div>
      )}

      {waypoints !== undefined && waypoints.length > 0 && (
        <div className="brush-panel__chain">
          <div className="brush-panel__chain-header">
            <span className="label">Wegpunkte</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              {waypoints.length}
            </span>
          </div>

          <div className="brush-panel__chain-list">
            {waypoints.map((wp, i) => (
              <div key={wp.id} className="brush-panel__chain-item">
                <div className="brush-panel__chain-idx">{i + 1}</div>
                <div className="brush-panel__chain-info">
                  <button
                    className="brush-panel__route-name"
                    onClick={() => onRemoveWaypoint?.(wp.id)}
                    title={t('wegpunktEntfernen')}
                  >
                    Wegpunkt {i + 1}
                  </button>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                      {wp.coords[0].toFixed(4)}, {wp.coords[1].toFixed(4)}
                    </span>
                  </div>
                </div>
                {i < waypoints.length - 1 && (
                  <div className="brush-panel__chain-connector">
                    <div className="brush-panel__connector-line" />
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats for planned path */}
      {waypoints !== undefined && plannedPath && (
        <div className="brush-panel__stats">
          <div className="brush-panel__stat">
            <span className="mono brush-panel__stat-val">{(plannedPath.totalDistM / 1000).toFixed(1)}</span>
            <span className="label">km</span>
          </div>
          <div className="brush-panel__stat">
            <span className="mono brush-panel__stat-val">{plannedPath.totalEleGainM}</span>
            <span className="label">Hm ↑</span>
          </div>
          {plannedPath.totalEleLossM > 0 && (
            <div className="brush-panel__stat">
              <span className="mono brush-panel__stat-val" style={{ color: 'var(--difficulty-leicht)' }}>
                {plannedPath.totalEleLossM}
              </span>
              <span className="label">Hm ↓</span>
            </div>
          )}
        </div>
      )}

      {/* Elevation profile for planned path */}
      {waypoints !== undefined && plannedPath && (
        <div className="brush-panel__elevation">
          <div className="label" style={{ marginBottom: 6 }}>Höhenprofil</div>
          <ElevationProfile profile={elevationData} />
        </div>
      )}

      {/* Undo / clear buttons for planner */}
      {waypoints !== undefined && waypoints.length > 0 && (
        <div style={{ padding: '0 var(--sp-2) var(--sp-1)', display: 'flex', gap: 6 }}>
          <button
            className="btn-ghost"
            onClick={() => onRemoveWaypoint?.(waypoints[waypoints.length - 1].id)}
            style={{ fontSize: 12, color: 'var(--text-tertiary)' }}
          >
            {t('rueckgaengig')}
          </button>
          <button
            className="btn-ghost"
            onClick={onClear}
            style={{ fontSize: 12, color: 'var(--text-tertiary)' }}
          >
            Leeren
          </button>
        </div>
      )}

      <div className="brush-panel__body">
        {/* Chain */}
        {chain.length > 0 && (
          <div className="brush-panel__chain">
            <div className="brush-panel__chain-header">
              <span className="label">Kette</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {chain.length} {chain.length === 1 ? 'Strecke' : 'Strecken'}
              </span>
            </div>

            <div className="brush-panel__chain-list">
              {chain.map((route, i) => (
                <div key={route.id} className="brush-panel__chain-item">
                  <div className="brush-panel__chain-idx">{i + 1}</div>
                  <div className="brush-panel__chain-info">
                    <button
                      className="brush-panel__route-name"
                      onClick={() => onRemove(route.id)}
                      title="Klicken zum Entfernen"
                    >
                      {route.title}
                    </button>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span className="mono" style={{ fontSize: 10 }}>↔ {route.distance_km?.toFixed(1)} km</span>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>↑ {route.elevation_gain_m} Hm</span>
                      <span className={`badge badge-${route.difficulty}`}>{route.difficulty}</span>
                    </div>
                  </div>
                  <div className="brush-panel__chain-connector">
                    {i < chain.length - 1 && <div className="brush-panel__connector-line" />}
                    {i < chain.length - 1 && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
                      </svg>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        {chain.length > 0 && (
          <div className="brush-panel__stats">
            <div className="brush-panel__stat">
              <span className="mono brush-panel__stat-val">{totalKm.toFixed(1)}</span>
              <span className="label">km</span>
            </div>
            <div className="brush-panel__stat">
              <span className="mono brush-panel__stat-val">{totalHm}</span>
              <span className="label">Hm ↑</span>
            </div>
            {elevationData && elevationData.totalEleLoss > 0 && (
              <div className="brush-panel__stat">
                <span className="mono brush-panel__stat-val" style={{ color: 'var(--difficulty-leicht)' }}>
                  {elevationData.totalEleLoss}
                </span>
                <span className="label">Hm ↓</span>
              </div>
            )}
          </div>
        )}

        {/* Elevation profile */}
        {chain.length > 0 && (
          <div className="brush-panel__elevation">
            <div className="label" style={{ marginBottom: 6 }}>Höhenprofil</div>
            <ElevationProfile profile={elevationData} />
          </div>
        )}

        {/* Add from list button */}
        {chain.length > 0 && (
          <button
            className="btn-ghost brush-panel__add-btn"
            onClick={onAddFromList}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Weitere Strecke hinzufügen…
          </button>
        )}
      </div>

      {/* Footer actions */}
      {(chain.length > 0 || (waypoints !== undefined && waypoints.length > 0)) && (
        <div className="brush-panel__footer">
          {waypoints === undefined && (
            <button
              className="btn-ghost"
              onClick={onClear}
              style={{ fontSize: 12, color: 'var(--text-tertiary)' }}
            >
              Leeren
            </button>
          )}
          {waypoints === undefined && (
            <button className="btn-ghost" onClick={handleExport} style={{ fontSize: 12 }}>
              GPX
            </button>
          )}
          {waypoints !== undefined && (
            <button className="btn-ghost" onClick={onPlannerSave} style={{ fontSize: 12 }}>
              GPX
            </button>
          )}
          {waypoints === undefined && (
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={saving || chain.length === 0}
              style={{ fontSize: 12, flex: 1 }}
            >
              {saving ? '…' : saved ? '✓ Gespeichert' : 'Plan speichern'}
            </button>
          )}
          {waypoints !== undefined && (
            <button
              className="btn-primary"
              onClick={onPlannerSave}
              style={{ fontSize: 12, flex: 1 }}
            >
              GPX Export
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Modal: shows routes connectable from the last chain route.
 */
export function AddRouteModal({ chain, allRoutes, connectivity, onAdd, onClose }) {
  const [search, setSearch] = useState('')

  const lastRoute = chain[chain.length - 1]
  const connectableIds = lastRoute
    ? new Set(connectivity[lastRoute.id]?.connects_to || [])
    : new Set()

  const connectable = allRoutes.filter((r) => {
    if (chain.some((c) => c.id === r.id)) return false
    if (lastRoute && !connectableIds.has(r.id)) return false
    if (search && !r.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontSize: 14, fontWeight: 600 }}>Strecke hinzufügen</span>
          <button className="btn-ghost" onClick={onClose} style={{ padding: 4 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {lastRoute && (
          <div style={{ padding: '0 var(--sp-2) var(--sp-1)', fontSize: 11, color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border)' }}>
            Nächste Strecke nach <span style={{ color: 'var(--text-secondary)' }}>{lastRoute.title}</span>
          </div>
        )}

        <div style={{ padding: 'var(--sp-1) var(--sp-2)', borderBottom: '1px solid var(--border)' }}>
          <input
            type="text"
            placeholder="Suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', height: 30, fontSize: 12 }}
            autoFocus
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', maxHeight: 320 }}>
          {connectable.length === 0 ? (
            <div style={{ padding: 'var(--sp-3)', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              Keine verbundenen Strecken gefunden.
            </div>
          ) : (
            connectable.map((route) => (
              <button
                key={route.id}
                onClick={() => onAdd(route)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', textAlign: 'left', padding: '8px var(--sp-2)',
                  borderBottom: '1px solid var(--border)',
                  transition: 'background 0.1s',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {route.title}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      ↔ {route.distance_km?.toFixed(1)} km
                    </span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      ↑ {route.elevation_gain_m} Hm
                    </span>
                  </div>
                </div>
                <span className={`badge badge-${route.difficulty}`}>{route.difficulty}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
