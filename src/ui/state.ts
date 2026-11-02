import { createContext, useContext } from 'react'
import type { BonusResult } from '../core/bonuses'
import type { GameIndex, SourceChoices } from '../core/planner'
import type { RouteOptions } from '../core/route'
import type { CombatLoadout, Id, ItemGoal, Profile } from '../core/types'

// Eine Route ist ein Ziel — ein Item, ein Level, Gold, ein Kauf — samt dem
// ganzen Weg dorthin. Früher gab es daneben einen Crafting-Plan, der alle
// Items zu einem Baum verschmolz; der ist in den Item-Routen aufgegangen.
export type RouteTarget = (
  | { id: string; kind: 'item'; item: Id; qty: number }
  | { id: string; kind: 'level'; skill: Id; level: number }
  | { id: string; kind: 'gold'; amount: number }
  | { id: string; kind: 'unlock'; purchase: Id }
) & {
  /** Gemiedene Wege (Rezept-Ids, `purchase:<Id>`) und die vorigen Stände für „‹“ */
  avoid?: string[]
  avoidHistory?: string[][]
}

export type View =
  | { kind: 'routes' }
  | { kind: 'route'; id: string }
  | { kind: 'profile' }
  | { kind: 'combat' }
  | { kind: 'gear' }
  | { kind: 'skill'; skill: Id }
  | { kind: 'detail'; type: DetailType; id: Id }

export type DetailType = 'item' | 'enemy' | 'area' | 'purchase'

export type PlanTab = 'flow' | 'tree' | 'materials'

export interface State {
  routes: RouteTarget[]
  profile: Profile
  choices: SourceChoices
  options: RouteOptions
  done: Record<string, boolean>
  view: View
  tab: PlanTab
  selected: Id | null
  inspectorOpen: boolean
  /** Live-Verbindung: Spielstand-Datei, die mitgelesen wird */
  live: { save: string } | null
  /** Route, die live verfolgt wird (Schritt, Restzeit, Benachrichtigung beim Wechsel) */
  activeRoute: string | null
  /** Vorige Ansichten für „Zurück" (nicht gespeichert) */
  history: View[]
  /** Brotkrumen: der Pfad über Verweise bis zur jetzigen Ansicht (nicht gespeichert) */
  trail: View[]
}

export type Action =
  | { type: 'addRoute'; route: RouteTarget; root?: boolean }
  | { type: 'updateRoute'; route: RouteTarget }
  | { type: 'removeRoute'; id: string }
  | { type: 'setLevel'; skill: Id; level: number }
  | { type: 'setCurrency'; currency: Id; qty: number }
  | { type: 'setStock'; item: Id; qty: number }
  | { type: 'setOwned'; purchase: Id; owned: boolean }
  | { type: 'setPlots'; plots: number }
  | { type: 'setGuildRank'; skill: Id; rank: number }
  /** Kampf-Ausrüstung, Haltung, Zauber, Essen */
  | { type: 'setCombat'; loadout: CombatLoadout }
  /** Freischaltung von Hand festlegen; null = wieder schätzen */
  | { type: 'setUnlocked'; feature: Id; unlocked: boolean | null }
  | { type: 'resetProfile' }
  | { type: 'importProfile'; profile: Profile }
  | { type: 'choose'; item: Id; recipe: Id | null }
  | { type: 'setOption'; options: Partial<RouteOptions> }
  | { type: 'toggleDone'; key: string }
  | { type: 'clearDone' }
  /** `root`: Navigation aus Seitenleiste oder Suche — beginnt einen neuen Pfad */
  | { type: 'view'; view: View; root?: boolean }
  | { type: 'tab'; tab: PlanTab }
  | { type: 'select'; item: Id | null }
  | { type: 'inspector'; open: boolean }
  | { type: 'setLive'; save: string | null }
  | { type: 'setActiveRoute'; id: string | null }
  | { type: 'back' }

export const emptyProfile = (): Profile => ({ levels: {}, inventory: {}, currencies: {}, owned: {}, farmingPlots: 4 })

