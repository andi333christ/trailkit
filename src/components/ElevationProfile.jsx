import { useState, useRef, useCallback } from 'react'

/**
 * Interactive SVG elevation profile chart.
 * @param {Object} profile - returned by computeElevationProfile()
 * @param {number} [highlightDistKm] - distance to highlight on hover
 */
export function ElevationProfile({ profile, highlightDistKm, onHoverDistKm }) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const [mouseX, setMouseX] = useState(null)
  const containerRef = useRef(null)

  if (!profile || !profile.points || profile.points.length < 2) {
    return (
      <div style={{
        height: 120,
        background: 'var(--bg-tertiary)',
        borderRadius: 'var(--radius)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-tertiary)',
        fontSize: 12,
        flexShrink: 0,
      }}>
        Keine Höhendaten verfügbar
      </div>
    )
  }

  const { points, totalDistKm, totalEleGain, totalEleLoss } = profile

  const W = 340  // SVG width
  const H = 100  // SVG height
  const PAD = { top: 8, right: 8, bottom: 20, left: 8 }

  // Filter to points with elevation data
  const elePoints = points.filter((p) => p.eleM != null)
  if (elePoints.length < 2) {
    return (
      <div style={{
        height: 120,
        background: 'var(--bg-tertiary)',
        borderRadius: 'var(--radius)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-tertiary)',
        fontSize: 12,
        flexShrink: 0,
      }}>
        Keine Höhendaten verfügbar
      </div>
    )
  }

  const minEle = Math.min(...elePoints.map((p) => p.eleM))
  const maxEle = Math.max(...elePoints.map((p) => p.eleM))
  const eleRange = maxEle - minEle || 1
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  function xScale(distKm) {
    return PAD.left + (distKm / totalDistKm) * chartW
  }
  function yScale(eleM) {
    return PAD.top + chartH - ((eleM - minEle) / eleRange) * chartH
  }

  // Build SVG path
  const pathD = points
    .filter((p) => p.eleM != null)
    .map((p, i) => {
      const x = xScale(p.distKm)
      const y = yScale(p.eleM)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const eleArr = points.filter((p) => p.eleM != null)
  // Area fill path (close to bottom)
  const areaD = pathD
    + ` L${xScale(eleArr[eleArr.length - 1].distKm).toFixed(1)},${(PAD.top + chartH).toFixed(1)}`
    + ` L${xScale(eleArr[0].distKm).toFixed(1)},${(PAD.top + chartH).toFixed(1)} Z`

  // Hover state
  const hoverPt = hoverIdx !== null ? points[hoverIdx] : null
  const hoverX = hoverPt ? xScale(hoverPt.distKm) : null

  // Vertical hover line
  const VLINE = hoverX != null
    ? `M${hoverX.toFixed(1)},${PAD.top} L${hoverX.toFixed(1)},${PAD.top + chartH}`
    : null

  function handleMouseMove(e) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const svgX = e.clientX - rect.left
    const relX = svgX - PAD.left
    const distKm = (relX / chartW) * totalDistKm

    // Find nearest point
    let nearestIdx = 0
    let nearestDist = Infinity
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i].distKm - distKm)
      if (d < nearestDist) { nearestDist = d; nearestIdx = i }
    }
    setHoverIdx(nearestIdx)
    setMouseX(svgX)
    onHoverDistKm?.(points[nearestIdx]?.distKm ?? null)
  }

  function handleMouseLeave() {
    setHoverIdx(null)
    setMouseX(null)
    onHoverDistKm?.(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <svg
        ref={containerRef}
        width={W}
        height={H}
        style={{ display: 'block', overflow: 'visible', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Area fill */}
        <defs>
          <linearGradient id="ele-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--difficulty-schwer)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--difficulty-schwer)" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {areaD && (
          <path
            d={areaD}
            fill="url(#ele-grad)"
            stroke="none"
          />
        )}
        {/* Line */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke="var(--difficulty-schwer)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {/* Hover line */}
        {VLINE && (
          <line
            x1={hoverX} y1={PAD.top}
            x2={hoverX} y2={PAD.top + chartH}
            stroke="var(--accent)"
            strokeWidth="1"
            strokeDasharray="3,2"
          />
        )}
        {/* Hover dot */}
        {hoverPt && hoverPt.eleM != null && (
          <>
            <circle
              cx={hoverX}
              cy={yScale(hoverPt.eleM)}
              r={4}
              fill="var(--accent)"
              stroke="var(--bg-secondary)"
              strokeWidth={1.5}
            />
            {/* Tooltip label */}
            <rect
              x={Math.min(Math.max(hoverX - 30, PAD.left), W - PAD.right - 60)}
              y={Math.max(PAD.top - 22, 0)}
              width={60}
              height={18}
              rx={3}
              fill="var(--bg-secondary)"
            />
            <text
              x={Math.min(Math.max(hoverX, PAD.left + 30), W - PAD.right - 30)}
              y={Math.max(PAD.top - 9, 9)}
              textAnchor="middle"
              fill="var(--text-primary)"
              fontSize={10}
              fontFamily="var(--font-mono)"
            >
              {hoverPt.distKm.toFixed(1)}km / {Math.round(hoverPt.eleM)}m
            </text>
          </>
        )}
        {/* Distance labels */}
        {[0, totalDistKm / 2, totalDistKm].map((d) => (
          <text
            key={d}
            x={xScale(d)}
            y={H - 4}
            textAnchor={d === 0 ? 'start' : d === totalDistKm ? 'end' : 'middle'}
            fill="var(--text-tertiary)"
            fontSize={9}
            fontFamily="var(--font-mono)"
          >
            {d.toFixed(1)} km
          </text>
        ))}
      </svg>

      {/* Stats below */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        {totalEleGain > 0 && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--difficulty-schwer)' }}>
            ↑ {totalEleGain} Hm
          </span>
        )}
        {totalEleLoss > 0 && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--difficulty-leicht)' }}>
            ↓ {totalEleLoss} Hm
          </span>
        )}
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          ↔ {totalDistKm.toFixed(1)} km
        </span>
      </div>
    </div>
  )
}
