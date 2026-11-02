// Live-Verfolgung: Was läuft gerade im Spiel, wie schnell wirklich, und passt
// es zur aktiven Route? Die Restzeit des laufenden Schritts kommt aus der
// Messung und zählt zwischen den Spielständen herunter. Endet er laut Messung,
// gibt es eine Benachrichtigung (System + in der Seite) — und sonst, sobald ein
// Spielstand zeigt, dass die laufende Aktion nicht mehr passt.

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { xpForLevel } from '../core/experience'
import { fmtDurationShort, fmtInt } from '../core/format'
import { flowOf, liveProgress, liveRemaining, measure, measureProgress, resolveAction, type LiveAction, type LiveFlow, type LiveRates, type LiveStep } from '../core/live'
import { solve, type Solution } from '../core/solve'
import type { Recipe } from '../core/types'
import { useI18n, type T } from '../i18n'
import { GameIcon, Sym, useNow } from './components'
import { useLive } from './LiveSync'
import { routeIcon, routeLabel, routeTarget } from './routeText'
import { currentGroups, flowGroups, recipeAction, type FlowGroup } from './SolutionView'
import { useGame, usePlanProfile, type RouteTarget } from './state'

export type TrackStatus = 'onTrack' | 'switch' | 'done' | 'idle'

export interface Tracking {
  route: RouteTarget
  solution: Solution
  current: FlowGroup[]
  status: TrackStatus
  /** Der laufende Schritt (passt die Aktion zum aktuellen Block) */
  live: LiveStep | null
  /** Restzeit des aktuellen Blocks (gemessen, wo es geht) und der ganzen Route — zum Spielstand `at` */
  blockMs: number
  totalMs: number
  at: number
  /** Schritt-Schlüssel (mit Route als Präfix) für die Markierung im Ablauf */
  currentKeys: Set<string>
  liveKeys: Set<string>
}

interface TrackValue {
  tracking: Tracking | null
  action: LiveAction | null
  rates: LiveRates | null
  /** Solange noch nicht gemessen: Spielstände derselben Aktion bisher / nötig */
  progress: { have: number; need: number } | null
  /** Gewinn, Verbrauch und wann das Material ausgeht */
  flow: LiveFlow | null
  lastAt: number | null
}

const TrackCtx = createContext<TrackValue>({ tracking: null, action: null, rates: null, progress: null, flow: null, lastAt: null })

/** Uhrzeit eines Zeitpunkts: heute „14:32“, sonst mit Tag („morgen 09:10“, „Mi. 09:10“, „12. Nov. 09:10“) */
export function clockAt(at: number, locale: string, t: T, now = Date.now()): string {
  const d = new Date(at)
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((day(d) - day(new Date(now))) / 86_400_000)
  if (days <= 0) return time
  if (days === 1) return t('live.tomorrow', { time })
  return `${d.toLocaleDateString(locale, days < 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' })} ${time}`
}

/** Wie lange etwas, das zum Spielstand `ms` dauerte, jetzt noch dauert */
export const leftNow = (ms: number, at: number | null, now: number) => Math.max(0, ms - Math.max(0, now - (at ?? now)))
export const useTrack = () => useContext(TrackCtx)

const sameRecipe = (a: Recipe, b: Recipe) => a.id === b.id || (!!a.combat && a.combat.enemy === b.combat?.enemy)

/** Was am Schritt gemessen wird: XP zum Ziel-Level, sonst die Items — Rest und Rate je ms (0 = noch keine Messung) */
function measured(step: FlowGroup['steps'][number], rates: LiveRates | null): { amount: number; perMs: number; unit: 'xp' | 'items' } {
  const xpH = step.xp ? (rates?.xpPerHour[step.xp.skill] ?? 0) : 0
  if (step.xp && xpH > 0) return { amount: step.xp.amount, perMs: xpH / 3_600_000, unit: 'xp' }
  const itemH = step.item ? (rates?.itemsPerHour[step.item] ?? 0) : 0
  if (step.item && itemH > 0) return { amount: step.amount, perMs: itemH / 3_600_000, unit: 'items' }
  return step.xp ? { amount: step.xp.amount, perMs: 0, unit: 'xp' } : { amount: step.amount, perMs: 0, unit: 'items' }
}

