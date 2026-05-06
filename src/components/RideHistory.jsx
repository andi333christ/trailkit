import { t } from '../i18n/de.js'

export function RideHistory({ rides, allRoutes, onRouteClick }) {
  if (!rides || rides.length === 0) {
    return (
      <div style={{
        position: 'absolute', inset: 0, background: 'var(--bg-primary)', zIndex: 150,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--sp-2)',
      }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{t('noRides')}</p>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t('noRidesHint')}</p>
      </div>
    )
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-primary)', zIndex: 150, overflowY: 'auto' }}>
      <div className="label" style={{ padding: 'var(--sp-2)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-primary)' }}>
        {t('history').toUpperCase()} — {rides.length} {t('ausfahrten')}
      </div>
      <div>
        {rides.map((ride) => {
          const route = allRoutes.find((r) => r.id === ride.routeId)
          return (
            <button
              key={ride.id}
              onClick={() => onRouteClick(ride.routeId)}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
                width: '100%', textAlign: 'left', padding: '10px var(--sp-2)',
                borderBottom: '1px solid var(--border)',
                background: 'transparent',
                transition: 'background 0.1s',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {route?.title ?? ride.routeId}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center' }}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{ride.riddenAt}</span>
                  <span style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 3,
                    background: ride.bikeType === 'mtb' ? 'rgba(196,148,61,0.2)' : ride.bikeType === 'ebike' ? 'rgba(90,143,158,0.2)' : 'rgba(158,122,90,0.2)',
                    color: ride.bikeType === 'mtb' ? 'var(--bike-mtb)' : ride.bikeType === 'ebike' ? 'var(--bike-ebike)' : 'var(--bike-gravel)',
                  }}>
                    {ride.bikeType?.toUpperCase()}
                  </span>
                  {ride.rating && <span style={{ color: 'var(--accent)', fontSize: 11 }}>{'★'.repeat(ride.rating)}</span>}
                  {ride.durationMinutes && <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{ride.durationMinutes} min</span>}
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )
        })}
      </div>
    </div>
  )
}