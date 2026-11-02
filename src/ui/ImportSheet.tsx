import { useEffect, useRef, useState } from 'react'
import { fmtInt } from '../core/format'
import { GP } from '../core/route'
import { errMsg, type SaveData } from '../core/save'
import { profileFromSave, readSave, type ImportResult } from '../core/saveImport'
import type { Msg } from '../core/types'
import { useI18n } from '../i18n'
import { GameIcon, Sym } from './components'
import { useGame } from './state'

const SAVE_DIR = '~/Library/Application Support/Games By Malcs/Melvor Idle 2/steam/'

/** macOS-Sheet: Spielstand als Datei oder Export-Text → Vorschau → übernehmen */
export function ImportSheet({ onClose }: { onClose: () => void }) {
  const { index, state, dispatch } = useGame()
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Msg | null>(null)
  const [save, setSave] = useState<SaveData | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [drag, setDrag] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const load = async (input: File | string) => {
    setBusy(true)
    setError(null)
    try {
      const s = await readSave(input)
      setSave(s)
      setResult(profileFromSave(index, s, state.profile))
    } catch (e) {
      setSave(null)
      setResult(null)
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const apply = () => {
    if (!result) return
    dispatch({ type: 'importProfile', profile: result.profile })
    onClose()
  }

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={t('import.title')}>
        <div className="sheet-head">
          <h2>{t('import.title')}</h2>
          <p>{t('import.subtitle')}</p>
        </div>

        {!save && (
          <>
            <div
              className={`drop ${drag ? 'over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDrag(true)
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDrag(false)
                const f = e.dataTransfer.files[0]
                if (f) load(f)
              }}
              onClick={() => file.current?.click()}
            >
              <GameIcon src="game/icons/Icons/Bank.webp" size={34} />
              <b>{t('import.drop')}</b>
              <span>{t('import.dropHint')}</span>
              <input
                ref={file}
                type="file"
                accept=".sav,application/octet-stream"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) load(f)
                }}
              />
            </div>
            <div className="path-hint">
              <span>
                {t('import.pathBefore')} <code>{SAVE_DIR}&lt;Steam-ID&gt;/saves/</code> {t('import.pathAfter')}
              </span>
              <button className="btn plain small" onClick={() => navigator.clipboard?.writeText(SAVE_DIR.replace('~', '$HOME'))}>
                {t('import.copyPath')}
              </button>
            </div>

            <div className="or">
              <span>{t('import.or')}</span>
            </div>
            <textarea
              className="paste"
              placeholder={t('import.pastePlaceholder')}
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
            />
          </>
        )}

        {busy && <p className="muted">{t('import.reading')}</p>}
        {error && (
          <p className="note bad" style={{ height: 'auto', padding: '6px 10px', borderRadius: 8 }}>
            <Sym name="warn" size={14} /> {t(error)}
          </p>
        )}

        {save && result && <Preview save={save} result={result} />}

        <div className="sheet-actions">
          {save && (
            <button
              className="btn plain"
              onClick={() => {
                setSave(null)
                setResult(null)
              }}
            >
              {t('import.other')}
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          {save ? (
            <button className="btn primary" onClick={apply}>
              {t('import.apply')}
            </button>
          ) : (
            <button className="btn primary" disabled={!text.trim() || busy} onClick={() => load(text)}>
              {t('import.read')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Preview({ save, result }: { save: SaveData; result: ImportResult }) {
  const { index } = useGame()
  const { t, locale } = useI18n()
  const p = result.profile
  const skills = index.data.skills.filter((s) => (p.levels[s.id] ?? 1) > 1)
  const totalLevel = Object.values(p.levels).reduce((a, b) => a + b, 0)
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <div className="preview">
      <div className="preview-who">
        <div>
          <b>{save.character || t('live.unnamed')}</b>
          <span className="muted">
            {' '}
            · {save.gamemode}
            {save.isDemo ? ' · Demo' : ''}
          </span>
        </div>
        <span className="muted">{save.savedAt ? t('live.saved', { time: dateFmt.format(save.savedAt) }) : ''}</span>
      </div>
      <div className="preview-facts">
        <span>{t('import.fact.level', { n: totalLevel })}</span>
        <span>
          <GameIcon src={index.currencies.get(GP)?.icon} size={14} /> <b>{fmtInt(p.currencies[GP] ?? 0)}</b> GP
        </span>
        <span>{t('import.fact.bank', { n: Object.keys(p.inventory).length })}</span>
        <span>{t('import.fact.purchases', { n: Object.keys(p.owned).length })}</span>
        {p.equipped && p.equipped.length > 0 && <span>{t('import.fact.tools', { n: p.equipped.length })}</span>}
      </div>
      {skills.length > 0 && (
        <div className="preview-skills">
          {skills.map((s) => (
            <span key={s.id} title={`${fmtInt(p.xp?.[s.id] ?? 0)} XP`}>
              <GameIcon src={s.icon} size={16} /> {p.levels[s.id]}
            </span>
          ))}
        </div>
      )}
      {result.pendingLevelUps.map((u) => (
        <p key={u.skill} className="preview-note">
          {t('import.pendingLevel', { skill: index.skills.get(u.skill)?.name ?? u.skill, byXp: u.byXp, saved: u.saved })}
        </p>
      ))}
      {save.warnings.map((w) => (
        <p key={JSON.stringify(w)} className="preview-note bad">
          {t(w)}
        </p>
      ))}
      {result.unknownItems.length > 0 && <p className="preview-note">{t('import.unknownItems', { n: result.unknownItems.length })}</p>}
    </div>
  )
}