/** Wie weit der laufende Schritt seit dem Spielstand gekommen ist (nur gemessen) */
function ranMs(tr: Tracking, now: number): number {
  const ls = tr.live
  if (tr.status !== 'onTrack' || !ls?.perMs) return 0
  return Math.min(Math.max(0, now - tr.at), ls.amount / ls.perMs)
}
export const blockLeft = (tr: Tracking, now: number) => Math.max(0, tr.blockMs - ranMs(tr, now))
export const totalLeft = (tr: Tracking, now: number) => Math.max(0, tr.totalMs - ranMs(tr, now))

/** Kurzer Name eines Blocks: „Raw Shrimp angeln → Shrimp kochen" */
export function groupLabel(t: T, g: FlowGroup | undefined): string {
  if (!g) return ''
  if (g.kind === 'buy') return t('flow.buy', { name: g.purchase?.name ?? '' })
  if (g.kind === 'task') return g.text ? t(g.text) : ''
  return g.recipes.map((r) => recipeAction(t, r)).join(' → ')
}

export function TrackProvider({ children }: { children: ReactNode }) {
  const { index, baseIndex, state } = useGame()
  const { t } = useI18n()
  const live = useLive()
  const last = live.history.at(-1) ?? null
  // Ohne Aktion im Kopf (im Menü, nichts angefangen) läuft nichts
  const action = useMemo(() => (last && state.live && (last.entity || last.action) ? resolveAction(index, last) : null), [index, last, state.live])
  const rates = useMemo(() => (state.live ? measure(live.history) : null), [live.history, state.live])
  const progress = useMemo(() => (state.live && !rates ? measureProgress(live.history) : null), [live.history, state.live, rates])
  const flow = useMemo(() => (rates && last && action ? flowOf(rates, last, action.recipe ? action.recipe.inputs.map((i) => i.item) : null) : null), [rates, last, action])
  const route = state.routes.find((r) => r.id === state.activeRoute) ?? null
  const profile = usePlanProfile()
  const solution = useMemo(
    () => (route ? solve(baseIndex, routeTarget(route), profile, state.choices, state.options, route.avoid ?? []) : null),
    [route, baseIndex, profile, state.choices, state.options],
  )

  // Rest je Schritt, als er zuerst lief — für den Fortschrittsbalken
  const starts = useRef(new Map<string, number>())
  const tracking = useMemo<Tracking | null>(() => {
    if (!route || !solution) return null
    const groups = flowGroups(index, solution)
    const current = currentGroups(groups)
    const scoped = (k: string) => `${route.id}:${k}`
    let pos: { g: number; i: number } | null = null
    const liveKeys = new Set<string>()
    if (action?.recipe)
      current.forEach((g, gi) =>
        g.steps.forEach((s, i) => {
          if (!sameRecipe(s.recipe, action.recipe!)) return
          pos ??= { g: gi, i }
          liveKeys.add(scoped(g.keys[i]))
        }),
      )
    const status: TrackStatus = !current.length ? 'done' : !action ? 'idle' : pos ? 'onTrack' : 'switch'
    let live: LiveStep | null = null
    if (pos) {
      const { g, i } = pos
      const step = current[g].steps[i]
      const m = measured(step, rates)
      const key = scoped(current[g].keys[i])
      const start = Math.max(m.amount, starts.current.get(key) ?? 0)
      starts.current.set(key, start)
      // Danach: der nächste Schritt im Block (z. B. erst angeln, dann kochen), sonst der nächste Block
      const next = i + 1 < current[g].steps.length ? recipeAction(t, current[g].steps[i + 1].recipe) : groups[g + 1] ? groupLabel(t, groups[g + 1]) : null
      live = { key, amount: m.amount, unit: m.unit, perMs: m.perMs, start, planMs: step.ms, at: last?.at ?? Date.now(), next }
    }
    const planBlock = current.reduce((n, g) => n + g.ms, 0)
    const blockMs = current.reduce(
      (n, g, gi) => n + g.steps.reduce((m, s, i) => m + (live?.perMs && pos?.g === gi && pos.i === i ? live.amount / live.perMs : s.ms), 0),
      0,
    )
    return {
      route,
      solution,
      current,
      status,
      live,
      blockMs,
      totalMs: Math.max(0, solution.activeMs + solution.passiveMs - planBlock + blockMs),
      at: last?.at ?? Date.now(),
      currentKeys: new Set(current.flatMap((g) => g.keys.map(scoped))),
      liveKeys,
    }
  }, [route, solution, index, action, rates, last, t])

  const [toast, setToast] = useState<{ title: string; body: string } | null>(null)
  // Zuletzt gemeldeter Schritt — eine Meldung je Schritt, nicht noch einmal per Spielstand
  const announced = useRef<{ key: string; time: number } | null>(null)
  const recent = (key: string) => announced.current?.key === key && Date.now() - announced.current.time < 120_000

  // Vorhersage: Endet der laufende Schritt laut Messung, gleich Bescheid geben —
  // nicht erst, wenn der nächste Spielstand es zeigt. Geplant wird erst kurz
  // vor Schluss; hört das Spiel auf zu speichern, kommt nichts Falsches mehr.
  useEffect(() => {
    const ls = tracking?.status === 'onTrack' ? tracking.live : null
    if (!tracking || !ls?.perMs || recent(ls.key)) return
    const left = liveRemaining(ls, Date.now())
    if (left > 45_000) return
    const id = setTimeout(() => {
      announced.current = { key: ls.key, time: Date.now() }
      const name = routeLabel(index, tracking.route)
      if (ls.next) notify(setToast, t('track.switchTitle'), t('track.stepDoneBody', { route: name, next: ls.next }))
      else notify(setToast, t('track.doneTitle'), t('track.doneBody', { route: name }))
    }, left)
    return () => clearTimeout(id)
  }, [tracking, index, t])

  // Bestätigung per Spielstand: ein neuer Block, zu dem die Aktion nicht passt,
  // oder der laufende Schritt ist weg, obwohl dieselbe Aktion weiterläuft —
  // oder das Ziel ist erreicht. Nicht beim ersten Blick, nicht, wenn man
  // selbst etwas anderes anfängt, und nicht, was die Vorhersage schon gemeldet hat.
  const prev = useRef<{ route: string; block: string; status: TrackStatus; action: string; step: string | null } | null>(null)
  useEffect(() => {
    if (!tracking) {
      prev.current = null
      return
    }
    const g = tracking.current[0]
    const block = g ? (g.main?.id ?? g.purchase?.id ?? g.text?.key ?? g.kind) : 'done'
    const doing = action ? `${action.entity}/${action.action}` : ''
    // Ziel und gemiedene Wege zählen mit: Wer die Route selbst ändert, braucht keinen Hinweis
    const id = JSON.stringify([tracking.route.id, routeTarget(tracking.route), tracking.route.avoid ?? []])
    const p = prev.current
    prev.current = { route: id, block, status: tracking.status, action: doing, step: tracking.live?.key ?? null }
    if (!p || p.route !== id || tracking.status === 'idle' || (p.step && recent(p.step))) return
    const name = routeLabel(index, tracking.route)
    if (tracking.status === 'done' && p.status !== 'done') notify(setToast, t('track.doneTitle'), t('track.doneBody', { route: name }))
    else if (tracking.status === 'switch' && (block !== p.block || (p.status === 'onTrack' && p.action === doing)))
      notify(setToast, t('track.switchTitle'), t('track.switchBody', { route: name, step: groupLabel(t, g) }))
  }, [tracking, action, index, t])

  // Material geht aus: Laut Messung leer → Bescheid geben, die Aktion stoppt dann.
  // Einmal je Aktion und Item; wird nachgefüllt (wieder weit weg), darf es erneut
  const stopSent = useRef<string | null>(null)
  useEffect(() => {
    const st = flow?.stop
    if (!st || !last || !action) return
    const key = `${last.entity}/${last.action}/${st.item}`
    const left = leftNow(st.emptyMs, last.at, Date.now())
    if (stopSent.current === key) {
      if (left > 120_000) stopSent.current = null
      return
    }
    if (left > 45_000) return
    const id = setTimeout(() => {
      stopSent.current = key
      notify(setToast, t('live.stopTitle'), t('live.stopBody', { item: index.items.get(st.item)?.name ?? st.item, action: action.action || action.entity }))
    }, left)
    return () => clearTimeout(id)
  }, [flow, last, action, index, t])

  // Titel zurück, sobald man wieder hinsieht
  useEffect(() => {
    const restore = () => (document.title = 'Melvor Planner')
    window.addEventListener('focus', restore)
    return () => window.removeEventListener('focus', restore)
  }, [])

  return (
    <TrackCtx.Provider value={{ tracking, action, rates, progress, flow, lastAt: last?.at ?? null }}>
      {children}
      {toast && <TrackToast toast={toast} onClose={() => setToast(null)} />}
    </TrackCtx.Provider>
  )
}

