import type { Currency, GameData, Id, Item, ItemGoal, Profile, Purchase, Recipe, Req, Skill } from './types'

// ---------------------------------------------------------------------------
// Index

export interface GameIndex {
  data: GameData
  items: Map<Id, Item>
  skills: Map<Id, Skill>
  currencies: Map<Id, Currency>
  recipes: Map<Id, Recipe>
  purchases: Map<Id, Purchase>
  /** Item → Rezepte, die es liefern */
  producers: Map<Id, Recipe[]>
  /** Item → Rezepte, die es verbrauchen */
  consumers: Map<Id, Recipe[]>
}

export function buildIndex(data: GameData): GameIndex {
  const producers = new Map<Id, Recipe[]>()
  const consumers = new Map<Id, Recipe[]>()
  for (const r of data.recipes) {
    for (const o of r.outputs) push(producers, o.item, r)
    for (const i of r.inputs) push(consumers, i.item, r)
  }
  return {
    data,
    items: new Map(data.items.map((i) => [i.id, i])),
    skills: new Map(data.skills.map((s) => [s.id, s])),
    currencies: new Map(data.currencies.map((c) => [c.id, c])),
    recipes: new Map(data.recipes.map((r) => [r.id, r])),
    purchases: new Map(data.purchases.map((p) => [p.id, p])),
    producers,
    consumers,
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key)
  if (list) {
    if (!list.includes(value)) list.push(value)
  } else map.set(key, [value])
}

const GATHERING = new Set(['woodcutting', 'mining', 'fishing', 'farming', 'thieving'])
export const isGathering = (r: Recipe) => GATHERING.has(r.kind)

export const levelOf = (profile: Profile, skill: Id | null) => (skill ? (profile.levels[skill] ?? 1) : 1)

/** Erfolgschance (Kochen, Thieving) mit dem Level, ab dem man das Rezept kann */
export function successChance(r: Recipe, profile: Profile): number {
  if (!r.success) return 1
  const level = Math.max(levelOf(profile, r.skill), r.level)
  const s = r.success
  if (s.kind === 'cooking') return clamp01((69 + Math.max(0, level + (s.proficiency ?? 0))) / (69 + s.difficulty))
  const stealth = Math.max(0, Math.floor((level + (s.stealthFlat ?? 0)) * (1 + (s.stealthPct ?? 0))))
  return clamp01((100 + stealth) / (100 + s.perception))
}

/** Mittlere Zeit je Durchlauf — Thieving: Fehlschlag kostet die Betäubung;
 *  Farming: Wachstum, geteilt durch die Felder, die gleichzeitig wachsen */
export function actionTime(r: Recipe, profile: Profile): number {
  if (r.success?.kind === 'thieving') {
    return r.timeMs + (1 - successChance(r, profile)) * (1 - (r.success.stunAvoid ?? 0)) * r.success.stunMs
  }
  if (r.passive) return r.timeMs / Math.max(1, profile.farmingPlots ?? 1)
  return r.timeMs
}

/** Erwartete Menge eines Items je Durchlauf */
export function yieldOf(r: Recipe, item: Id, profile: Profile): number {
  let y = 0
  for (const o of r.outputs) if (o.item === item) y += o.qty * o.chance
  return y * successChance(r, profile)
}

/** Erwartete Währung je Durchlauf (Thieving-Beute, Feuermachen) */
export function currencyYield(r: Recipe, currency: Id, profile: Profile): number {
  let y = 0
  for (const o of r.currencyOutputs ?? []) if (o.currency === currency) y += o.qty * o.chance
  return y * successChance(r, profile)
}

/** Anforderungen, die mit diesem Profil (noch) nicht erfüllt sind.
 *  „other" (Quests …) kennt der Planer nicht — die gelten als erfüllt und
 *  werden nur angezeigt. */
export function unmetReqs(reqs: Req[], profile: Profile): Req[] {
  return reqs.filter((q) => {
    if (q.type === 'level') return levelOf(profile, q.skill) < q.level
    if (q.type === 'purchase') return !(profile.owned[q.purchase] > 0)
    if (q.type === 'item') return !(profile.inventory[q.item] > 0) && !profile.equipped?.includes(q.item)
    return false
  })
}

