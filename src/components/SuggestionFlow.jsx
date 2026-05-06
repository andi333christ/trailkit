import { useState } from 'react'
import { t } from '../i18n/de.js'
import { suggestRoutes } from '../services/suggest.js'
import { downloadChainGPX } from '../utils/export.js'

const DIFFICULTIES = ['leicht', 'mittel', 'schwer', 'beliebig']

const CURATED_STARTS = [
  { label: 'Wien / Dornbach',              coords: [16.268, 48.232] },
  { label: 'Wien / Liesing',               coords: [16.308, 48.136] },
  { label: 'Wien / Neuwaldegg',            coords: [16.278, 48.248] },
  { label: 'Wien / Perchtoldsdorf',       coords: [16.270, 48.116] },
  { label: 'Klosterneuburg',              coords: [16.325, 48.305] },
  { label: 'Korneuburg',                  coords: [16.333, 48.349] },
  { label: 'Mödling',                     coords: [16.289, 48.086] },
  { label: 'Baden',                       coords: [16.232, 48.001] },
  { label: 'Pressbaum',                   coords: [15.992, 48.183] },
  { label: 'Purkersdorf',                  coords: [16.178, 48.207] },
  { label: 'Mauerbach',                   coords: [16.174, 48.243] },
  { label: 'Tulbing / Tulbinger Kogel',   coords: [15.943, 48.267] },
  { label: 'Kaltenleutgeben',             coords: [16.202, 48.096] },
  { label: 'Gumpoldskirchen',             coords: [16.282, 48.053] },
  { label: 'Alland',                      coords: [16.063, 48.042] },
  { label: 'Heiligenkreuz',               coords: [16.127, 48.052] },
  { label: 'Gaaden',                     coords: [16.176, 48.069] },
  { label: 'Hinterbrühl',                 coords: [16.249, 48.076] },
  { label: 'Wienerwald / Mitte',           coords: [16.100, 48.180] },
]

