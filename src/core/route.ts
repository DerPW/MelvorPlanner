// Schnellster Weg zu einem Level oder einem Goldbetrag.
//
// Gierige Simulation: In jedem Abschnitt gewinnt die Aktivität mit der besten
// Rate (Ziel-XP bzw. Netto-Gold pro Zeit) unter dem, was mit dem AKTUELLEN
// Stand freigeschaltet ist. Ein Abschnitt endet, sobald das Ziel erreicht ist
// oder irgendein beteiligter Skill aufsteigt — dann kann etwas Besseres frei
// sein („erst X bis Lv n, dann Y"). Material kommt zuerst aus dem Lager —
// eine Aktivität läuft höchstens so oft, wie es reicht, dann wird neu gewählt
// (weiter mit Beschaffung oder etwas anderes). Beschafft wird über dieselbe
// Quellenwahl wie im Crafting-Plan; Zeit und XP der Kette zählen mit, auch
// für die anderen Skills.

import { MAX_LEVEL, levelForXp, xpForLevel } from './experience'
import { actionTime, currencyYield, isAvailable, rankSources, successChance, yieldOf, type GameIndex } from './planner'
import type { Id, Msg, Profile, Recipe } from './types'

export const GP = 'MelvorBase:GoldPieces'

export type RouteGoal = { kind: 'level'; skill: Id; level: number } | { kind: 'gold'; amount: number }

export interface RouteOptions {
  /** Material selbst beschaffen (Zeit + XP der Kette zählen mit) */
  includeMaterials: boolean
  /** Boni (Shop, Werkzeuge, Gilde) einrechnen */
  bonuses: boolean
  /** Upgrades und Umwege durchrechnen und den schnellsten Weg nehmen */
  smart: boolean
}

interface Bundle {
  timeMs: number
  xp: Map<Id, number>
  gold: number
  /** Rezept → Durchläufe */
  recipes: Map<Id, number>
  /** Rezept → Zeit (die Aktivität selbst und jede Vorstufe) */
  recipeMs: Map<Id, number>
  /** Rezept → Item, für das es in der Kette läuft (Angelplätze liefern mehrere) */
  recipeItem: Map<Id, Id>
}

interface Activity extends Bundle {
  recipe: Recipe
  rate: number
  /** Durchläufe, die das Lager noch hergibt (Infinity = kein Lager-Material) */
  cap: number
  /** Alle Zutaten kommen aus dem Lager */
  fromStock: boolean
}

export interface RouteSegment {
  recipe: Recipe
  actions: number
  timeMs: number
  /** Level bzw. Gold am Anfang und Ende des Abschnitts */
  from: number
  to: number
  xp: Map<Id, number>
  gold: number
  chain: Map<Id, number>
  /** Zeit je Rezept der Kette (Vorstufen und die Aktivität selbst) */
  chainMs: Map<Id, number>
  /** Item je Vorstufe */
  chainItem: Map<Id, Id>
  /** Zutaten aus dem Lager statt beschafft */
  fromStock: boolean
  /** Davon aus dem Lager genommen */
  used: Map<Id, number>
  ratePerHour: number
}

export interface Route {
  goal: RouteGoal
  segments: RouteSegment[]
  totalMs: number
  xp: Map<Id, number>
  gold: number
  /** Beim Trainieren hergestellt (Level-Routen; Gold-Routen verkaufen alles) */
  produced: Map<Id, number>
  /** Aus dem Lager verbraucht */
  consumed: Map<Id, number>
  before: Profile
  after: Profile
  reached: boolean
  alreadyDone: boolean
  stopReason: Msg | null
}

const NOT_AN_ACTIVITY = new Set(['shop', 'upgrade', 'mill', 'farming'])
/** So viele Durchläufe muss das Lager hergeben, damit eine Aktivität es nutzt */
const MIN_STOCK_RUNS = 10

