// Spielstand-Editor: einen Spielstand laden (aus der Live-Verbindung, als
// Datei oder als Import-Text), Währungen, Skill-XP, Bank und Shop-Käufe
// ändern und daraus einen neuen Spielstand machen — als Datei zum
// Herunterladen oder als Import-Text fürs Spiel. Der Spielordner wird nie
// angefasst; geändert wird nur, was der Rundlauf-Test als sicher bestätigt.

import { useMemo, useState } from 'react'
import { MAX_LEVEL, levelForXp, xpForLevel } from '../core/experience'
import { fmtInt } from '../core/format'
import { errMsg, parseSave, type SaveData } from '../core/save'
import { DEMO_LEVEL_CAP, packSave, unpackSave } from '../core/saveImport'
import { editSave, roundTrips, toBase64, type SaveEdits } from '../core/saveWrite'
import type { Id, Msg } from '../core/types'
import { useI18n } from '../i18n'
import { GameIcon, Sym, TabPills, Toolbar } from './components'
import { useLive } from './LiveSync'
import { useGame } from './state'

type Part = 'currencies' | 'skills' | 'bank' | 'shop'

interface Loaded {
  name: string
  raw: Uint8Array
  data: SaveData
  /** Zerlegen und Zusammensetzen ergibt dieselben Bytes — nur dann wird geändert */
  safe: boolean
}

export function EditorView() {
  const { t } = useI18n()
  const live = useLive()
  const [src, setSrc] = useState<Loaded | null>(null)
  const [edits, setEdits] = useState<SaveEdits>({})
  const [error, setError] = useState<Msg | null>(null)
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')

  const load = async (input: File | Uint8Array | string, name: string) => {
    setBusy(true)
    setError(null)
    try {
      const raw = await unpackSave(input)
      let safe = false
      try {
        safe = roundTrips(raw)
      } catch {
        safe = false
      }
      setSrc({ name, raw, data: parseSave(raw), safe })
      setEdits({})
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }
  const fromLive = async (name: string) => {
    try {
      const res = await fetch(`api/saves/${encodeURIComponent(name)}`, { cache: 'no-store' })
      await load(new Uint8Array(await res.arrayBuffer()), name)
    } catch (err) {
      setError(errMsg(err))
    }
  }

  return (
    <>
      <Toolbar title={t('edit.title')} subtitle={src ? `${src.data.character} · ${src.name}` : t('edit.subtitle')} />
      <div className="content narrow-content editor">
        <div className="note editor-warn">
          <Sym name="warn" size={14} /> <span>{t('edit.warning')}</span>
        </div>

        {/* Laden */}
        <section className="form-group editor-load">
          {(live.saves ?? []).map((s) => (
            <div key={s.name} className="form-row">
              <span className="grow">
                <b>{live.headers[s.name]?.character || t('live.unnamed')}</b>{' '}
                <span className="muted">
                  · {new Date(s.mtime).toLocaleString()} · {s.name}
                </span>
              </span>
              <button className="btn small" disabled={busy} onClick={() => fromLive(s.name)}>
                {t('edit.load')}
              </button>
            </div>
          ))}
          <label className="form-row">
            <span className="grow">{t('edit.file')}</span>
            <input type="file" accept=".sav" onChange={(e) => e.target.files?.[0] && load(e.target.files[0], e.target.files[0].name)} />
          </label>
          <div className="form-row editor-text">
            <textarea value={text} placeholder={t('edit.textPlaceholder')} onChange={(e) => setText(e.target.value)} rows={2} />
            <button className="btn small" disabled={!text.trim() || busy} onClick={() => load(text, t('edit.fromText'))}>
              {t('edit.read')}
            </button>
          </div>
        </section>
        {error && <p className="note bad">{t(error)}</p>}

        {src && !src.safe && <p className="note bad">{t('edit.unsafe')}</p>}
        {src && src.safe && <Editor src={src} edits={edits} setEdits={setEdits} />}
      </div>
    </>
  )
}

function Editor({ src, edits, setEdits }: { src: Loaded; edits: SaveEdits; setEdits: (e: SaveEdits) => void }) {
  const { t } = useI18n()
  const [part, setPart] = useState<Part>('currencies')
  const count = Object.values(edits).reduce((n, m) => n + Object.keys(m ?? {}).length, 0)
  /** Einen Wert setzen; gleich dem Original → Änderung entfernen */
  const set = (key: keyof SaveEdits, id: Id, value: number, original: number) => {
    const next = { ...(edits[key] ?? {}) }
    if (value === original || !Number.isFinite(value)) delete next[id]
    else next[id] = value
    setEdits({ ...edits, [key]: next })
  }
  return (
    <>
      <p className="ok editor-safe">
        <Sym name="check" size={12} /> {t('edit.safe', { version: src.data.version })}
      </p>
      <TabPills<Part>
        value={part}
        onChange={setPart}
        options={[
          { value: 'currencies', label: t('edit.currencies') },
          { value: 'skills', label: t('edit.skills') },
          { value: 'bank', label: t('bank.title') },
          { value: 'shop', label: t('edit.purchases') },
        ]}
      />
      {part === 'currencies' && <Currencies data={src.data} edits={edits} set={set} />}
      {part === 'skills' && <Skills data={src.data} edits={edits} set={set} />}
      {part === 'bank' && <BankEdit data={src.data} edits={edits} set={set} />}
      {part === 'shop' && <ShopEdit data={src.data} edits={edits} set={set} />}
      <Export src={src} edits={edits} count={count} reset={() => setEdits({})} />
    </>
  )
}

type Setter = (key: keyof SaveEdits, id: Id, value: number, original: number) => void

function NumberInput({ value, onChange, max }: { value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <input
      className="edit-num"
      type="number"
      min={0}
      max={max}
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Math.max(0, Math.min(max ?? Infinity, Number(e.target.value))))}
    />
  )
}

