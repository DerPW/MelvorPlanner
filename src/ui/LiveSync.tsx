import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { snapshotOf, type Snapshot } from '../core/live'
import { errMsg, SaveError, type SaveData } from '../core/save'
import type { Msg } from '../core/types'
import { profileFromSave, readSave } from '../core/saveImport'
import { useGame } from './state'

// Live-Verbindung zum Spielstand: Der lokale Server (scripts/vite-save-plugin)
// liefert die Spielstände; hier wird alle paar Sekunden nach der Speicherzeit
// gefragt und bei einer Änderung neu eingelesen. Geht in jedem Browser.

const POLL_MS = 4000

export interface SaveFile {
  name: string
  mtime: number
  size: number
}

export interface LiveState {
  /** null = Server ohne Spielstand-Zugriff (z. B. statisch ausgeliefert) */
  saves: SaveFile[] | null
  /** Kopf je Spielstand für die Auswahl */
  headers: Record<string, SaveData>
  lastSync: number | null
  error: Msg | null
  busy: boolean
  /** Momentaufnahmen des mitgelesenen Spielstands (für gemessene Raten), höchstens 1 h */
  history: Snapshot[]
}

const LiveContext = createContext<LiveState>({ saves: null, headers: {}, lastSync: null, error: null, busy: false, history: [] })
export const useLive = () => useContext(LiveContext)

async function fetchSave(name: string): Promise<SaveData> {
  const res = await fetch(`api/saves/${encodeURIComponent(name)}`, { cache: 'no-store' })
  if (!res.ok) throw new SaveError(res.status === 404 ? { key: 'live.gone' } : { key: 'live.status', params: { status: res.status } })
  return readSave(new Uint8Array(await res.arrayBuffer()))
}

export function LiveSyncProvider({ children }: { children: ReactNode }) {
  const { baseIndex, state, dispatch } = useGame()
  const [live, setLive] = useState<LiveState>({ saves: null, headers: {}, lastSync: null, error: null, busy: false, history: [] })
  const seen = useRef<Record<string, number>>({})
  const running = useRef(false)
  const profileRef = useRef(state.profile)
  profileRef.current = state.profile
  // Der Index wird bei jeder Ausrüstungs-/Level-Änderung neu gebaut (Monster-
  // Quellen) — das darf die Verbindung nicht neu starten, sonst liest sie
  // sofort wieder ein und überschreibt, was man gerade eingestellt hat
  const indexRef = useRef(baseIndex)
  indexRef.current = baseIndex
  const selected = state.live?.save ?? null

  useEffect(() => {
    // Statisch ausgeliefert (GitHub Pages): kein Server, gar nicht erst fragen —
    // saves bleibt null, das Profil sagt, dass es die Verbindung nur lokal gibt
    if (!__LIVE_SERVER__) return
    let stopped = false
    // Neu gewählt oder wieder eingeschaltet: einmal sofort übernehmen, Messung neu beginnen
    if (selected) seen.current[`p:${selected}`] = 0
    setLive((l) => ({ ...l, history: [] }))
    const tick = async () => {
      if (running.current) return
      running.current = true
      try {
        await poll()
      } finally {
        running.current = false
      }
    }
    const poll = async () => {
      let saves: SaveFile[]
      try {
        const res = await fetch('api/saves', { cache: 'no-store' })
        if (!res.ok || !res.headers.get('content-type')?.includes('json')) throw new Error()
        saves = await res.json()
      } catch {
        if (!stopped) setLive((l) => ({ ...l, saves: null }))
        return
      }
      if (stopped) return
      setLive((l) => ({ ...l, saves }))

      // Köpfe für die Auswahl nachladen (einmal je Änderung)
      for (const s of saves) {
        if (seen.current[`h:${s.name}`] === s.mtime) continue
        seen.current[`h:${s.name}`] = s.mtime
        fetchSave(s.name)
          .then((data) => !stopped && setLive((l) => ({ ...l, headers: { ...l.headers, [s.name]: data } })))
          .catch(() => (seen.current[`h:${s.name}`] = 0))
      }

      // Mitlesen: bei neuer Speicherzeit ins Profil übernehmen
      const target = selected && saves.find((s) => s.name === selected)
      if (!target || seen.current[`p:${target.name}`] === target.mtime) return
      setLive((l) => ({ ...l, busy: true }))
      try {
        const data = await fetchSave(target.name)
        if (stopped) return
        dispatch({ type: 'importProfile', profile: profileFromSave(indexRef.current, data, profileRef.current).profile })
        seen.current[`p:${target.name}`] = target.mtime
        const snap = snapshotOf(data)
        setLive((l) => ({
          ...l,
          lastSync: Date.now(),
          error: null,
          busy: false,
          history: l.history.at(-1)?.at === snap.at ? l.history : [...l.history.filter((s) => snap.at - s.at < 3_600_000), snap],
        }))
      } catch (e) {
        // Das Spiel schreibt über eine Zwischendatei — beim nächsten Takt nochmal
        if (!stopped) setLive((l) => ({ ...l, error: errMsg(e), busy: false }))
      }
    }
    tick()
    const timer = setInterval(tick, POLL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [selected, dispatch])

  return <LiveContext.Provider value={live}>{children}</LiveContext.Provider>
}
