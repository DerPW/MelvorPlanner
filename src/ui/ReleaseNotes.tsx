import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { RELEASE_NOTES } from '../releaseNotes'

const SEEN = 'melvor-planner:seenVersion'

/** Öffnet die Release Notes einmal, wenn eine neue Version läuft */
export function useReleaseNotesOnUpdate(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    try {
      const seen = localStorage.getItem(SEEN)
      // Erster Start überhaupt: nicht gleich mit Neuigkeiten begrüßen
      if (seen && seen !== __APP_VERSION__) setOpen(true)
      localStorage.setItem(SEEN, __APP_VERSION__)
    } catch {
      // ohne Speicher keine automatische Anzeige
    }
  }, [])
  return [open, setOpen]
}

export function ReleaseNotes({ onClose }: { onClose: () => void }) {
  const { t, lang, locale } = useI18n()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' })

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet notes-sheet" role="dialog" aria-modal="true" aria-label={t('notes.title')}>
        <div className="sheet-head">
          <h2>{t('notes.title')}</h2>
          <p>{t('notes.current', { version: __APP_VERSION__ })}</p>
        </div>
        {RELEASE_NOTES.map((n, i) => {
          const text = n[lang]
          return (
            <section key={n.version} className={`release ${i === 0 ? 'latest' : ''}`}>
              <div className="release-head">
                <span className="release-version">{n.version}</span>
                <b>{text.title}</b>
                <span className="muted">{date.format(new Date(n.date))}</span>
              </div>
              <ul>
                {text.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )
        })}
        <div className="sheet-actions">
          <span className="spacer" />
          <button className="btn primary" onClick={onClose}>
            {t('common.done')}
          </button>
        </div>
      </div>
    </div>
  )
}