export const initialState = (): State => ({
  routes: [],
  profile: emptyProfile(),
  choices: {},
  options: { includeMaterials: true, bonuses: true, smart: true },
  done: {},
  view: { kind: 'routes' },
  tab: 'flow',
  selected: null,
  inspectorOpen: true,
  live: null,
  activeRoute: null,
  history: [],
  trail: [{ kind: 'routes' }],
})

export function reducer(s: State, a: Action): State {
  const p = s.profile
  switch (a.type) {
    case 'addRoute': {
      // Dasselbe Ziel gibt es schon → das öffnen statt doppelt anzulegen
      const same = s.routes.find((r) => sameGoal(r, a.route))
      const route = same ?? a.route
      return reducer({ ...s, routes: same ? s.routes : [...s.routes, route] }, { type: 'view', view: { kind: 'route', id: route.id }, root: a.root })
    }
    case 'updateRoute':
      return { ...s, routes: s.routes.map((r) => (r.id === a.route.id ? a.route : r)) }
    case 'removeRoute': {
      const i = s.routes.findIndex((r) => r.id === a.id)
      const routes = s.routes.filter((r) => r.id !== a.id)
      const gone = (v: View) => v.kind === 'route' && v.id === a.id
      // Offen war genau diese → die nächste zeigen, sonst die Übersicht
      const next = routes[Math.min(i, routes.length - 1)]
      return {
        ...s,
        routes,
        activeRoute: s.activeRoute === a.id ? null : s.activeRoute,
        view: gone(s.view) ? (next ? { kind: 'route', id: next.id } : { kind: 'routes' }) : s.view,
        history: s.history.filter((v) => !gone(v)),
        trail: gone(s.view) ? [next ? { kind: 'route', id: next.id } : { kind: 'routes' }] : s.trail.filter((v) => !gone(v)),
      }
    }
    case 'setLevel': {
      // Von Hand gesetzt: die genauen XP aus dem Spielstand gelten nicht mehr
      const xp = p.xp ? { ...p.xp } : undefined
      if (xp) delete xp[a.skill]
      return { ...s, profile: { ...p, levels: { ...p.levels, [a.skill]: a.level }, xp } }
    }
    case 'setCurrency':
      return { ...s, profile: { ...p, currencies: { ...p.currencies, [a.currency]: Math.max(0, a.qty) } } }
    case 'setStock': {
      const inventory = { ...p.inventory }
      if (a.qty > 0) inventory[a.item] = a.qty
      else delete inventory[a.item]
      return { ...s, profile: { ...p, inventory } }
    }
    case 'setOwned': {
      const owned = { ...p.owned }
      if (a.owned) owned[a.purchase] = 1
      else delete owned[a.purchase]
      return { ...s, profile: { ...p, owned } }
    }
    case 'setCombat':
      return { ...s, profile: { ...p, combat: a.loadout } }
    case 'setUnlocked': {
      const unlocked = { ...p.unlocked }
      if (a.unlocked === null) delete unlocked[a.feature]
      else unlocked[a.feature] = a.unlocked
      return { ...s, profile: { ...p, unlocked } }
    }
    case 'setGuildRank':
      return { ...s, profile: { ...p, guildRanks: { ...p.guildRanks, [a.skill]: a.rank } } }
    case 'setPlots':
      return { ...s, profile: { ...p, farmingPlots: Math.max(1, a.plots) } }
    case 'resetProfile':
      return { ...s, profile: emptyProfile() }
    case 'importProfile':
      return { ...s, profile: a.profile }
    case 'choose': {
      const choices = { ...s.choices }
      if (a.recipe) choices[a.item] = a.recipe
      else delete choices[a.item]
      return { ...s, choices }
    }
    case 'setOption':
      return { ...s, options: { ...s.options, ...a.options } }
    case 'toggleDone':
      return { ...s, done: { ...s.done, [a.key]: !s.done[a.key] } }
    case 'clearDone':
      return { ...s, done: {} }
    case 'view':
      if (sameView(a.view, s.view)) return s
      return { ...s, view: a.view, history: [...s.history, s.view].slice(-30), trail: nextTrail(s.trail, a.view, a.root) }
    case 'back': {
      const prev = s.history.at(-1)
      if (!prev) return s
      const trail = s.trail.length > 1 && sameView(s.trail.at(-2)!, prev) ? s.trail.slice(0, -1) : [prev]
      return { ...s, view: prev, history: s.history.slice(0, -1), trail }
    }
    case 'tab':
      return { ...s, tab: a.tab }
    case 'select':
      return { ...s, selected: a.item, inspectorOpen: a.item ? true : s.inspectorOpen }
    case 'inspector':
      return { ...s, inspectorOpen: a.open }
    case 'setActiveRoute':
      return { ...s, activeRoute: a.id }
    case 'setLive':
      return { ...s, live: a.save ? { save: a.save } : null }
  }
}

