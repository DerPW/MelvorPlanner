// Live-Verfolgung: Was läuft gerade im Spiel, wie schnell wirklich, und passt
// es zur aktiven Route? Ist ein Schritt fertig und die laufende Aktion passt
// nicht mehr, gibt es eine Benachrichtigung (System + in der Seite).

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { xpForLevel } from '../core/experience'
import { fmtDurationShort, fmtInt } from '../core/format'
import { measure, resolveAction, type LiveAction, type LiveRates } from '../core/live'
import { solve, type Solution } from '../core/solve'
import type { Recipe } from '../core/types'
import { useI18n, type T } from '../i18n'
import { GameIcon, Sym } from './components'
import { useLive } from './LiveSync'
import { routeIcon, routeLabel, routeTarget } from './routeText'
import { currentGroups, flowGroups, recipeAction, type FlowGroup } from './SolutionView'
import { useGame, type RouteTarget } from './state'

export type TrackStatus = 'onTrack' | 'switch' | 'done' | 'idle'

export interface Tracking {
  route: RouteTarget
  solution: Solution
  current: FlowGroup[]
  status: TrackStatus
  /** Die passende Stelle im aktuellen Block */
  matched: FlowGroup['steps'][number] | null
  /** Restzeit des aktuellen Blocks (gemessen, wo es geht) und der ganzen Route */
  blockMs: number
  totalMs: number
  /** Schritt-Schlüssel (mit Route als Präfix) für die Markierung im Ablauf */
  currentKeys: Set<string>
  liveKeys: Set<string>
}

interface TrackValue {
  tracking: Tracking | null
  action: LiveAction | null
  rates: LiveRates | null
  lastAt: number | null
}

const TrackCtx = createContext<TrackValue>({ tracking: null, action: null, rates: null, lastAt: null })
export const useTrack = () => useContext(TrackCtx)

const sameRecipe = (a: Recipe, b: Recipe) => a.id === b.id || (!!a.combat && a.combat.enemy === b.combat?.enemy)

