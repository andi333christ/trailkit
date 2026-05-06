import { useState } from 'react'
import { t } from '../i18n/de.js'
import { exportAllData, importData } from '../stores/rideStore.js'

export function Settings({ tileLayer, onTileLayerChange, onClose }) {
  const [statusMsg, setStatusMsg] = useState(null)

  async function handleExport() {
    try {
      const data = await exportAllData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `trailkit-backup-${new Date().toISOString().slice(0,10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setStatusMsg(t('exportSuccess'))
      setTimeout(() => setStatusMsg(null), 3000)
    } catch (e) {
      setStatusMsg('Export failed: ' + e.message)
    }
  }

  async function handleImport() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        await importData(data)
        setStatusMsg(t('importSuccess'))
        setTimeout(() => setStatusMsg(null), 3000)
        window.location.reload()
      } catch (err) {
        setStatusMsg(t('importError') + ' ' + err.message)
      }
    }
    input.click()
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
      {/* Header */}
      <div style={{ padding: 'var(--sp-2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{t('settings')}</span>
        <button className="btn-ghost" onClick={onClose} style={{ padding: 4 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div style={{ padding: 'var(--sp-2)', flex: 1, overflowY: 'auto' }}>
        {/* Tile layer */}
        <div style={{ marginBottom: 'var(--sp-3)' }}>
          <div className="label" style={{ marginBottom: 8 }}>{t('tileLayer')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[['gelande', t('gelande'), 'OpenTopoMap'], ['karte', t('karte'), 'CartoDB Voyager'], ['satellit', t('satellit'), 'ArcGIS World Imagery']].map(([key, label, desc]) => (
              <button
                key={key}
                onClick={() => onTileLayerChange(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: 'var(--sp-1) var(--sp-2)',
                  background: tileLayer === key ? 'var(--bg-tertiary)' : 'transparent',
                  border: '1px solid',
                  borderColor: tileLayer === key ? 'var(--accent)' : 'var(--border)',
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{desc}</div>
                </div>
                {tileLayer === key && <span style={{ color: 'var(--accent)', fontSize: 14 }}>✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Data */}
        <div style={{ marginBottom: 'var(--sp-3)' }}>
          <div className="label" style={{ marginBottom: 8 }}>Daten</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={handleExport} style={{ flex: 1 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                {t('exportData')}
              </span>
            </button>
            <button className="btn-ghost" onClick={handleImport} style={{ flex: 1 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                {t('importData')}
              </span>
            </button>
          </div>
        </div>

        {statusMsg && (
          <div style={{
            padding: 'var(--sp-1) var(--sp-2)',
            background: statusMsg.includes('Fehler') || statusMsg.includes('failed') ? 'rgba(196,90,60,0.15)' : 'rgba(107,158,120,0.15)',
            borderRadius: 'var(--radius)',
            fontSize: 12,
            color: statusMsg.includes('Fehler') || statusMsg.includes('failed') ? 'var(--difficulty-schwer)' : 'var(--difficulty-leicht)',
          }}>
            {statusMsg}
          </div>
        )}
      </div>
    </div>
  )
}