// Gemerkt wird alles außer der Auswahl; leer, privat oder gesperrt → frisch.
const KEY = 'melvor-planner:v1'

export function loadState(): State {
  const base = initialState()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return base
    const saved = JSON.parse(raw) as Partial<State> & { items?: ItemGoal[] }
    // Bis 0.5: Items lagen in einem gemeinsamen Crafting-Plan → je eine Item-Route
    const { items: oldItems, ...rest } = saved
    const routes: RouteTarget[] = [
      ...(oldItems ?? []).map((g) => ({ id: newId(), kind: 'item' as const, item: g.item, qty: g.qty })),
      ...(saved.routes ?? []),
    ]
    const view = (saved.view as { kind: string } | undefined)?.kind === 'plan' ? base.view : (saved.view ?? base.view)
    return {
      ...base,
      ...rest,
      routes,
      view,
      profile: { ...base.profile, ...saved.profile },
      options: { ...base.options, ...saved.options },
      selected: null,
      history: [],
      trail: [view],
    }
  } catch {
    return base
  }
}

export function saveState(s: State) {
  try {
    const { selected: _s, inspectorOpen: _i, history: _h, trail: _t, ...keep } = s
    localStorage.setItem(KEY, JSON.stringify(keep))
  } catch {
    // privat / voll — dann eben nicht
  }
}

export interface Ctx {
  /** Mit Boni neu berechnet, wenn eingeschaltet — alle Ansichten rechnen damit */
  index: GameIndex
  /** Grundwerte ohne Boni */
  baseIndex: GameIndex
  bonus: BonusResult
  state: State
  dispatch: (a: Action) => void
}

export const GameContext = createContext<Ctx | null>(null)

export function useGame(): Ctx {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('GameContext fehlt')
  return ctx
}

export const newId = () => Math.random().toString(36).slice(2, 9)

export const sameView = (a: View, b: View) => JSON.stringify(a) === JSON.stringify(b)

/** Pfad weiterführen: neu beginnen (Seitenleiste/Suche), auf eine frühere
 *  Stelle zurückkürzen oder anhängen — höchstens acht Stationen */
function nextTrail(trail: View[], view: View, root?: boolean): View[] {
  if (root) return [view]
  const i = trail.findIndex((v) => sameView(v, view))
  return i >= 0 ? trail.slice(0, i + 1) : [...trail, view].slice(-8)
}

/** Gleiches Ziel (die Menge bzw. das Level zählt mit, außer bei Items) */
export function sameGoal(a: RouteTarget, b: RouteTarget): boolean {
  if (a.kind === 'item' && b.kind === 'item') return a.item === b.item
  if (a.kind === 'level' && b.kind === 'level') return a.skill === b.skill && a.level === b.level
  if (a.kind === 'gold' && b.kind === 'gold') return a.amount === b.amount
  if (a.kind === 'unlock' && b.kind === 'unlock') return a.purchase === b.purchase
  return false
}

export const itemRoute = (s: State, item: Id) => s.routes.find((r): r is Extract<RouteTarget, { kind: 'item' }> => r.kind === 'item' && r.item === item)

/** Route aufs Item: vorhandene öffnen, sonst anlegen */
export const planItem = (item: Id, qty = 1): Action => ({ type: 'addRoute', route: { id: newId(), kind: 'item', item, qty } })
