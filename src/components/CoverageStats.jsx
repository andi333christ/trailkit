import { t } from '../i18n/de.js'

export function CoverageStats({ rides, riddenIds, allRoutes }) {
  const totalRoutes = allRoutes.length
  const uniqueRidden = [...riddenIds].length
  const rideCount = rides.length

  // Unique km and Hm from ridden routes
  const riddenRoutes = allRoutes.filter((r) => riddenIds.has(r.id))
  const totalKm = riddenRoutes.reduce((s, r) => s + (r.distance_km || 0), 0)
  const totalHm = riddenRoutes.reduce((s, r) => s + (r.elevation_gain_m || 0), 0)

  // Difficulty breakdown
  const byDifficulty = {
    leicht: { total: 0, ridden: 0 },
    mittel: { total: 0, ridden: 0 },
    schwer: { total: 0, ridden: 0 },
  }
  for (const r of allRoutes) {
    if (byDifficulty[r.difficulty] !== undefined) {
      byDifficulty[r.difficulty].total++
      if (riddenIds.has(r.id)) byDifficulty[r.difficulty].ridden++
    }
  }

  // Bike type breakdown
  const byBike = { mtb: 0, ebike: 0, gravel: 0 }
  for (const ride of rides) {
    if (byBike[ride.bikeType] !== undefined) byBike[ride.bikeType]++
  }

  // Most ridden route
  const routeCount = {}
  for (const ride of rides) {
    routeCount[ride.routeId] = (routeCount[ride.routeId] || 0) + 1
  }
  const mostRiddenId = Object.entries(routeCount).sort((a, b) => b[1] - a[1])[0]?.[0]
  const mostRiddenRoute = allRoutes.find((r) => r.id === mostRiddenId)

  // Last ride
  const lastRide = rides[0] // already sorted desc by riddenAt

  function ProgressBar({ value, max, color }) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0
    return (
      <div style={{ background: 'var(--bg-tertiary)', borderRadius: 3, height: 8, overflow: 'hidden', marginTop: 4 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.4s' }} />
      </div>
    )
  }

  function StatCard({ value, label, sublabel }) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--sp-2) var(--sp-1)' }}>
        <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
        <div className="label" style={{ marginTop: 4 }}>{label}</div>
        {sublabel && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{sublabel}</div>}
      </div>
    )
  }

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: 'var(--bg-primary)',
      zIndex: 150,
      overflowY: 'auto',
      padding: 'var(--sp-3)',
    }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="label" style={{ marginBottom: 'var(--sp-2)' }}>{t('stats').toUpperCase()}</div>

        {/* Big numbers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
          <BigStatCard
            value={uniqueRidden}
            total={totalRoutes}
            label={t('strecken')}
            color="var(--accent)"
          />
          <BigStatCard
            value={totalKm.toFixed(0)}
            total={`${allRoutes.reduce((s,r) => s+(r.distance_km||0), 0).toFixed(0)} km`}
            label={t('kilometer')}
            color="var(--difficulty-mittel)"
          />
          <BigStatCard
            value={totalHm.toLocaleString()}
            label={t('hohemeter')}
            color="var(--difficulty-schwer)"
          />
          <BigStatCard
            value={rideCount}
            label={t('ausfahrten')}
            color="var(--difficulty-leicht)"
          />
        </div>

        {/* Difficulty breakdown */}
        <SectionTitle>{t('breakdown')}</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
          {Object.entries(byDifficulty).map(([diff, { total, ridden }]) => (
            <div key={diff}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span className={`badge badge-${diff}`}>{t(diff)}</span>
                <span className="mono" style={{ color: 'var(--text-secondary)' }}>{ridden}/{total}</span>
              </div>
              <ProgressBar value={ridden} max={total} color={`var(--difficulty-${diff})`} />
            </div>
          ))}
        </div>

        {/* Bike breakdown */}
        <SectionTitle>Nach Bike-Typ</SectionTitle>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
          {[['mtb', t('mtb'), 'var(--bike-mtb)'], ['ebike', t('ebike'), 'var(--bike-ebike)'], ['gravel', t('gravel'), 'var(--bike-gravel)']].map(([key, label, color]) => (
            <div key={key} style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: 'var(--sp-1)', textAlign: 'center' }}>
              <div className="mono" style={{ fontSize: 20, fontWeight: 600, color }}>{byBike[key]}</div>
              <div className="label" style={{ marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Most ridden + last ride */}
        {mostRiddenRoute && (
          <div style={{ marginBottom: 'var(--sp-2)', fontSize: 13 }}>
            <span className="label">{t('mostRidden')}</span>
            <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>{mostRiddenRoute.title} ({routeCount[mostRiddenId]}×)</span>
          </div>
        )}
        {lastRide && (
          <div style={{ fontSize: 13 }}>
            <span className="label">{t('lastRide')}</span>
            <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>{lastRide.riddenAt}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function BigStatCard({ value, total, label, color }) {
  const pct = total ? Math.round((parseFloat(value) / parseFloat(total)) * 100) : null
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: 'var(--radius)',
      padding: 'var(--sp-2)',
      borderLeft: `3px solid ${color}`,
    }}>
      <div className="mono" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>
        {value}{total && pct !== null ? <span style={{ fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 400 }}> / {total}</span> : null}
      </div>
      <div className="label" style={{ marginTop: 4 }}>{label}</div>
    </div>
  )
}

function SectionTitle({ children }) {
  return <div className="label" style={{ marginBottom: 'var(--sp-1)' }}>{children}</div>
}