export function planRoute(index: GameIndex, goal: RouteGoal, profile: Profile, options: RouteOptions): Route {
  const cap = profile.levelCap ?? MAX_LEVEL
  const level: Record<Id, number> = {}
  const xp: Record<Id, number> = {}
  for (const s of index.data.skills) {
    level[s.id] = Math.min(cap, Math.max(1, profile.levels[s.id] ?? 1))
    // Genaue XP aus dem Spielstand nur, solange sie zum Level passen
    const exact = profile.xp?.[s.id]
    xp[s.id] = exact != null && Math.min(cap, levelForXp(exact)) === level[s.id] ? exact : xpForLevel(level[s.id])
  }
  let gold = profile.currencies[GP] ?? 0
  const now = (): Profile => ({ ...profile, levels: { ...level }, xp: { ...xp }, currencies: { ...profile.currencies, [GP]: gold } })

  const route: Route = {
    goal,
    segments: [],
    totalMs: 0,
    xp: new Map(),
    gold: 0,
    produced: new Map(),
    consumed: new Map(),
    before: now(),
    after: now(),
    reached: false,
    alreadyDone: false,
    stopReason: null,
  }

  const reached = () => (goal.kind === 'level' ? level[goal.skill] >= goal.level : gold >= goal.amount)
  if (reached()) {
    route.reached = route.alreadyDone = true
    return route
  }
  if (goal.kind === 'level' && goal.level > cap) {
    route.stopReason = { key: 'route.maxLevel', params: { cap } }
    return route
  }

  const candidates = index.data.recipes.filter((r) => {
    if (r.demoLocked || r.timeMs <= 0) return false
    // Farming trainiert nur sich selbst — als Goldquelle ist es Wartezeit
    if (NOT_AN_ACTIVITY.has(r.kind) && !(r.kind === 'farming' && goal.kind === 'level')) return false
    if (goal.kind === 'level') return r.skill === goal.skill && r.xp > 0
    return (
      r.outputs.some((o) => index.items.get(o.item)?.sells?.currency === GP) ||
      (r.currencyOutputs ?? []).some((c) => c.currency === GP)
    )
  })

  // Das Lager läuft mit: Zutaten werden daraus genommen, Ergebnisse (Level-Routen) kommen hinein
  const stock = new Map(Object.entries(profile.inventory).filter(([, n]) => n > 0))

  for (let guard = 0; guard < 5000 && !reached(); guard++) {
    const p = now()
    const unit = unitCosts(index, p)

    let best: Activity | null = null
    for (const r of candidates) {
      if (!isAvailable(r, p)) continue
      const s = successChance(r, p)
      const own = actionTime(r, p)
      const a: Activity = {
        recipe: r,
        timeMs: own,
        xp: new Map(),
        gold: 0,
        recipes: new Map([[r.id, 1]]),
        recipeMs: new Map([[r.id, own]]),
        recipeItem: new Map(),
        rate: 0,
        cap: Infinity,
        fromStock: false,
      }
      if (r.skill && r.xp) addTo(a.xp, r.skill, r.xp * s)
      for (const c of r.costs) if (c.currency === GP) a.gold -= c.qty
      a.gold += currencyYield(r, GP, p)
      // Gold-Route verkauft das Ergebnis; Level-Route behält es (→ Lager)
      if (goal.kind === 'gold') {
        for (const o of r.outputs) {
          const sells = index.items.get(o.item)?.sells
          if (sells?.currency === GP) a.gold += sells.qty * o.qty * o.chance * s
        }
      }
      if (options.includeMaterials) {
        let ok = true
        let all = r.inputs.length > 0
        for (const i of r.inputs) {
          // Reicht das Lager für ein paar Durchläufe, kostet die Zutat nichts — bis es leer ist.
          // Reste unter MIN_STOCK_RUNS bleiben liegen (sonst „1× aus dem Lager“-Schritte)
          const have = stock.get(i.item) ?? 0
          if (have >= i.qty * MIN_STOCK_RUNS) {
            a.cap = Math.min(a.cap, Math.floor(have / i.qty))
            continue
          }
          all = false
          const c = unit(i.item)
          if (!c) {
            ok = false
            break
          }
          merge(a, c, i.qty)
        }
        if (!ok) continue
        a.fromStock = all
      }
      // Nur, was man sich leisten kann (Shop-Material in der Kette)
      if (a.gold < 0 && gold + a.gold < 0) continue
      a.rate = goal.kind === 'level' ? (a.xp.get(goal.skill) ?? 0) / a.timeMs : a.gold / a.timeMs
      if (a.rate > 0 && (!best || a.rate > best.rate)) best = a
    }

    if (!best) {
      route.stopReason = { key: goal.kind === 'level' ? 'route.noLevelActivity' : 'route.noGoldActivity' }
      break
    }

    // Aktionen bis zum nächsten Ereignis: Ziel erreicht oder ein Level-Up
    let n =
      goal.kind === 'level'
        ? Math.ceil((xpForLevel(goal.level) - xp[goal.skill]) / best.xp.get(goal.skill)!)
        : Math.ceil((goal.amount - gold) / best.gold)
    for (const [s, per] of best.xp) {
      if (per <= 0 || level[s] >= cap) continue
      n = Math.min(n, Math.ceil((xpForLevel(level[s] + 1) - xp[s]) / per))
    }
    if (best.gold < 0) n = Math.min(n, Math.floor(gold / -best.gold))
    // Nur so oft, wie das Lager reicht — danach neu wählen
    n = Math.max(1, Math.min(n, best.cap))
    const used = new Map<Id, number>()
    if (options.includeMaterials) {
      for (const i of best.recipe.inputs) {
        const have = stock.get(i.item) ?? 0
        if (have < i.qty * MIN_STOCK_RUNS) continue
        const take = Math.min(have, i.qty * n)
        stock.set(i.item, have - take)
        addTo(route.consumed, i.item, take)
        addTo(used, i.item, take)
      }
    }
    if (goal.kind === 'level') {
      const s = successChance(best.recipe, p)
      for (const o of best.recipe.outputs) {
        addTo(route.produced, o.item, o.qty * o.chance * s * n)
        stock.set(o.item, (stock.get(o.item) ?? 0) + o.qty * o.chance * s * n)
      }
    }

    const from = goal.kind === 'level' ? level[goal.skill] : gold
    for (const [s, per] of best.xp) {
      xp[s] += per * n
      level[s] = Math.min(cap, levelForXp(xp[s]))
      addTo(route.xp, s, per * n)
    }
    gold += best.gold * n
    route.gold += best.gold * n
    route.totalMs += best.timeMs * n
    const to = goal.kind === 'level' ? level[goal.skill] : gold

    const last = route.segments.at(-1)
    if (last && last.recipe.id === best.recipe.id && last.fromStock === best.fromStock) {
      last.actions += n
      last.timeMs += best.timeMs * n
      last.to = to
      last.gold += best.gold * n
      for (const [s, per] of best.xp) addTo(last.xp, s, per * n)
      for (const [id, per] of best.recipes) addTo(last.chain, id, per * n)
      for (const [id, ms] of best.recipeMs) addTo(last.chainMs, id, ms * n)
      for (const [id, item] of best.recipeItem) last.chainItem.set(id, item)
      for (const [id, q] of used) addTo(last.used, id, q)
      last.ratePerHour = rateOf(last, goal)
    } else {
      const seg: RouteSegment = {
        recipe: best.recipe,
        actions: n,
        timeMs: best.timeMs * n,
        from,
        to,
        xp: scale(best.xp, n),
        gold: best.gold * n,
        chain: scale(best.recipes, n),
        chainMs: scale(best.recipeMs, n),
        chainItem: new Map(best.recipeItem),
        fromStock: best.fromStock,
        used,
        ratePerHour: 0,
      }
      seg.ratePerHour = rateOf(seg, goal)
      route.segments.push(seg)
    }
  }

  route.after = now()
  route.reached = reached()
  return route
}

