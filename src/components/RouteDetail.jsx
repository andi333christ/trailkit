import { useState } from 'react'
import { t } from '../i18n/de.js'
import { downloadGPX } from '../utils/export.js'

const MONTH_NAMES = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

export function RouteDetail({ route, rides, riddenIds, onClose, onLogRide, onEditRide, onDeleteRide }) {
  const [showLogForm, setShowLogForm] = useState(false)
  const [editingRide, setEditingRide] = useState(null)
  const isRidden = riddenIds.has(route.id)

  function handleExport() {
    downloadGPX(route, route.title)
  }

  return (
    <div style={{
      width: 380,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-secondary)',
      borderLeft: '1px solid var(--border)',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: 'var(--sp-2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 600, flex: 1, lineHeight: 1.3 }}>{route.title}</span>
        <button className="btn-ghost" onClick={onClose} style={{ padding: 4 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div style={{ overflowY: 'auto', flex: 1, padding: 'var(--sp-2)' }}>
        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-2)', marginBottom: 'var(--sp-2)' }}>
          <StatBox label="km" value={route.distance_km?.toFixed(1) ?? '—'} />
          <StatBox label="Hm ↑" value={route.elevation_gain_m ?? '—'} />
          <StatBox label="min" value={route.duration_minutes ?? '—'} />
        </div>

        {/* Difficulty + Loop */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--sp-2)', alignItems: 'center' }}>
          <span className={`badge badge-${route.difficulty}`}>{t(route.difficulty)}</span>
          {route.is_loop && <span className="label">{t('loop')}</span>}
          {route.has_refreshments && <span className="label" style={{ color: 'var(--difficulty-leicht)' }}>🍺</span>}
          {isRidden && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--accent)' }}>✓ {t('ridden')}</span>}
        </div>

        {/* Description */}
        {route.description && (
          <Section title={null}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{route.description}</p>
          </Section>
        )}

        {/* Route description */}
        {route.route_description && (
          <Section title="Streckenbeschreibung">
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{route.route_description}</p>
          </Section>
        )}

        {/* Surface */}
        {route.surface && (
          <Section title={t('surface')}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{route.surface}</p>
          </Section>
        )}

        {/* Safety */}
        {route.safety_notes && (
          <Section title={t('safety')}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{route.safety_notes}</p>
          </Section>
        )}

        {/* Equipment */}
        {route.equipment && (
          <Section title={t('equipment')}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{route.equipment}</p>
          </Section>
        )}

        {/* Tips */}
        {route.tips && (
          <Section title={t('tips')}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{route.tips}</p>
          </Section>
        )}

        {/* Recommended months */}
        {route.recommended_months?.length > 0 && route.recommended_months.length < 12 && (
          <Section title={t('recommendedMonths')}>
            <div style={{ display: 'flex', gap: 3 }}>
              {MONTH_NAMES.map((m, i) => (
                <span key={i} style={{
                  width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 600,
                  background: route.recommended_months.includes(m) ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: route.recommended_months.includes(m) ? 'var(--bg-primary)' : 'var(--text-tertiary)',
                  borderRadius: 3,
                }}>
                  {m}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Ride history for this route */}
        {rides.length > 0 && (
          <Section title={`${t('history')} (${rides.length})`}>
            {rides.map((ride) => (
              <RideEntry
                key={ride.id}
                ride={ride}
                onEdit={() => { setEditingRide(ride); setShowLogForm(true) }}
                onDelete={() => onDeleteRide(ride.id)}
              />
            ))}
          </Section>
        )}

        <div style={{ height: 'var(--sp-4)' }} />
      </div>

      {/* Action bar */}
      <div style={{ padding: 'var(--sp-2)', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <button className="btn-primary" onClick={() => setShowLogForm(true)} style={{ flex: 1 }}>
          {isRidden ? t('writeReview') : t('gefahren')}
        </button>
        <button className="btn-ghost" onClick={handleExport} style={{ flex: 1 }}>
          {t('gpxExport')}
        </button>
      </div>

      {/* Ride logging modal */}
      {showLogForm && (
        <RideLogForm
          ride={editingRide}
          onSave={(data) => {
            if (editingRide) {
              onEditRide(editingRide.id, data)
            } else {
              onLogRide({ routeId: route.id, ...data })
            }
            setShowLogForm(false)
            setEditingRide(null)
          }}
          onCancel={() => { setShowLogForm(false); setEditingRide(null) }}
        />
      )}
    </div>
  )
}

function StatBox({ label, value }) {
  return (
    <div style={{
      background: 'var(--bg-tertiary)',
      borderRadius: 'var(--radius)',
      padding: 'var(--sp-1)',
      textAlign: 'center',
    }}>
      <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
      <div className="label" style={{ marginTop: 2 }}>{label}</div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 'var(--sp-2)' }}>
      {title && <div className="label" style={{ marginBottom: 4 }}>{title}</div>}
      {children}
    </div>
  )
}

function RideEntry({ ride, onEdit, onDelete }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 0',
      borderBottom: '1px solid var(--border)',
      fontSize: 12,
    }}>
      <span className="mono" style={{ color: 'var(--text-secondary)', minWidth: 80 }}>{ride.riddenAt}</span>
      <span style={{
        padding: '1px 6px',
        borderRadius: 3,
        fontSize: 10,
        background: ride.bikeType === 'mtb' ? 'rgba(196,148,61,0.2)' : ride.bikeType === 'ebike' ? 'rgba(90,143,158,0.2)' : 'rgba(158,122,90,0.2)',
        color: ride.bikeType === 'mtb' ? 'var(--bike-mtb)' : ride.bikeType === 'ebike' ? 'var(--bike-ebike)' : 'var(--bike-gravel)',
      }}>
        {ride.bikeType?.toUpperCase()}
      </span>
      {ride.rating && <span style={{ color: 'var(--accent)' }}>{'★'.repeat(ride.rating)}</span>}
      <button onClick={onEdit} className="btn-ghost" style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 6px' }}>{t('edit')}</button>
      <button onClick={onDelete} className="btn-ghost" style={{ fontSize: 11, padding: '2px 6px', color: 'var(--difficulty-schwer)' }}>{t('delete')}</button>
    </div>
  )
}

function RideLogForm({ ride, onSave, onCancel }) {
  const [form, setForm] = useState({
    riddenAt: ride?.riddenAt || new Date().toISOString().slice(0, 10),
    bikeType: ride?.bikeType || 'mtb',
    rating: ride?.rating || 0,
    tags: ride?.tags || [],
    notes: ride?.notes || '',
    durationMinutes: ride?.durationMinutes || '',
  })

  const PREDEFINED_TAGS = ['flow', 'scenic', 'technical', 'muddy', 'rocky', 'rooty', 'exposed', 'panoramic']

  function toggleTag(tag) {
    setForm(f => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag]
    }))
  }

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 200,
      padding: 'var(--sp-2)',
    }}>
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 'var(--sp-2)',
        width: '100%',
        maxWidth: 360,
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 'var(--sp-2)' }}>
          {ride ? t('edit') : t('gefahren')}
        </h3>

        <FormField label={t('datum')}>
          <input type="date" value={form.riddenAt} onChange={e => setForm(f => ({ ...f, riddenAt: e.target.value }))} style={{ width: '100%' }} />
        </FormField>

        <FormField label={t('bike')}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['mtb', t('mtb')], ['ebike', t('ebike')], ['gravel', t('gravel')]].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setForm(f => ({ ...f, bikeType: val }))}
                style={{
                  flex: 1, padding: '4px 0', fontSize: 12,
                  borderRadius: 'var(--radius)',
                  background: form.bikeType === val ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: form.bikeType === val ? 'var(--bg-primary)' : 'var(--text-secondary)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </FormField>

        <FormField label={t('bewertung')}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => setForm(f => ({ ...f, rating: n }))} style={{ fontSize: 18, color: n <= form.rating ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                ★
              </button>
            ))}
          </div>
        </FormField>

        <FormField label="Tags">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {PREDEFINED_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                style={{
                  padding: '2px 8px', fontSize: 11, borderRadius: 3,
                  background: form.tags.includes(tag) ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: form.tags.includes(tag) ? 'var(--bg-primary)' : 'var(--text-secondary)',
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        </FormField>

        <FormField label={t('dauer')}>
          <input
            type="number"
            placeholder="Minuten"
            value={form.durationMinutes}
            onChange={e => setForm(f => ({ ...f, durationMinutes: e.target.value ? parseInt(e.target.value) : '' }))}
            style={{ width: '100%' }}
          />
        </FormField>

        <FormField label={t('notizen')}>
          <textarea
            rows={2}
            placeholder={t('notizenPlaceholder')}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </FormField>

        <div style={{ display: 'flex', gap: 8, marginTop: 'var(--sp-2)' }}>
          <button className="btn-ghost" onClick={onCancel} style={{ flex: 1 }}>{t('cancel')}</button>
          <button className="btn-primary" onClick={() => onSave(form)} style={{ flex: 1 }}>{t('save')}</button>
        </div>
      </div>
    </div>
  )
}

function FormField({ label, children }) {
  return (
    <div style={{ marginBottom: 'var(--sp-2)' }}>
      <div className="label" style={{ marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}