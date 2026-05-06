import { useState, useRef } from 'react'
import { t } from '../i18n/de.js'
import { suggestRoutes } from '../services/suggest.js'
import { downloadChainGPX } from '../utils/export.js'
import { addPlan } from '../stores/rideStore.js'

const DIFFICULTIES = ['leicht', 'mittel', 'schwer', 'beliebig']

// Curated Austrian/lower-wienerwald trail areas — clean labels, real coords
const CURATED_STARTS = [
  { label: 'Wien / Dornbach',             coords: [16.268, 48.232], area: 'Wien Nord' },
  { label: 'Wien / Neuwaldegg',           coords: [16.278, 48.248], area: 'Wien Nord' },
  { label: 'Wien / Kahlenberg',           coords: [16.332, 48.238], area: 'Wien Nord' },
  { label: 'Klosterneuburg / Kierling',   coords: [16.325, 48.305], area: 'Klosterneuburg' },
  { label: 'Korneuburg',                  coords: [16.333, 48.349], area: 'Klosterneuburg' },
  { label: 'Mauerbach',                   coords: [16.174, 48.243], area: 'Wien West' },
  { label: 'Wien / Purkersdorf',          coords: [16.178, 48.207], area: 'Wien West' },
  { label: 'Pressbaum',                   coords: [15.992, 48.183], area: 'Wien West' },
  { label: 'Tulbinger Kogel',             coords: [15.943, 48.267], area: 'Wien West' },
  { label: 'Mödling / Hinterbrühl',       coords: [16.249, 48.076], area: 'Mödling' },
  { label: 'Kaltenleutgeben',            coords: [16.202, 48.096], area: 'Mödling' },
  { label: 'Gumpoldskirchen',             coords: [16.282, 48.053], area: 'Mödling' },
  { label: 'Perchtoldsdorf',              coords: [16.270, 48.116], area: 'Mödling' },
  { label: 'Gaaden',                      coords: [16.176, 48.069], area: 'Mödling' },
  { label: 'Baden',                       coords: [16.232, 48.001], area: 'Baden' },
  { label: 'Alland',                      coords: [16.063, 48.042], area: 'Baden' },
  { label: 'Heiligenkreuz',              coords: [16.127, 48.052], area: 'Baden' },
  { label: 'Wienerwald Mitte',            coords: [16.100, 48.180], area: 'Zentral' },
]