function notify(setToast: (x: { title: string; body: string }) => void, title: string, body: string) {
  setToast({ title, body })
  if (!document.hasFocus()) document.title = `● ${title}`
  try {
    if ('Notification' in window && Notification.permission === 'granted')
      new Notification(title, { body, icon: 'game/icons/Icons/Milestones.webp', tag: 'melvor-planner-track' })
  } catch {
    // Manche Umgebungen erlauben es nicht — dann bleibt der Hinweis in der Seite
  }
}

function TrackToast({ toast, onClose }: { toast: { title: string; body: string }; onClose: () => void }) {
  useEffect(() => {
    const id = setTimeout(onClose, 12_000)
    return () => clearTimeout(id)
  }, [toast, onClose])
  return (
    <div className="track-toast" role="status">
      <Sym name="warn" size={15} />
      <div>
        <b>{toast.title}</b>
        <p>{toast.body}</p>
      </div>
      <button className="icon-btn" onClick={onClose} aria-label="×">
        <Sym name="close" size={12} />
      </button>
    </div>
  )
}

/** Live-Karte in der Seitenleiste: knapp — was läuft, eine Kennzahl, ob das
 *  Material bald ausgeht, die verfolgte Route. Alles Weitere in der Live-Ansicht. */
export function LiveCard() {
  const { index, state, dispatch } = useGame()
  const { t, locale } = useI18n()
  const { tracking, action, rates, progress, flow, lastAt } = useTrack()
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'denied'))
  const now = useNow(1000)
  if (!state.live || lastAt === null) return null

  const skill = action?.skill ?? null
  const level = skill ? (state.profile.levels[skill.id] ?? 1) : null
  const xpH = skill ? (rates?.xpPerHour[skill.id] ?? 0) : 0
  const xp = skill ? (state.profile.xp?.[skill.id] ?? 0) : 0
  const nextMs = skill && level && xpH > 0 ? leftNow(((xpForLevel(level + 1) - xp) / xpH) * 3_600_000, lastAt, now) : null
  const icon = action?.recipe?.icon ?? action?.enemy?.icon ?? skill?.icon ?? null
  const ago = Math.max(0, Math.round((now - lastAt) / 1000))
  const stop = flow?.stop ?? null
  const stopMs = stop ? leftNow(stop.emptyMs, lastAt, now) : null
  const ls = tracking?.status === 'onTrack' ? tracking.live : null

  return (
    <div className="live-card">
      <button className="lc-open" onClick={() => dispatch({ type: 'view', view: { kind: 'live' }, root: true })} title={t('live.open')}>
        <span className="lc-title">
          <i className={action ? 'live-dot' : 'live-dot off'} /> {t('track.now')}
          <span className="muted"> · {t('track.ago', { s: ago })}</span>
          <Sym name="chevron" size={9} className="lc-chev" />
        </span>
        <span className="lc-action">
          <GameIcon src={icon} size={20} />
          <b className="grow">{action ? action.action || action.entity : t('track.nothing')}</b>
        </span>
        {action && (
          <span className="lc-stat">
            {!rates ? (
              <Measuring progress={progress} />
            ) : nextMs !== null ? (
              t('track.nextLevel', { level: (level ?? 1) + 1, time: fmtDurationShort(nextMs) })
            ) : rates.goldPerHour > 1 ? (
              `${fmtInt(rates.goldPerHour)} GP/h`
            ) : (
              t('live.running')
            )}
          </span>
        )}
        {stop && stopMs !== null && stopMs < 600_000 && (
          <span className="lc-stop">
            <GameIcon src={index.items.get(stop.item)?.icon} size={14} /> {t('live.emptyIn', { time: fmtDurationShort(stopMs) || t('live.now') })}
            {stopMs > 0 && <span className="muted">· {clockAt(now + stopMs, locale, t, now)}</span>}
          </span>
        )}
      </button>
      {tracking && (
        <button className={`lc-route ts-${tracking.status}`} onClick={() => dispatch({ type: 'view', view: { kind: 'route', id: tracking.route.id }, root: true })}>
          <span className="lc-route-head">
            <GameIcon src={routeIcon(index, tracking.route)} size={14} />
            <span className="grow">{routeLabel(index, tracking.route)}</span>
            {tracking.status !== 'done' && <span className="num">{fmtDurationShort(totalLeft(tracking, now))}</span>}
          </span>
          <span className="lc-route-step">{statusLine(t, tracking, now)}</span>
          {ls && ls.perMs > 0 && <StepBar step={ls} now={now} />}
        </button>
      )}
      {tracking && perm === 'default' && (
        <button className="link lc-perm" onClick={() => Notification.requestPermission().then(setPerm)}>
          {t('track.allowNotify')}
        </button>
      )}
    </div>
  )
}

