import { useState } from 'react'
import { t } from '../i18n/de.js'
import { DIFFICULTIES, SORT_OPTIONS } from '../utils/filters.js'

export function FilterBar({ filters, onChange, totalCount, filteredCount }) {
  const [expanded, setExpanded] = useState(false)

  function setFilter(key, value) {
    onChange({ ...filters, [key]: value })
  }

  function clearAll() {
    onChange({
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
  }

  const hasActiveFilters =
    filters.difficulties?.length > 0 ||
    filters.loopOnly ||
    filters.status !== 'all' ||
    filters.search ||
    filters.minDist > 0 ||
    filters.maxDist < 80

  function distLabel() {
    if (filters.minDist === 0 && filters.maxDist >= 80) return 'Entfernung — beliebig'
    return `Entfernung — ${filters.minDist}–${filters.maxDist >= 80 ? '80+' : filters.maxDist} km`
  }

  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-secondary)',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Search row */}
      <div style={{ padding: 'var(--sp-1) var(--sp-2)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          placeholder={t('searchPlaceholder')}
          value={filters.search || ''}
          onChange={(e) => setFilter('search', e.target.value)}
          style={{ flex: 1, height: 32 }}
        />
        <span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          {t('routesCount', { count: filteredCount, total: totalCount })}
        </span>
        <button
          className="btn-ghost"
          onClick={() => setExpanded(!expanded)}
          style={{ fontSize: 11, padding: '4px 8px' }}
        >
          {t('filter')} {expanded ? '▲' : '▼'}
        </button>
        {hasActiveFilters && (
          <button className="btn-ghost" onClick={clearAll} style={{ fontSize: 11, padding: '4px 8px', color: 'var(--accent)' }}>
            {t('clearAll')}
          </button>
        )}
      </div>

      {/* Expanded filters */}
      {expanded && (
        <div style={{
          padding: 'var(--sp-1) var(--sp-2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-2)',
          borderTop: '1px solid var(--border)',
          overflowY: 'auto',
          maxHeight: 300,
        }}>
          {/* km range */}
          <FilterGroup label={distLabel()}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', width: 24 }}>Min</span>
                <input
                  type="range" min={0} max={80} step={2}
                  value={filters.minDist}
                  onChange={(e) => {
                    const v = parseInt(e.target.value)
                    setFilter('minDist', Math.min(v, filters.maxDist))
                  }}
                  style={{ flex: 1, accentColor: 'var(--accent)' }}
                />
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-secondary)', width: 24, textAlign: 'right' }}>{filters.minDist}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', width: 24 }}>Max</span>
                <input
                  type="range" min={0} max={80} step={2}
                  value={filters.maxDist}
                  onChange={(e) => {
                    const v = parseInt(e.target.value)
                    setFilter('maxDist', Math.max(v, filters.minDist))
                  }}
                  style={{ flex: 1, accentColor: 'var(--accent)' }}
                />
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-secondary)', width: 28, textAlign: 'right' }}>
                  {filters.maxDist >= 80 ? '80+' : filters.maxDist}
                </span>
              </div>
            </div>
          </FilterGroup>

          {/* Difficulty */}
          <FilterGroup label={t('difficulty')}>
            <div style={{ display: 'flex', gap: 6 }}>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    const curr = filters.difficulties || []
                    const next = curr.includes(d) ? curr.filter((x) => x !== d) : [...curr, d]
                    setFilter('difficulties', next)
                  }}
                  className={`badge badge-${d}`}
                  style={{
                    cursor: 'pointer',
                    border: (filters.difficulties || []).includes(d)
                      ? `2px solid var(--difficulty-${d})`
                      : '2px solid transparent',
                  }}
                >
                  {t(d)}
                </button>
              ))}
            </div>
          </FilterGroup>

          {/* Status */}
          <FilterGroup label={t('status')}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[['all', t('all')], ['ridden', t('ridden')], ['unridden', t('unridden')]].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilter('status', val)}
                  style={{
                    padding: '3px 10px',
                    fontSize: 12,
                    borderRadius: 'var(--radius)',
                    background: filters.status === val ? 'var(--accent)' : 'var(--bg-tertiary)',
                    color: filters.status === val ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </FilterGroup>

          {/* Loop only */}
          <FilterGroup>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={filters.loopOnly || false}
                onChange={(e) => setFilter('loopOnly', e.target.checked)}
              />
              <span style={{ fontSize: 13 }}>{t('loopOnly')}</span>
            </label>
          </FilterGroup>

          {/* Sort */}
          <FilterGroup label="Sortieren">
            <select
              value={filters.sortBy || 'name'}
              onChange={(e) => onChange({ ...filters, sortBy: e.target.value })}
              style={{ width: '100%', height: 32 }}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </FilterGroup>
        </div>
      )}
    </div>
  )
}

function FilterGroup({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && <label className="label">{label}</label>}
      {children}
    </div>
  )
}