function Currencies({ data, edits, set }: { data: SaveData; edits: SaveEdits; set: Setter }) {
  const { index } = useGame()
  return (
    <div className="form-group">
      {Object.entries(data.currencies).map(([id, qty]) => (
        <div key={id} className={`form-row ${edits.currencies?.[id] !== undefined ? 'changed' : ''}`}>
          <GameIcon src={index.currencies.get(id)?.icon} size={20} />
          <span className="grow">{index.currencies.get(id)?.name ?? id}</span>
          <span className="muted num">{fmtInt(qty)} →</span>
          <NumberInput value={edits.currencies?.[id] ?? qty} onChange={(v) => set('currencies', id, v, qty)} />
        </div>
      ))}
    </div>
  )
}

function Skills({ data, edits, set }: { data: SaveData; edits: SaveEdits; set: Setter }) {
  const { index } = useGame()
  const { t } = useI18n()
  const cap = data.isDemo ? DEMO_LEVEL_CAP : MAX_LEVEL
  return (
    <div className="form-group">
      {Object.entries(data.xp)
        .filter(([id]) => index.skills.has(id))
        .sort((a, b) => (index.skills.get(a[0])?.name ?? '').localeCompare(index.skills.get(b[0])?.name ?? ''))
        .map(([id, xp]) => {
          const now = edits.xp?.[id] ?? xp
          const level = Math.min(cap, levelForXp(now))
          return (
            <div key={id} className={`form-row ${edits.xp?.[id] !== undefined ? 'changed' : ''}`}>
              <GameIcon src={index.skills.get(id)?.icon} size={20} />
              <span className="grow">{index.skills.get(id)?.name}</span>
              <span className="muted num">Lv {data.levels[id]} →</span>
              <span className="edit-level">
                Lv <NumberInput value={level} max={cap} onChange={(v) => set('xp', id, xpForLevel(Math.max(1, v)), xp)} />
              </span>
              <span className="edit-xp">
                <NumberInput value={Math.floor(now)} onChange={(v) => set('xp', id, v, xp)} /> {t('edit.xp')}
              </span>
            </div>
          )
        })}
    </div>
  )
}

function BankEdit({ data, edits, set }: { data: SaveData; edits: SaveEdits; set: Setter }) {
  const { index } = useGame()
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const term = q.trim().toLowerCase()
  const changed = Object.keys(edits.bank ?? {})
  const ids = useMemo(() => {
    const have = new Set([...Object.keys(data.bank), ...changed])
    const list = term
      ? index.data.items.filter((i) => i.name.toLowerCase().includes(term) && !i.id.endsWith(':DemoPlaceholderItem')).map((i) => i.id)
      : [...have]
    return list.slice(0, 120)
  }, [term, data.bank, changed, index])
  return (
    <>
      <div className="search editor-search">
        <Sym name="search" size={15} className="sym-lead" />
        <input value={q} placeholder={t('edit.searchItems')} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="form-group">
        {ids.map((id) => {
          const qty = data.bank[id] ?? 0
          return (
            <div key={id} className={`form-row ${edits.bank?.[id] !== undefined ? 'changed' : ''}`} data-entity={`item:${id}`}>
              <GameIcon src={index.items.get(id)?.icon} size={20} />
              <span className="grow">{index.items.get(id)?.name ?? id}</span>
              <span className="muted num">{fmtInt(qty)} →</span>
              <NumberInput value={edits.bank?.[id] ?? qty} onChange={(v) => set('bank', id, v, qty)} />
            </div>
          )
        })}
      </div>
    </>
  )
}