/** Zeit, XP und Gold, um ein Stück eines Items mit dem aktuellen Stand selbst
 *  zu beschaffen (beste freigeschaltete Quelle, rekursiv). */
export function unitCosts(index: GameIndex, p: Profile) {
  const memo = new Map<Id, Bundle | null>()
  const unit = (item: Id, stack: Id[] = []): Bundle | null => {
    if (memo.has(item)) return memo.get(item)!
    if (stack.includes(item)) return null
    let result: Bundle | null = null
    for (const r of rankSources(index, item, p)) {
      if (!isAvailable(r, p)) continue
      const per = yieldOf(r, item, p)
      if (per <= 0) continue
      const parts = r.inputs.map((i) => ({ qty: i.qty / per, cost: unit(i.item, [...stack, item]) }))
      if (parts.some((x) => !x.cost)) continue
      const ms = actionTime(r, p) / per
      const c: Bundle = {
        timeMs: ms,
        xp: new Map(),
        gold: 0,
        recipes: new Map([[r.id, 1 / per]]),
        recipeMs: new Map([[r.id, ms]]),
        recipeItem: new Map([[r.id, item]]),
      }
      if (r.skill && r.xp) addTo(c.xp, r.skill, (r.xp * successChance(r, p)) / per)
      for (const cost of r.costs) if (cost.currency === GP) c.gold -= cost.qty / per
      for (const x of parts) merge(c, x.cost!, x.qty)
      result = c
      break
    }
    memo.set(item, result)
    return result
  }
  return unit
}

function rateOf(seg: RouteSegment, goal: RouteGoal) {
  const gain = goal.kind === 'level' ? (seg.xp.get(goal.skill) ?? 0) : seg.gold
  return seg.timeMs > 0 ? (gain / seg.timeMs) * 3_600_000 : 0
}

function addTo(map: Map<Id, number>, key: Id, n: number) {
  map.set(key, (map.get(key) ?? 0) + n)
}

function scale(map: Map<Id, number>, n: number) {
  return new Map([...map].map(([k, v]) => [k, v * n]))
}

function merge(target: Bundle, src: Bundle, factor: number) {
  target.timeMs += src.timeMs * factor
  target.gold += src.gold * factor
  for (const [s, v] of src.xp) addTo(target.xp, s, v * factor)
  for (const [id, v] of src.recipes) addTo(target.recipes, id, v * factor)
  for (const [id, v] of src.recipeMs) addTo(target.recipeMs, id, v * factor)
  for (const [id, item] of src.recipeItem) target.recipeItem.set(id, item)
}