export const isAvailable = (r: Recipe, profile: Profile) => !r.demoLocked && unmetReqs(r.reqs, profile).length === 0

/** Standardquelle: freigeschaltet, echtes Herstellen/Sammeln vor Upgrade vor
 *  Shop vor Nebenprodukt, Anforderungen erfüllt, dann schnellste je Stück. */
export function rankSources(index: GameIndex, item: Id, profile: Profile): Recipe[] {
  const list = index.producers.get(item) ?? []
  const key = (r: Recipe) => {
    const kind = r.kind === 'upgrade' ? 1 : r.kind === 'shop' ? 2 : r.kind === 'thieving' ? 3 : r.kind === 'firemaking' ? 4 : 0
    const out = r.outputs.find((o) => o.item === item)
    const byproduct = !isGathering(r) && out && out.chance < 1 ? 1 : 0
    const unmet = unmetReqs(r.reqs, profile).length > 0 ? 1 : 0
    const y = yieldOf(r, item, profile)
    const perUnit = y > 0 ? actionTime(r, profile) / y : Infinity
    return [r.demoLocked ? 1 : 0, kind, byproduct, unmet, perUnit]
  }
  return [...list].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]
    return 0
  })
}

// ---------------------------------------------------------------------------
// Crafting-Plan

export type Issue = 'noSource' | 'cycle' | 'locked'

export interface PlanNode {
  key: string
  item: Id
  need: number
  fromStock: number
  toMake: number
  recipe: Recipe | null
  completions: number
  successChance: number
  surplus: number
  timeMs: number
  xp: number
  children: PlanNode[]
  issue?: Issue
  alternatives: number
  depth: number
}

export interface MakeStep {
  key: string
  recipe: Recipe
  item: Id
  completions: number
  amount: number
  timeMs: number
  xp: number
}

export interface Plan {
  roots: PlanNode[]
  activeMs: number
  passiveMs: number
  spent: Map<Id, number>
  xp: Map<Id, number>
  /** höchstes verlangtes Level je Skill */
  levels: Map<Id, number>
  /** fehlende Freischaltungen, Werkzeuge, Unbekanntes */
  purchases: Set<Id>
  tools: Set<Id>
  otherReqs: string[]
  gathered: Map<Id, number>
  bought: Map<Id, number>
  missing: Map<Id, number>
  stockUsed: Map<Id, number>
  steps: MakeStep[]
}

export type SourceChoices = Record<Id, Id>