/** Stand der Verfolgung in einer Zeile; die Restzeit zählt mit `now` herunter */
export function statusLine(t: T, tr: Tracking, now: number): string {
  if (tr.status === 'done') return t('track.done')
  const step = groupLabel(t, tr.current[0])
  if (tr.status === 'idle') return t('track.next', { step })
  if (tr.status === 'switch' || !tr.live) return t('track.switchTo', { step })
  const ls = tr.live
  const left = liveRemaining(ls, now)
  // Laut Messung fertig — der nächste Spielstand bestätigt es gleich
  if (ls.perMs > 0 && left <= 0) return ls.next ? t('track.switchTo', { step: ls.next }) : t('track.almostDone')
  const time = fmtDurationShort(left)
  return ls.next ? t('track.onTrackThen', { time, next: ls.next }) : t('track.onTrackGoal', { time })
}

/** „misst … 1/3“ mit Punkten — bis die ersten Werte da sind */
export function Measuring({ progress }: { progress: { have: number; need: number } | null }) {
  const { t } = useI18n()
  if (!progress) return <>{t('track.measuring')}</>
  return (
    <span className="measuring" title={t('track.measuringHint')}>
      {t('track.measuringN', { n: Math.min(progress.have, progress.need), of: progress.need })}
      {progress.need <= 6 && (
        <span className="m-dots" aria-hidden>
          {Array.from({ length: progress.need }, (_, i) => (
            <i key={i} className={i < progress.have ? 'on' : ''} />
          ))}
        </span>
      )}
    </span>
  )
}

/** Fortschritt des laufenden Schritts, läuft zwischen den Spielständen mit */
export function StepBar({ step, now }: { step: LiveStep; now: number }) {
  return (
    <span className="bar live-bar">
      <span style={{ width: `${Math.max(2, liveProgress(step, now) * 100)}%` }} />
    </span>
  )
}
