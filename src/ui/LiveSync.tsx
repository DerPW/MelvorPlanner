import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { SaveData } from '../core/save'
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
  error: string | null
  busy: boolean
}

const LiveContext = createContext<LiveState>({ saves: null, headers: {}, lastSync: null, error: null, busy: false })
export const useLive = () => useContext(LiveContext)

async function fetchSave(name: string): Promise<SaveData> {
  const res = await fetch(`api/saves/${encodeURIComponent(name)}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(res.status === 404 ? 'Spielstand nicht mehr da' : `Server antwortet ${res.status}`)
  return readSave(new Uint8Array(await res.arrayBuffer()))
}

export function LiveSyncProvider({ children }: { children: ReactNode }) {
  const { baseIndex, state, dispatch } = useGame()
  const [live, setLive] = useState<LiveState>({ saves: null, headers: {}, lastSync: null, error: null, busy: false })
  const seen = useRef<Record<string, number>>({})
  const running = useRef(false)
  const profileRef = useRef(state.profile)
  profileRef.current = state.profile
  const selected = state.live?.save ?? null

  useEffect(() => {
    let stopped = false
    // Neu gewählt oder wieder eingeschaltet: einmal sofort übernehmen
    if (selected) seen.current[`p:${selected}`] = 0
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
        dispatch({ type: 'importProfile', profile: profileFromSave(baseIndex, data, profileRef.current).profile })
        seen.current[`p:${target.name}`] = target.mtime
        setLive((l) => ({ ...l, lastSync: Date.now(), error: null, busy: false }))
      } catch (e) {
        // Das Spiel schreibt über eine Zwischendatei — beim nächsten Takt nochmal
        if (!stopped) setLive((l) => ({ ...l, error: (e as Error).message, busy: false }))
      }
    }
    tick()
    const timer = setInterval(tick, POLL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [selected, baseIndex, dispatch])

  return <LiveContext.Provider value={live}>{children}</LiveContext.Provider>
}