/** Restzeit eines Schritts: mit gemessener Rate, wenn er gerade läuft */
function stepMs(step: FlowGroup['steps'][number], running: boolean, rates: LiveRates | null): number {
  if (running && rates) {
    if (step.xp && (rates.xpPerHour[step.xp.skill] ?? 0) > 0) return (step.xp.amount / rates.xpPerHour[step.xp.skill]) * 3_600_000
    if (step.item && (rates.itemsPerHour[step.item] ?? 0) > 0) return (step.amount / rates.itemsPerHour[step.item]) * 3_600_000
  }
  return step.ms
}

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
  const action = useMemo(() => (last && state.live ? resolveAction(index, last) : null), [index, last, state.live])
  const rates = useMemo(() => (state.live ? measure(live.history) : null), [live.history, state.live])
  const route = state.routes.find((r) => r.id === state.activeRoute) ?? null
  const solution = useMemo(
    () => (route ? solve(baseIndex, routeTarget(route), state.profile, state.choices, state.options, route.avoid ?? []) : null),
    [route, baseIndex, state.profile, state.choices, state.options],
  )

  const tracking = useMemo<Tracking | null>(() => {
    if (!route || !solution) return null
    const groups = flowGroups(index, solution)
    const current = currentGroups(groups)
    const scoped = (k: string) => `${route.id}:${k}`
    let matched: Tracking['matched'] = null
    const liveKeys = new Set<string>()
    if (action?.recipe)
      for (const g of current)
        g.steps.forEach((s, i) => {
          if (!sameRecipe(s.recipe, action.recipe!)) return
          matched ??= s
          liveKeys.add(scoped(g.keys[i]))
        })
    const status: TrackStatus = !current.length ? 'done' : !action ? 'idle' : matched ? 'onTrack' : 'switch'
    const planBlock = current.reduce((n, g) => n + g.ms, 0)
    const blockMs = current.reduce((n, g) => n + g.steps.reduce((m, s) => m + stepMs(s, s === matched, rates), 0), 0)
    return {
      route,
      solution,
      current,
      status,
      matched,
      blockMs,
      totalMs: Math.max(0, solution.activeMs + solution.passiveMs - planBlock + blockMs),
      currentKeys: new Set(current.flatMap((g) => g.keys.map(scoped))),
      liveKeys,
    }
  }, [route, solution, index, action, rates])

  // Benachrichtigen, wenn ein Block fertig ist und die laufende Aktion nicht
  // zum neuen passt — oder das Ziel erreicht ist. Nicht beim ersten Blick und
  // nicht, wenn man selbst etwas anderes anfängt.
  const prev = useRef<{ route: string; block: string; status: TrackStatus } | null>(null)
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null)
  useEffect(() => {
    if (!tracking) {
      prev.current = null
      return
    }
    const g = tracking.current[0]
    const block = g ? (g.main?.id ?? g.purchase?.id ?? g.text?.key ?? g.kind) : 'done'
    const p = prev.current
    prev.current = { route: tracking.route.id, block, status: tracking.status }
    if (!p || p.route !== tracking.route.id || tracking.status === 'idle') return
    const name = routeLabel(index, tracking.route)
    if (tracking.status === 'done' && p.status !== 'done') notify(setToast, t('track.doneTitle'), t('track.doneBody', { route: name }))
    else if (block !== p.block && tracking.status === 'switch')
      notify(setToast, t('track.switchTitle'), t('track.switchBody', { route: name, step: groupLabel(t, g) }))
  }, [tracking, index, t])

  // Titel zurück, sobald man wieder hinsieht
  useEffect(() => {
    const restore = () => (document.title = 'Melvor Planner')
    window.addEventListener('focus', restore)
    return () => window.removeEventListener('focus', restore)
  }, [])

  return (
    <TrackCtx.Provider value={{ tracking, action, rates, lastAt: last?.at ?? null }}>
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

/** Live-Karte in der Seitenleiste: was gerade läuft, gemessenes Tempo, aktive Route */
export function LiveCard() {
  const { index, state, dispatch } = useGame()
  const { t } = useI18n()
  const { tracking, action, rates, lastAt } = useTrack()
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'denied'))
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000)
    return () => clearInterval(id)
  }, [])
  if (!state.live || !action) return null

  const skill = action.skill
  const level = skill ? (state.profile.levels[skill.id] ?? 1) : null
  const xpH = skill ? (rates?.xpPerHour[skill.id] ?? 0) : 0
  const xp = skill ? (state.profile.xp?.[skill.id] ?? 0) : 0
  const nextMs = skill && level && xpH > 0 ? ((xpForLevel(level + 1) - xp) / xpH) * 3_600_000 : null
  const icon = action.recipe?.icon ?? action.enemy?.icon ?? skill?.icon ?? null
  const entity = action.enemy ? `enemy:${action.enemy.id}` : action.recipe?.outputs[0] ? `item:${action.recipe.outputs[0].item}` : skill ? `skill:${skill.id}` : null
  // Größte Lager-Zunahme (das, was die Aktion bringt)
  const gain = rates && Object.entries(rates.itemsPerHour).sort((a, b) => b[1] - a[1])[0]
  const ago = lastAt ? Math.max(0, Math.round((Date.now() - lastAt) / 1000)) : null

  return (
    <div className="live-card">
      <div className="lc-title">
        <i className="live-dot" /> {t('track.now')}
        {ago !== null && <span className="muted"> · {t('track.ago', { s: ago })}</span>}
      </div>
      <div className="lc-action">
        <GameIcon src={icon} size={20} entity={entity} />
        <span className="grow">
          <b>{action.action || action.entity}</b>
          {skill && (
            <span className="muted">
              {' '}
              · {skill.name} {level}
            </span>
          )}
        </span>
      </div>
      {rates ? (
        <div className="lc-rates">
          {xpH > 0 && <span>{fmtInt(xpH)} XP/h</span>}
          {nextMs !== null && <span>{t('track.nextLevel', { level: (level ?? 1) + 1, time: fmtDurationShort(nextMs) })}</span>}
          {gain && gain[1] > 0 && (
            <span>
              +{fmtInt(gain[1])}/h {index.items.get(gain[0])?.name}
            </span>
          )}
          {rates.goldPerHour > 1 && <span className="gold">+{fmtInt(rates.goldPerHour)} GP/h</span>}
        </div>
      ) : (
        <div className="lc-rates muted">{t('track.measuring')}</div>
      )}
      {tracking && (
        <button className={`lc-route ts-${tracking.status}`} onClick={() => dispatch({ type: 'view', view: { kind: 'route', id: tracking.route.id }, root: true })}>
          <span className="lc-route-head">
            <GameIcon src={routeIcon(index, tracking.route)} size={14} />
            <span className="grow">{routeLabel(index, tracking.route)}</span>
            {tracking.status !== 'done' && <span>{fmtDurationShort(tracking.totalMs)}</span>}
          </span>
          <span className="lc-route-step">{statusLine(t, tracking)}</span>
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

export function statusLine(t: T, tr: Tracking): string {
  if (tr.status === 'done') return t('track.done')
  const step = groupLabel(t, tr.current[0])
  if (tr.status === 'onTrack') return t('track.onTrack', { time: fmtDurationShort(tr.blockMs) })
  if (tr.status === 'idle') return t('track.next', { step })
  return t('track.switchTo', { step })
}
