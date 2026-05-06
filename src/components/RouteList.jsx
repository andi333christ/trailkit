import { t } from '../i18n/de.js'

export function RouteList({ routes, riddenIds, selectedRouteId, onRouteClick }) {
  if (routes.length === 0) {
    return (
      <div style={{ padding: 'var(--sp-4)', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <p style={{ fontSize: 13 }}>Keine Strecken gefunden.</p>
      </div>
    )
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      {routes.map((route) => {
        const isRidden = riddenIds.has(route.id)
        const isSelected = route.id === selectedRouteId
        return (
          <RouteCard
            key={route.id}
            route={route}
            isRidden={isRidden}
            isSelected={isSelected}
            onClick={() => onRouteClick(route.id)}
          />
        )
      })}
    </div>
  )
}

export function RouteCard({ route, isRidden, isSelected, onClick }) {
  const badgeClass = `badge badge-${route.difficulty}`

  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '10px var(--sp-2)',
        borderBottom: '1px solid var(--border)',
        borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
        background: isSelected ? 'var(--bg-tertiary)' : 'transparent',
        transition: 'background 0.1s, border-color 0.1s',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.3 }}>
          {route.title}
        </span>
        <span className={badgeClass}>{route.difficulty}</span>
      </div>

      <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 5, alignItems: 'center' }}>
        <Stat icon="↔" value={`${route.distance_km?.toFixed(1) ?? '?'} km`} />
        <Stat icon="↑" value={`${route.elevation_gain_m ?? '?'} Hm`} />
        <Stat icon="⏱" value={`${route.duration_minutes ?? '?'} min`} />
        {isRidden && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent)' }}>✓ Gefahren</span>
        )}
      </div>
    </button>
  )
}

function Stat({ icon, value }) {
  return (
    <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
      {icon} {value}
    </span>
  )
}