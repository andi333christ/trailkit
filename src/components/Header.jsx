import { t } from '../i18n/de.js'

export function Header({ onSuggestClick, onStatsClick, onHistoryClick, onPlansClick, onSettingsClick, onHomeClick }) {
  return (
    <header style={{
      height: 52,
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 var(--sp-2)',
      gap: 'var(--sp-1)',
      flexShrink: 0,
      zIndex: 100,
    }}>
      <button
        onClick={onHomeClick}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--text-primary)',
          letterSpacing: '-0.01em',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          marginRight: 'auto',
        }}
      >
        TrailKit
      </button>

      <button className="btn-primary" onClick={onSuggestClick} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        {t('ichWillFahren')}
      </button>

      <HeaderBtn label={t('stats')} onClick={onStatsClick} />
      <HeaderBtn label={t('history')} onClick={onHistoryClick} />
      <HeaderBtn label={t('plaene')} onClick={onPlansClick} />
      <HeaderBtn label={t('settings')} onClick={onSettingsClick} />
    </header>
  )
}

function HeaderBtn({ label, onClick }) {
  return (
    <button className="btn-ghost" onClick={onClick} style={{ fontSize: 13 }}>
      {label}
    </button>
  )
}