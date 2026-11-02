import { createContext, useContext } from 'react'
import type { BonusResult } from '../core/bonuses'
import type { GameIndex, SourceChoices } from '../core/planner'
import type { RouteOptions } from '../core/route'
import type { Id, ItemGoal, Profile } from '../core/types'

export type RouteTarget =
  | { id: string; kind: 'level'; skill: Id; level: number }
  | { id: string; kind: 'gold'; amount: number }
  | { id: string; kind: 'unlock'; purchase: Id }

export type View =
  | { kind: 'plan' }
  | { kind: 'route'; id: string }
  | { kind: 'profile' }
  | { kind: 'skill'; skill: Id }
  | { kind: 'detail'; type: DetailType; id: Id }

export type DetailType = 'item' | 'enemy' | 'area' | 'purchase'

export type PlanTab = 'flow' | 'tree' | 'materials'

export interface State {
  items: ItemGoal[]
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
  /** Vorige Ansichten für „Zurück" (nicht gespeichert) */
  history: View[]
}

export type Action =
  | { type: 'addItem'; item: Id; qty?: number }
  | { type: 'setItemQty'; item: Id; qty: number }
  | { type: 'removeItem'; item: Id }
  | { type: 'addRoute'; route: RouteTarget }
  | { type: 'updateRoute'; route: RouteTarget }
  | { type: 'removeRoute'; id: string }
  | { type: 'setLevel'; skill: Id; level: number }
  | { type: 'setCurrency'; currency: Id; qty: number }
  | { type: 'setStock'; item: Id; qty: number }
  | { type: 'setOwned'; purchase: Id; owned: boolean }
  | { type: 'setPlots'; plots: number }
  | { type: 'setGuildRank'; skill: Id; rank: number }
  | { type: 'resetProfile' }
  | { type: 'importProfile'; profile: Profile }
  | { type: 'choose'; item: Id; recipe: Id | null }
  | { type: 'setOption'; options: Partial<RouteOptions> }
  | { type: 'toggleDone'; key: string }
  | { type: 'clearDone' }
  | { type: 'view'; view: View }
  | { type: 'tab'; tab: PlanTab }
  | { type: 'select'; item: Id | null }
  | { type: 'inspector'; open: boolean }
  | { type: 'setLive'; save: string | null }
  | { type: 'back' }

export const emptyProfile = (): Profile => ({ levels: {}, inventory: {}, currencies: {}, owned: {}, farmingPlots: 4 })

export const initialState = (): State => ({
  items: [],
  routes: [],
  profile: emptyProfile(),
  choices: {},
  options: { includeMaterials: true, bonuses: true, smart: true },
  done: {},
  view: { kind: 'plan' },
  tab: 'flow',
  selected: null,
  inspectorOpen: true,
  live: null,
  history: [],
})

export function reducer(s: State, a: Action): State {
  const p = s.profile
  switch (a.type) {
    case 'addItem': {
      const qty = a.qty ?? 1
      const has = s.items.some((g) => g.item === a.item)
      return {
        ...s,
        items: has ? s.items.map((g) => (g.item === a.item ? { ...g, qty: g.qty + qty } : g)) : [...s.items, { item: a.item, qty }],
      }
    }
    case 'setItemQty':
      return { ...s, items: s.items.map((g) => (g.item === a.item ? { ...g, qty: Math.max(1, a.qty) } : g)) }
    case 'removeItem':
      return { ...s, items: s.items.filter((g) => g.item !== a.item) }
    case 'addRoute':
      return { ...s, routes: [...s.routes, a.route], view: { kind: 'route', id: a.route.id } }
    case 'updateRoute':
      return { ...s, routes: s.routes.map((r) => (r.id === a.route.id ? a.route : r)) }
    case 'removeRoute':
      return {
        ...s,
        routes: s.routes.filter((r) => r.id !== a.id),
        view: s.view.kind === 'route' && s.view.id === a.id ? { kind: 'plan' } : s.view,
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
      if (JSON.stringify(a.view) === JSON.stringify(s.view)) return s
      return { ...s, view: a.view, history: [...s.history, s.view].slice(-30) }
    case 'back': {
      const prev = s.history.at(-1)
      return prev ? { ...s, view: prev, history: s.history.slice(0, -1) } : s
    }
    case 'tab':
      return { ...s, tab: a.tab }
    case 'select':
      return { ...s, selected: a.item, inspectorOpen: a.item ? true : s.inspectorOpen }
    case 'inspector':
      return { ...s, inspectorOpen: a.open }
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
    const saved = JSON.parse(raw) as Partial<State>
    return {
      ...base,
      ...saved,
      profile: { ...base.profile, ...saved.profile },
      options: { ...base.options, ...saved.options },
      selected: null,
      history: [],
    }
  } catch {
    return base
  }
}

export function saveState(s: State) {
  try {
    const { selected: _s, inspectorOpen: _i, history: _h, ...keep } = s
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
