import { useState } from 'react'
import { t } from '../i18n/de.js'
import { downloadChainGPX } from '../utils/export.js'
import { usePlans } from '../hooks/useRides.js'
import { ElevationProfile } from './ElevationProfile.jsx'
import { computeElevationProfile } from '../utils/elevation.js'

export function Plans({ allRoutes, onClose, onHighlightRoutes }) {
  const { plans, addPlan, deletePlan } = usePlans()
  const [selectedPlan, setSelectedPlan] = useState(null)

  async function handleDelete(id) {
    if (window.confirm(t('planLoeschenConfirm'))) {
      await deletePlan(id)
      if (selectedPlan?.id === id) setSelectedPlan(null)
    }
  }

  function handleExport(plan) {
    const routes = (plan.routeIds || [])
      .map((id) => allRoutes.find((r) => r.id === id))
      .filter(Boolean)
    if (!routes.length) return
    downloadChainGPX(routes, plan.name || 'Plan')
  }

  function handleShowPlan(plan) {
    setSelectedPlan(plan)
    onHighlightRoutes(plan.routeIds || [])
  }

  const chainRoutes = selectedPlan
    ? (selectedPlan.routeIds || []).map((id) => allRoutes.find((r) => r.id === id)).filter(Boolean)
    : []

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: 'var(--bg-primary)',
      zIndex: 150,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{ padding: 'var(--sp-2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{t('plaene')}</span>
        <button className="btn-ghost" onClick={onClose} style={{ padding: 4 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Plans list */}
        <div style={{
          width: selectedPlan ? 220 : '100%',
          flexShrink: 0,
          borderRight: selectedPlan ? '1px solid var(--border)' : 'none',
          overflowY: 'auto',
          transition: 'width 0.2s',
        }}>
          {plans.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 'var(--sp-4)' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5">
                <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('keinPlan')}</p>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>
                Speichere einen Vorschlag aus „Ich will fahren"
              </p>
            </div>
          ) : (
            plans.map((plan) => (
              <div
                key={plan.id}
                className={`plan-list-item${selectedPlan?.id === plan.id ? ' is-selected' : ''}`}
                onClick={() => handleShowPlan(plan)}
              >
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, lineHeight: 1.3 }}>
                  {plan.name}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {(plan.routeIds || []).length > 0 && (
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {(plan.routeIds || []).length} Strecken
                    </span>
                  )}
                  {plan.totalDistanceKm > 0 && (
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {plan.totalDistanceKm.toFixed(1)} km
                    </span>
                  )}
                  {plan.totalElevationGain > 0 && (
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      ↑ {plan.totalElevationGain} Hm
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3 }}>
                  {new Date(plan.createdAt).toLocaleDateString('de-AT')}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Plan detail */}
        {selectedPlan && chainRoutes.length > 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: 'var(--sp-2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn-ghost" onClick={() => setSelectedPlan(null)} style={{ padding: 4 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1, lineHeight: 1.3 }}>{selectedPlan.name}</span>
              <button className="btn-ghost" onClick={() => handleExport(selectedPlan)} style={{ fontSize: 11 }}>GPX</button>
              <button
                className="btn-ghost"
                onClick={() => handleDelete(selectedPlan.id)}
                style={{ fontSize: 11, color: 'var(--difficulty-schwer)' }}
              >
                {t('delete')}
              </button>
            </div>

            {/* Chain routes */}
            <div style={{ padding: 'var(--sp-2)', borderBottom: '1px solid var(--border)' }}>
              <div className="label" style={{ marginBottom: 8 }}>Strecken</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {chainRoutes.map((route, i) => (
                  <div key={route.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: 'var(--accent)', color: 'var(--bg-primary)',
                      fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', flexShrink: 0, marginTop: 1,
                    }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{route.title}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          ↔ {route.distance_km?.toFixed(1)} km
                        </span>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          ↑ {route.elevation_gain_m} Hm
                        </span>
                        <span className={`badge badge-${route.difficulty}`}>{route.difficulty}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Elevation profile */}
            {selectedPlan.elevationProfile ? (
              <div style={{ padding: 'var(--sp-2)', flex: 1, overflowY: 'auto' }}>
                <div className="label" style={{ marginBottom: 8 }}>Höhenprofil</div>
                <ElevationProfile profile={selectedPlan.elevationProfile} />
              </div>
            ) : chainRoutes.length > 0 ? (
              <div style={{ padding: 'var(--sp-2)', flex: 1, overflowY: 'auto' }}>
                <div className="label" style={{ marginBottom: 8 }}>Höhenprofil</div>
                <ElevationProfile profile={computeElevationProfile(chainRoutes)} />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