export function makePlan(index: GameIndex, goals: ItemGoal[], profile: Profile, choices: SourceChoices): Plan {
  const pool = new Map<Id, number>(Object.entries(profile.inventory).filter(([, n]) => n > 0))
  const stockUsed = new Map<Id, number>()

  const choose = (item: Id): Recipe | null => {
    const chosen = choices[item] ? index.recipes.get(choices[item]) : undefined
    if (chosen && chosen.outputs.some((o) => o.item === item)) return chosen
    return rankSources(index, item, profile)[0] ?? null
  }

  function expand(item: Id, need: number, path: Id[], key: string): PlanNode {
    const have = pool.get(item) ?? 0
    const fromStock = Math.min(have, need)
    if (fromStock > 0) {
      pool.set(item, have - fromStock)
      add(stockUsed, item, fromStock)
    }
    const node: PlanNode = {
      key,
      item,
      need,
      fromStock,
      toMake: need - fromStock,
      recipe: null,
      completions: 0,
      successChance: 1,
      surplus: 0,
      timeMs: 0,
      xp: 0,
      children: [],
      alternatives: index.producers.get(item)?.length ?? 0,
      depth: path.length,
    }
    if (node.toMake <= 0) return node

    const recipe = choose(item)
    if (!recipe) return { ...node, issue: 'noSource' }
    node.recipe = recipe
    if (path.includes(item)) return { ...node, issue: 'cycle' }
    if (recipe.demoLocked) node.issue = 'locked'

    const per = yieldOf(recipe, item, profile)
    if (per <= 0) return { ...node, issue: 'noSource' }
    node.successChance = successChance(recipe, profile)
    node.completions = Math.ceil(node.toMake / per - 1e-9)
    node.surplus = Math.floor(node.completions * per - node.toMake + 1e-9)
    // Überschuss und sichere Nebenprodukte stehen späteren Zweigen zur Verfügung
    if (node.surplus > 0) add(pool, item, node.surplus)
    for (const o of recipe.outputs) {
      if (o.item !== item && o.chance >= 1) add(pool, o.item, o.qty * node.completions)
    }
    node.timeMs = node.completions * actionTime(recipe, profile)
    node.xp = node.completions * recipe.xp * node.successChance

    node.children = recipe.inputs.map((input, i) =>
      expand(input.item, input.qty * node.completions, [...path, item], `${key}/${i}`),
    )
    return node
  }

  const roots = goals.map((g, i) => expand(g.item, g.qty, [], `g${i}`))

  const plan: Plan = {
    roots,
    activeMs: 0,
    passiveMs: 0,
    spent: new Map(),
    xp: new Map(),
    levels: new Map(),
    purchases: new Set(),
    tools: new Set(),
    otherReqs: [],
    gathered: new Map(),
    bought: new Map(),
    missing: new Map(),
    stockUsed,
    steps: [],
  }
  const other = new Set<string>()
  const steps = new Map<Id, MakeStep & { depth: number; order: number }>()
  let order = 0

  const walk = (n: PlanNode) => {
    n.children.forEach(walk)
    const r = n.recipe
    if (n.issue === 'noSource' || n.issue === 'cycle') {
      if (n.toMake > 0) add(plan.missing, n.item, n.toMake)
      return
    }
    if (!r || n.completions === 0) return
    for (const c of r.costs) add(plan.spent, c.currency, c.qty * n.completions)
    if (r.skill && n.xp > 0) add(plan.xp, r.skill, n.xp)
    for (const q of r.reqs) {
      if (q.type === 'level') plan.levels.set(q.skill, Math.max(plan.levels.get(q.skill) ?? 0, q.level))
      else if (q.type === 'purchase' && !(profile.owned[q.purchase] > 0)) plan.purchases.add(q.purchase)
      else if (q.type === 'item' && unmetReqs([q], profile).length) plan.tools.add(q.item)
      else if (q.type === 'other') other.add(q.text)
    }
    if (r.purchase && !(profile.owned[r.purchase] > 0)) {
      // Ein Shop-Kauf von Items ist selbst keine Freischaltung — nur seine Anforderungen zählen
      for (const q of index.purchases.get(r.purchase)?.reqs ?? []) {
        if (q.type === 'level') plan.levels.set(q.skill, Math.max(plan.levels.get(q.skill) ?? 0, q.level))
      }
    }
    if (isGathering(r)) add(plan.gathered, n.item, n.toMake)
    if (r.kind === 'shop') add(plan.bought, n.item, n.toMake)
    if (r.passive) plan.passiveMs += n.timeMs
    else plan.activeMs += n.timeMs

    const s = steps.get(r.id)
    if (s) {
      s.completions += n.completions
      s.amount += n.toMake
      s.timeMs += n.timeMs
      s.xp += n.xp
      s.depth = Math.max(s.depth, n.depth)
    } else {
      steps.set(r.id, {
        key: r.id,
        recipe: r,
        item: n.item,
        completions: n.completions,
        amount: n.toMake,
        timeMs: n.timeMs,
        xp: n.xp,
        depth: n.depth,
        order: order++,
      })
    }
  }
  roots.forEach(walk)
  plan.otherReqs = [...other]

  // Schritte: tiefste zuerst, sonst in der Reihenfolge, in der der Baum sie braucht
  plan.steps = [...steps.values()]
    .sort((a, b) => b.depth - a.depth || a.order - b.order)
    .map(({ depth: _d, order: _o, ...step }) => step)
  return plan
}

export function add(map: Map<Id, number>, key: Id, n: number) {
  map.set(key, (map.get(key) ?? 0) + n)
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