function ShopEdit({ data, edits, set }: { data: SaveData; edits: SaveEdits; set: Setter }) {
  const { index } = useGame()
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const term = q.trim().toLowerCase()
  const changed = Object.keys(edits.purchases ?? {})
  const ids = term
    ? index.data.purchases.filter((p) => !p.unlisted && p.name.toLowerCase().includes(term)).map((p) => p.id)
    : [...new Set([...Object.keys(data.purchases).filter((id) => data.purchases[id] > 0), ...changed])]
  return (
    <>
      <div className="search editor-search">
        <Sym name="search" size={15} className="sym-lead" />
        <input value={q} placeholder={t('edit.searchPurchases')} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="form-group">
        {ids.slice(0, 120).map((id) => {
          const p = index.purchases.get(id)
          const qty = data.purchases[id] ?? 0
          return (
            <div key={id} className={`form-row ${edits.purchases?.[id] !== undefined ? 'changed' : ''}`} data-entity={`purchase:${id}`}>
              <GameIcon src={p?.icon} size={20} />
              <span className="grow">
                {p?.name ?? id} {p?.buyLimit ? <span className="muted">· max {p.buyLimit}</span> : null}
              </span>
              <span className="muted num">{fmtInt(qty)} →</span>
              <NumberInput value={edits.purchases?.[id] ?? qty} max={p?.buyLimit ?? undefined} onChange={(v) => set('purchases', id, v, qty)} />
            </div>
          )
        })}
      </div>
    </>
  )
}

/** Neuen Spielstand bauen, zur Kontrolle wieder einlesen, dann Datei oder Import-Text */
function Export({ src, edits, count, reset }: { src: Loaded; edits: SaveEdits; count: number; reset: () => void }) {
  const { t } = useI18n()
  const [out, setOut] = useState<{ packed: Uint8Array; check: SaveData } | null>(null)
  const [error, setError] = useState<Msg | null>(null)
  const [copied, setCopied] = useState(false)
  const build = async () => {
    setError(null)
    setOut(null)
    setCopied(false)
    try {
      const raw = editSave(src.raw, edits, src.data.isDemo ? DEMO_LEVEL_CAP : MAX_LEVEL)
      const packed = await packSave(raw)
      // Gegenprobe: so, wie das Spiel ihn liest, wieder einlesen
      const check = parseSave(await unpackSave(packed))
      if (check.warnings.length) throw new Error(JSON.stringify(check.warnings))
      setOut({ packed, check })
    } catch (err) {
      setError(errMsg(err))
    }
  }
  const download = () => {
    if (!out) return
    const blob = new Blob([out.packed as BlobPart], { type: 'application/octet-stream' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = src.name.replace(/\.sav$/i, '') + '-bearbeitet.sav'
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const copy = async () => {
    if (!out) return
    await navigator.clipboard.writeText(toBase64(out.packed))
    setCopied(true)
  }
  return (
    <section className="editor-export">
      <div className="editor-actions">
        <span className="grow">{count ? t('edit.changes', { n: count }) : t('edit.noChanges')}</span>
        {count > 0 && (
          <button className="link" onClick={reset}>
            {t('edit.reset')}
          </button>
        )}
        <button className="btn primary" disabled={!count} onClick={build}>
          {t('edit.build')}
        </button>
      </div>
      {error && <p className="note bad">{t(error)}</p>}
      {out && (
        <div className="editor-out">
          <p className="ok">
            <Sym name="check" size={12} /> {t('edit.checked', { character: out.check.character, level: out.check.totalLevel })}
          </p>
          <div className="editor-actions">
            <button className="btn" onClick={download}>
              {t('edit.download')}
            </button>
            <button className="btn" onClick={copy}>
              {copied ? t('edit.copied') : t('edit.copyText')}
            </button>
          </div>
          <p className="muted">{t('edit.howTo')}</p>
        </div>
      )}
    </section>
  )
}
