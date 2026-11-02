import { useEffect, useRef, useState } from 'react'
import { fmtInt } from '../core/format'
import { GP } from '../core/route'
import type { SaveData } from '../core/save'
import { profileFromSave, readSave, type ImportResult } from '../core/saveImport'
import { GameIcon, Sym } from './components'
import { useGame } from './state'

const SAVE_DIR = '~/Library/Application Support/Games By Malcs/Melvor Idle 2/steam/'

const dateFmt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

/** macOS-Sheet: Spielstand als Datei oder Export-Text → Vorschau → übernehmen */
export function ImportSheet({ onClose }: { onClose: () => void }) {
  const { index, state, dispatch } = useGame()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
      setError((e as Error).message)
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
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Spielstand importieren">
        <div className="sheet-head">
          <h2>Spielstand importieren</h2>
          <p>Level, XP, Bank, Gold, Shop-Käufe und Werkzeuge werden übernommen.</p>
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
              <b>Spielstand-Datei hierher ziehen</b>
              <span>oder klicken und eine .sav-Datei wählen</span>
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
                Liegt unter <code>{SAVE_DIR}&lt;Steam-ID&gt;/saves/</code> — im Dateidialog ⇧⌘G drücken und den Pfad einfügen.
              </span>
              <button className="btn plain small" onClick={() => navigator.clipboard?.writeText(SAVE_DIR.replace('~', '$HOME'))}>
                Pfad kopieren
              </button>
            </div>

            <div className="or">
              <span>oder Export-Text aus dem Spiel</span>
            </div>
            <textarea
              className="paste"
              placeholder="Export-Text des Spielstands (im Spiel: Spielstand exportieren) hier einfügen"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
            />
          </>
        )}

        {busy && <p className="muted">Wird gelesen …</p>}
        {error && (
          <p className="note bad" style={{ height: 'auto', padding: '6px 10px', borderRadius: 8 }}>
            <Sym name="warn" size={14} /> {error}
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
              Anderen wählen
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          {save ? (
            <button className="btn primary" onClick={apply}>
              Profil ersetzen
            </button>
          ) : (
            <button className="btn primary" disabled={!text.trim() || busy} onClick={() => load(text)}>
              Lesen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Preview({ save, result }: { save: SaveData; result: ImportResult }) {
  const { index } = useGame()
  const p = result.profile
  const skills = index.data.skills.filter((s) => (p.levels[s.id] ?? 1) > 1)
  const totalLevel = Object.values(p.levels).reduce((a, b) => a + b, 0)
  return (
    <div className="preview">
      <div className="preview-who">
        <div>
          <b>{save.character || 'Ohne Namen'}</b>
          <span className="muted">
            {' '}
            · {save.gamemode}
            {save.isDemo ? ' · Demo' : ''}
          </span>
        </div>
        <span className="muted">{save.savedAt ? `gespeichert ${dateFmt.format(save.savedAt)}` : ''}</span>
      </div>
      <div className="preview-facts">
        <span>
          <b>{totalLevel}</b> Gesamtlevel
        </span>
        <span>
          <GameIcon src={index.currencies.get(GP)?.icon} size={14} /> <b>{fmtInt(p.currencies[GP] ?? 0)}</b> GP
        </span>
        <span>
          <b>{Object.keys(p.inventory).length}</b> Items in der Bank
        </span>
        <span>
          <b>{Object.keys(p.owned).length}</b> Käufe
        </span>
        {p.equipped && p.equipped.length > 0 && (
          <span>
            <b>{p.equipped.length}</b> Werkzeuge
          </span>
        )}
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
          {index.skills.get(u.skill)?.name}: Die XP reichen schon für Level {u.byXp} — das Spiel zeigt noch {u.saved}, bis wieder XP
          dazukommen. Übernommen wird {u.byXp}.
        </p>
      ))}
      {save.warnings.map((w) => (
        <p key={w} className="preview-note bad">
          {w}
        </p>
      ))}
      {result.unknownItems.length > 0 && (
        <p className="preview-note">{result.unknownItems.length} Items kennt der Planer nicht (neuere Spielversion?) — Daten neu extrahieren.</p>
      )}
    </div>
  )
}
