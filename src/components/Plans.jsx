import { useState } from 'react'
import { t } from '../i18n/de.js'
import { downloadChainGPX } from '../utils/export.js'

export function Plans({ allRoutes, onClose, onHighlightRoutes }) {
  const { plans, addPlan, deletePlan } = usePlanState()

  function handleHighlight(plan) {
    onHighlightRoutes(plan.routeIds)
  }

  function handleExport(plan) {
    const routes = plan.routeIds.map((id) => allRoutes.find((r) => r.id === id)).filter(Boolean)
    if (!routes.length) return
    const name = plan.name || routes.slice(0, 3).map((r) => r.title).join(' > ')
    downloadChainGPX(routes, name)
  }

  async function handleDelete(id) {
    if (window.confirm(t('planLoeschenConfirm'))) {
      await deletePlan(id)
    }
  }

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
      <div style={{ padding: 'var(--sp-2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{t('plaene')}</span>
        <button className="btn-ghost" onClick={onClose} style={{ padding: 4 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {plans.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5">
            <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{t('keinPlan')}</p>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {plans.map((plan) => {
            const routeCount = plan.routeIds?.length || 0
            return (
              <div key={plan.id} style={{
                padding: 'var(--sp-2)',
                borderBottom: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{plan.name}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {routeCount} {routeCount === 1 ? 'Strecke' : 'Strecken'}
                  </span>
                  {plan.totalDistanceKm && (
                    <span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      ↔ {plan.totalDistanceKm.toFixed(1)} km
                    </span>
                  )}
                  {plan.totalDurationMinutes && (
                    <span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      ⏱ {plan.totalDurationMinutes} min
                    </span>
                  )}
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {new Date(plan.createdAt).toLocaleDateString('de-AT')}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-ghost" onClick={() => handleHighlight(plan)} style={{ fontSize: 12 }}>
                    Zeigen
                  </button>
                  <button className="btn-ghost" onClick={() => handleExport(plan)} style={{ fontSize: 12 }}>
                    GPX
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => handleDelete(plan.id)}
                    style={{ fontSize: 12, color: 'var(--difficulty-schwer)', marginLeft: 'auto' }}
                  >
                    {t('delete')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Local state — plans are stored via Dexie but we manage the list here
function usePlanState() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const { getAllPlans } = await import('../stores/rideStore.js')
    const p = await getAllPlans()
    setPlans(p)
    setLoading(false)
  }

  useState(() => { load() })

  async function handleDeletePlan(id) {
    const { deletePlan: del } = await import('../stores/rideStore.js')
    await del(id)
    await load()
  }

  return { plans, loading, addPlan: async () => {}, deletePlan: handleDeletePlan }
}