export function SuggestionFlow({
  allRoutes,
  connectivity,
  rideHistory,
  startPoint,
  onStartPointSet,
  onClose,
  onRouteClick,
  onHighlightRoutes,
}) {
  const [search, setSearch] = useState('')
  const [minKm, setMinKm] = useState(10)
  const [maxKm, setMaxKm] = useState(40)
  const [difficulty, setDifficulty] = useState('beliebig')
  const [preferUnridden, setPreferUnridden] = useState(true)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(null)
  const [savingIdx, setSavingIdx] = useState(null)
  const [savedIdx, setSavedIdx] = useState(new Set())
  const [error, setError] = useState(null)

  // Filter curated starts by search
  const filtered = CURATED_STARTS.filter((s) =>
    s.label.toLowerCase().includes(search.toLowerCase()) ||
    (s.area || '').toLowerCase().includes(search.toLowerCase())
  )

  function handleStartSelect(coords) {
    onStartPointSet(coords)
    setResults(null)
    setSelectedIdx(null)
  }

  function handleSuggest() {
    if (!startPoint) return
    setError(null)
    setLoading(true)
    setSelectedIdx(null)
    setResults(null)

    // Run in next tick so loading state renders first
    setTimeout(() => {
      try {
        const res = suggestRoutes({
          routes: allRoutes,
          connectivity,
          rideHistory,
          startPoint,
          endPoint: null,
          minDistanceKm: minKm,
          maxDistanceKm: maxKm,
          difficulty,
          preferUnridden,
          maxResults: 6,
        })
        setResults(res)
        setSelectedIdx(res.length > 0 ? 0 : null)
        setLoading(false)
        if (res.length > 0) {
          onHighlightRoutes(res[0].chain.map((r) => r.id))
        } else {
          onHighlightRoutes([])
        }
      } catch (e) {
        setLoading(false)
        setError('Berechnungsfehler: ' + e.message)
      }
    }, 50)
  }

  function handleResultSelect(idx) {
    setSelectedIdx(idx)
    if (results && results[idx]) {
      onHighlightRoutes(results[idx].chain.map((r) => r.id))
    }
  }

  function handleExport(chain, name) {
    downloadChainGPX(chain, name)
  }

  async function handleSavePlan(idx) {
    setSavingIdx(idx)
    const result = results[idx]
    const chainName = result.chain.map((r) => r.title).join(' → ')
    try {
      await addPlan({
        name: chainName,
        routeIds: result.chain.map((r) => r.id),
        totalDistanceKm: result.totalDistanceKm,
        totalDurationMinutes: result.totalDurationMinutes,
        totalElevationGain: result.totalElevationGain,
      })
      setSavedIdx((s) => new Set([...s, idx]))
    } catch (e) {
      // silently fail
    }
    setSavingIdx(null)
  }

  function kmLabel() {
    if (minKm === 0 && maxKm >= 80) return 'beliebig'
    return `${minKm}–${maxKm >= 80 ? '80+' : maxKm} km`
  }

  const selectedResult = selectedIdx !== null && results ? results[selectedIdx] : null

  return (
    <div className="suggestion-flow">
      {/* Header */}
      <div className="suggestion-flow__header">
        <span className="suggestion-flow__title">{t('suggestionTitle')}</span>
        <button className="btn-ghost" onClick={onClose} style={{ padding: 4 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="suggestion-flow__body">
        {/* ── Area picker ── */}
        <div className="suggestion-flow__section">
          <div className="label" style={{ marginBottom: 6 }}>{t('woStartestDu')}</div>

          {startPoint ? (
            <div className="suggestion-flow__start-active">
              <div className="suggestion-flow__start-coords">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--accent)" stroke="none">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
                <span className="mono" style={{ fontSize: 12, color: 'var(--accent)' }}>
                  {startPoint[0].toFixed(3)}, {startPoint[1].toFixed(3)}
                </span>
              </div>
              <button
                className="btn-ghost"
                onClick={() => { onStartPointSet(null); setResults(null) }}
                style={{ fontSize: 11, padding: '2px 6px' }}
              >
                ändern
              </button>
            </div>
          ) : (
            <p className="suggestion-flow__hint">{t('mapClickHint')}</p>
          )}

          <div className="suggestion-flow__area-search">
            <input
              type="text"
              placeholder="Gebiet suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', height: 32, fontSize: 12 }}
            />
          </div>

          <div className="suggestion-flow__area-list">
            {filtered.map((s) => (
              <button
                key={s.label}
                className={`suggestion-flow__area-btn${startPoint && startPoint[0] === s.coords[0] && startPoint[1] === s.coords[1] ? ' is-active' : ''}`}
                onClick={() => handleStartSelect(s.coords)}
              >
                <span className="suggestion-flow__area-name">{s.label}</span>
                {s.area && <span className="suggestion-flow__area-region">{s.area}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="suggestion-flow__section">
          {/* km range */}
          <div style={{ marginBottom: 12 }}>
            <div className="label" style={{ marginBottom: 6 }}>Streckenlänge — {kmLabel()}</div>
            <div className="suggestion-flow__dual-range">
              <div className="suggestion-flow__range-row">
                <span className="mono suggestion-flow__range-val">{minKm}</span>
                <input
                  type="range" min={0} max={80} step={5}
                  value={minKm}
                  onChange={(e) => {
                    const v = parseInt(e.target.value)
                    setMinKm(Math.min(v, maxKm))
                  }}
                  className="suggestion-flow__range-slider"
                />
              </div>
              <div className="suggestion-flow__range-row">
                <span className="mono suggestion-flow__range-val">{maxKm >= 80 ? '80+' : maxKm}</span>
                <input
                  type="range" min={0} max={80} step={5}
                  value={maxKm}
                  onChange={(e) => {
                    const v = parseInt(e.target.value)
                    setMaxKm(Math.max(v, minKm))
                  }}
                  className="suggestion-flow__range-slider"
                />
              </div>
            </div>
          </div>

          {/* Difficulty */}
          <div style={{ marginBottom: 10 }}>
            <div className="label" style={{ marginBottom: 6 }}>{t('schwierigkeit')}</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`suggestion-flow__diff-btn${difficulty === d ? ' is-active' : ''}`}
                  data-diff={d}
                >
                  {t(d)}
                </button>
              ))}
            </div>
          </div>

          {/* Prefer unridden */}
          <label className="suggestion-flow__checkbox">
            <input
              type="checkbox"
              checked={preferUnridden}
              onChange={(e) => setPreferUnridden(e.target.checked)}
            />
            <span>{t('neueStrecken')}</span>
          </label>
        </div>

        {/* ── Results ── */}
        {error && (
          <div className="suggestion-flow__error">{error}</div>
        )}

        {results !== null && results.length === 0 && !loading && (
          <div className="suggestion-flow__empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <p>{t('keineRoute')}</p>
          </div>
        )}

        {results !== null && results.length > 0 && (
          <div className="suggestion-flow__results">
            <div className="suggestion-flow__results-count">
              {results.length} Vorschläge
            </div>

            {/* Featured: first result large */}
            <ResultCard
              result={results[0]}
              index={0}
              isSelected={selectedIdx === 0}
              isSaved={savedIdx.has(0)}
              isSaving={savingIdx === 0}
              onSelect={() => handleResultSelect(0)}
              onExport={() => handleExport(results[0].chain, results[0].chain.map((r) => r.title).join(' → '))}
              onSave={() => handleSavePlan(0)}
              onRouteClick={onRouteClick}
              featured
            />

            {/* Other results */}
            {results.slice(1).map((result, i) => (
              <ResultCard
                key={i + 1}
                result={result}
                index={i + 1}
                isSelected={selectedIdx === i + 1}
                isSaved={savedIdx.has(i + 1)}
                isSaving={savingIdx === i + 1}
                onSelect={() => handleResultSelect(i + 1)}
                onExport={() => handleExport(result.chain, result.chain.map((r) => r.title).join(' → '))}
                onSave={() => handleSavePlan(i + 1)}
                onRouteClick={onRouteClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer: submit */}
      <div className="suggestion-flow__footer">
        <button
          className="btn-primary"
          onClick={handleSuggest}
          disabled={!startPoint || loading}
          style={{ width: '100%', opacity: !startPoint ? 0.45 : 1 }}
        >
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 0.8s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              {t('loading')}
            </span>
          ) : t('routeVorschlagen')}
        </button>
      </div>
    </div>
  )
}

function ResultCard({ result, index, isSelected, isSaved, isSaving, onSelect, onExport, onSave, onRouteClick, featured }) {
  const chainName = result.chain.map((r) => r.title).join(' → ')
  const unriddenCount = result.unriddenCount
  const unriddenPct = result.unriddenPercent

  return (
    <div
      className={`result-card${isSelected ? ' is-selected' : ''}${featured ? ' result-card--featured' : ''}`}
      onClick={onSelect}
    >
      {/* Chain steps */}
      <div className={`result-card__chain${featured ? ' result-card__chain--featured' : ''}`}>
        {result.chain.map((route, i) => (
          <div key={route.id} className="result-card__step">
            {i > 0 && <div className="result-card__connector" />}
            <div className="result-card__route-dot" data-diff={route.difficulty} />
            <button
              className="result-card__route-name"
              onClick={(e) => { e.stopPropagation(); onRouteClick(route.id) }}
              title={route.title}
            >
              {route.title}
            </button>
            {!featured && i === result.chain.length - 1 && (
              <span className={`badge badge-${route.difficulty}`} style={{ marginLeft: 'auto', flexShrink: 0 }}>
                {route.difficulty}
              </span>
            )}
            {featured && (
              <div className="result-card__route-meta">
                <span className="mono" style={{ fontSize: 10 }}>↔ {route.distance_km?.toFixed(1)} km</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>↑ {route.elevation_gain_m} Hm</span>
                <span className={`badge badge-${route.difficulty}`}>{route.difficulty}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Stats row */}
      <div className="result-card__stats">
        <span className="mono result-card__stat">
          <strong>{result.totalDistanceKm.toFixed(1)}</strong> km
        </span>
        <span className="mono result-card__stat">
          <strong>{result.totalElevationGain}</strong> Hm
        </span>
        {unriddenCount > 0 && (
          <span className="result-card__stat result-card__stat--new">
            {unriddenCount} neu {!featured && `(${unriddenPct}%)`}{featured && ''}
          </span>
        )}
        {result.isLoop && (
          <span className="result-card__stat result-card__stat--loop">🔄 Schleife</span>
        )}
        {featured && result.maxDifficulty && (
          <span className={`badge badge-${result.maxDifficulty}`} style={{ marginLeft: 'auto' }}>
            {result.maxDifficulty}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="result-card__actions">
        {isSaved ? (
          <span className="result-card__saved">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--difficulty-leicht)" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Gespeichert
          </span>
        ) : (
          <button
            className="btn-ghost result-card__btn"
            onClick={(e) => { e.stopPropagation(); onSave() }}
            disabled={isSaving}
          >
            {isSaving ? '…' : t('speichern')}
          </button>
        )}
        <button
          className="btn-ghost result-card__btn"
          onClick={(e) => { e.stopPropagation(); onExport() }}
        >
          GPX
        </button>
      </div>
    </div>
  )
}