export function SuggestionFlow({
  allRoutes,
  connectivity,
  rideHistory,
  startPoint,
  endPoint,
  onStartPointSet,
  onEndPointSet,
  onClose,
  onRouteClick,
  onHighlightRoutes,
}) {
  const [minKm, setMinKm] = useState(0)
  const [maxKm, setMaxKm] = useState(40)
  const [difficulty, setDifficulty] = useState('beliebig')
  const [preferUnridden, setPreferUnridden] = useState(true)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedResultIdx, setSelectedResultIdx] = useState(0)

  function handleSuggest() {
    setLoading(true)
    setTimeout(() => {
      const res = suggestRoutes({
        routes: allRoutes,
        connectivity,
        rideHistory,
        startPoint,
        endPoint,
        timeBudgetMinutes: null,
        minDistanceKm: minKm,
        maxDistanceKm: maxKm,
        difficulty,
        preferUnridden,
        maxResults: 5,
      })
      setResults(res)
      setSelectedResultIdx(0)
      setLoading(false)
      if (res.length > 0) {
        onHighlightRoutes(res[0].chain.map((r) => r.id))
      }
    }, 10)
  }

  function handleResultClick(idx) {
    setSelectedResultIdx(idx)
    if (results && results[idx]) {
      onHighlightRoutes(results[idx].chain.map((r) => r.id))
    }
  }

  function handleExport(chain, chainName) {
    downloadChainGPX(chain, chainName)
  }

  function kmLabel() {
    if (minKm === 0 && maxKm >= 80) return 'beliebig'
    return `${minKm}–${maxKm >= 80 ? '80+' : maxKm} km`
  }

  return (
    <div style={{
      width: 340,
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
        <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{t('suggestionTitle')}</span>
        <button className="btn-ghost" onClick={onClose} style={{ padding: 4 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Start point */}
        <div style={{ padding: 'var(--sp-1) var(--sp-2)', borderBottom: '1px solid var(--border)' }}>
          <div className="label" style={{ marginBottom: 4 }}>{t('woStartestDu')}</div>
          {startPoint ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="mono" style={{ fontSize: 12, color: 'var(--accent)' }}>
                {startPoint[0].toFixed(3)}, {startPoint[1].toFixed(3)}
              </span>
              <button className="btn-ghost" onClick={() => onStartPointSet(null)} style={{ fontSize: 11, padding: '2px 6px' }}>
                x
              </button>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t('mapClickHint')}</p>
          )}
          <select
            onChange={(e) => {
              const idx = parseInt(e.target.value)
              if (!isNaN(idx)) onStartPointSet(CURATED_STARTS[idx].coords)
            }}
            style={{ width: '100%', marginTop: 8, height: 32, fontSize: 12 }}
          >
            <option value="">— Startpunkt wahlen —</option>
            {CURATED_STARTS.map((s, i) => (
              <option key={s.label} value={i}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* km range */}
        <div style={{ padding: 'var(--sp-1) var(--sp-2)', borderBottom: '1px solid var(--border)' }}>
          <div className="label" style={{ marginBottom: 6 }}>Streckenlange — {kmLabel()}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', width: 28 }}>Min</span>
              <input
                type="range" min={0} max={80} step={2}
                value={minKm}
                onChange={(e) => {
                  const v = parseInt(e.target.value)
                  setMinKm(Math.min(v, maxKm))
                }}
                style={{ flex: 1, accentColor: 'var(--accent)' }}
              />
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)', width: 28, textAlign: 'right' }}>{minKm}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', width: 28 }}>Max</span>
              <input
                type="range" min={0} max={80} step={2}
                value={maxKm}
                onChange={(e) => {
                  const v = parseInt(e.target.value)
                  setMaxKm(Math.max(v, minKm))
                }}
                style={{ flex: 1, accentColor: 'var(--accent)' }}
              />
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)', width: 28, textAlign: 'right' }}>{maxKm >= 80 ? '80+' : maxKm}</span>
            </div>
          </div>
        </div>

        {/* Difficulty */}
        <div style={{ padding: 'var(--sp-1) var(--sp-2)', borderBottom: '1px solid var(--border)' }}>
          <div className="label" style={{ marginBottom: 4 }}>{t('schwierigkeit')}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                style={{
                  flex: 1, padding: '4px 0', fontSize: 11, borderRadius: 'var(--radius)',
                  background: difficulty === d ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: difficulty === d ? 'var(--bg-primary)' : 'var(--text-secondary)',
                }}
              >
                {t(d)}
              </button>
            ))}
          </div>
        </div>

        {/* Prefer unridden */}
        <div style={{ padding: 'var(--sp-1) var(--sp-2)', borderBottom: '1px solid var(--border)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={preferUnridden}
              onChange={(e) => setPreferUnridden(e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>{t('neueStrecken')}</span>
          </label>
        </div>

        {/* Results */}
        {results !== null && (
          <div style={{ padding: 'var(--sp-2)' }}>
            {results.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', padding: 'var(--sp-2)' }}>
                {t('keineRoute')}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
                {results.map((result, i) => {
                  const chainName = result.chain.map((r) => r.title).join(' > ')
                  const isSelected = i === selectedResultIdx
                  return (
                    <div
                      key={i}
                      onClick={() => handleResultClick(i)}
                      style={{
                        background: isSelected ? 'var(--bg-tertiary)' : 'transparent',
                        border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius)',
                        padding: 'var(--sp-1)',
                        cursor: 'pointer',
                        transition: 'all 0.1s',
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4, lineHeight: 1.3 }}>
                        {result.chain.map((r, j) => (
                          <span key={r.id}>
                            <button
                              onClick={(e) => { e.stopPropagation(); onRouteClick(r.id) }}
                              style={{
                                color: 'var(--accent)',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: 12,
                                fontWeight: 500,
                                padding: 0,
                                textDecoration: 'underline',
                              }}
                            >
                              {r.title}
                            </button>
                            {j < result.chain.length - 1 && (
                              <span style={{ color: 'var(--text-tertiary)', margin: '0 3px' }}>→</span>
                            )}
                          </span>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className="mono" style={{ fontSize: 11 }}>↔ {result.totalDistanceKm.toFixed(1)} km</span>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>↑ {result.totalElevationGain} Hm</span>
                        <span className={`badge badge-${result.maxDifficulty}`}>{result.maxDifficulty}</span>
                        {result.unriddenCount > 0 && (
                          <span style={{ fontSize: 10, color: 'var(--difficulty-leicht)' }}>{result.unriddenCount} neu</span>
                        )}
                        {result.isLoop && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>🔄</span>}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleExport(result.chain, chainName) }}
                          className="btn-ghost"
                          style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 6px' }}
                        >
                          GPX
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Submit */}
      <div style={{ padding: 'var(--sp-2)', borderTop: '1px solid var(--border)' }}>
        <button
          className="btn-primary"
          onClick={handleSuggest}
          disabled={!startPoint || loading}
          style={{ width: '100%', opacity: !startPoint ? 0.5 : 1 }}
        >
          {loading ? t('loading') : t('routeVorschlagen')}
        </button>
      </div>
    </div>
  )
}