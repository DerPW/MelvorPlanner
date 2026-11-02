// Ein Ziel beliebiger Art → eine Abfolge von Phasen, die von deinem Stand
// dorthin führt: Trainieren, Gold verdienen, Freischaltungen kaufen,
// Herstellen. Jede Phase arbeitet mit dem Stand, den die vorige hinterlässt
// (Level, Gold, Lager, Käufe) — auch mit den Boni, die unterwegs gekauft werden.
//
// Schlauere Routen: Vor einer Trainings- oder Gold-Route werden Umwege
// durchgerechnet — Upgrades kaufen, die den Skill (oder seine Materialkette)
// beschleunigen, gesperrte Rezepte freischalten — und der schnellste Weg
// genommen, bis zu drei Umwege hintereinander. Beim Herstellen werden für
// Items, deren Standardquelle erst freigeschaltet werden muss, die anderen
// Quellen probiert (z. B. kaufen statt 40 Level trainieren). Gerechnet wird
// jeweils der ganze Weg (Probe auf einer Kopie des Stands), keine Schätzung.

import { applyBonuses } from './bonuses'
import { MAX_LEVEL, levelForXp, xpForLevel } from './experience'
import { add, levelOf, makePlan, unmetReqs, type GameIndex, type Plan, type SourceChoices } from './planner'
import { GP, planRoute, unitCosts, type Route, type RouteGoal, type RouteOptions } from './route'
import type { Id, ItemGoal, Msg, Mod, Profile, Purchase, Req } from './types'

export type Target =
  | { kind: 'items'; items: ItemGoal[] }
  | { kind: 'level'; skill: Id; level: number }
  | { kind: 'gold'; amount: number }
  | { kind: 'unlock'; purchase: Id }

export type Phase =
  | { kind: 'route'; route: Route; why: Msg }
  | { kind: 'buy'; purchase: Purchase; why: Msg; savesMs?: number }
  | { kind: 'craft'; plan: Plan; goals: ItemGoal[]; why: Msg; at: Profile }

export interface Solution {
  target: Target
  phases: Phase[]
  activeMs: number
  passiveMs: number
  before: Profile
  after: Profile
  problems: Msg[]
  notes: string[]
  /** Schlauere Routen: geprüfte und genommene Umwege, gesparte Zeit */
  smart: { checked: number; taken: string[]; savedMs: number }
  /** Quellenwahl, mit der gerechnet wurde (deine + die automatisch beste) */
  choices: SourceChoices
}

export const GOAL: Msg = { key: 'why.goal' }
export const isGoal = (m: Msg) => m.key === GOAL.key

interface Detour {
  id: string
  name: string
  apply: () => void
}

interface Trial {
  ms: number
  phases: Phase[]
  p: Profile
  problems: Map<string, Msg>
  notes: Set<string>
  ch: SourceChoices
}

const MAX_DETOURS = 3
const MAX_CANDIDATES = 12
/** Ein Umweg muss mindestens so viel sparen, sonst lohnt die Unruhe nicht */
const MIN_GAIN = 0.03

export function solve(baseIndex: GameIndex, target: Target, profile: Profile, choices: SourceChoices, options: RouteOptions): Solution {
  // Boni hängen am Stand (Käufe, Werkzeuge, Rang) — je Stand einmal rechnen
  const memo = new Map<string, GameIndex>()
  const indexFor = (q: Profile) => {
    if (!options.bonuses) return baseIndex
    const key = JSON.stringify([q.owned, q.equipped ?? [], q.guildRanks ?? {}])
    let v = memo.get(key)
    if (!v) memo.set(key, (v = applyBonuses(baseIndex, q, true).index))
    return v
  }

  let p = cloneProfile(profile)
  let ch: SourceChoices = { ...choices }
  let phases: Phase[] = []
  let problems = new Map<string, Msg>()
  let notes = new Set<string>()
  const smart = { checked: 0, taken: [] as string[], savedMs: 0 }
  let probing = 0

  const idx = () => indexFor(p)
  const problem = (m: Msg) => problems.set(JSON.stringify(m), m)
  const gold = () => p.currencies[GP] ?? 0
  const skillName = (id: Id) => baseIndex.skills.get(id)?.name ?? id
  const itemName = (id: Id) => baseIndex.items.get(id)?.name ?? id

  // --- Probe: auf einer Kopie ausführen, messen, Stand zurücksetzen

  function trial(fn: () => void): Trial {
    const saved = { p, phases, problems, notes, ch }
    phases = []
    problems = new Map(problems)
    notes = new Set(notes)
    probing++
    try {
      fn()
    } finally {
      probing--
    }
    const result: Trial = { ms: timeOf(phases), phases, p, problems, notes, ch }
    ;({ p, phases, problems, notes, ch } = saved)
    return result
  }

  function commit(r: Trial) {
    phases.push(...r.phases)
    p = r.p
    problems = r.problems
    notes = r.notes
    ch = r.ch
  }

  /** Gierige Suche: bis zu drei Umwege nacheinander, jeder muss die ganze
   *  Rechnung um mindestens MIN_GAIN verbessern */
  function search(main: () => void, pool: Detour[]) {
    const run = (detours: Detour[]) => () => {
      for (const d of detours) d.apply()
      main()
    }
    let best = trial(run([]))
    const baseline = best.ms
    const chosen: { detour: Detour; gain: number }[] = []
    for (let round = 0; round < MAX_DETOURS; round++) {
      let winner: { detour: Detour; result: Trial } | null = null
      for (const c of pool.slice(0, MAX_CANDIDATES)) {
        if (chosen.some((x) => x.detour.id === c.id)) continue
        smart.checked++
        const r = trial(run([...chosen.map((x) => x.detour), c]))
        const target = (winner?.result ?? best).ms
        if (r.problems.size <= best.problems.size && r.ms < target * (1 - MIN_GAIN)) winner = { detour: c, result: r }
      }
      if (!winner) break
      chosen.push({ detour: winner.detour, gain: best.ms - winner.result.ms })
      best = winner.result
    }
    return { best, baseline, chosen }
  }

  /** Bester Weg aus „direkt" und bis zu drei Umwegen davor */
  function optimize(main: () => void, candidates: () => Detour[]) {
    if (!options.smart || probing > 0) return main()
    const { best, baseline, chosen } = search(main, candidates())
    // Was der Umweg spart, steht am Kauf
    for (const { detour, gain } of chosen) {
      const buy = best.phases.find((ph) => ph.kind === 'buy' && ph.purchase.id === detour.id)
      if (buy?.kind === 'buy') buy.savesMs = gain
      smart.taken.push(detour.name)
    }
    if (chosen.length) smart.savedMs += baseline - best.ms
    commit(best)
  }

  /** Schnellste Quellenwahl fürs Herstellen — nur die Wahl wird übernommen,
   *  gerechnet wird danach normal (mit allen Umweg-Prüfungen beim Training) */
  function pickSources(goals: ItemGoal[], why: Msg) {
    if (!options.smart || probing > 0) return
    const { best, baseline, chosen } = search(() => plainItems(goals, why, 0), sourceCandidates(goals))
    if (!chosen.length) return
    ch = best.ch
    smart.taken.push(...chosen.map((c) => c.detour.name))
    smart.savedMs += baseline - best.ms
  }

  /** Skills, deren Rezepte Material für diesen Skill liefern */
  function chainSkills(skill: Id): Set<Id> {
    const out = new Set<Id>([skill])
    for (const r of baseIndex.data.recipes) {
      if (r.skill !== skill) continue
      for (const i of r.inputs) for (const src of baseIndex.producers.get(i.item) ?? []) if (src.skill) out.add(src.skill)
    }
    return out
  }

  /** Shop-Käufe mit Boni, die einen dieser Skills betreffen */
  function upgradeCandidates(skills: Set<Id>): Detour[] {
    if (!options.bonuses) return []
    const affects = (m: Mod) => (m.entity ? skills.has(m.entity) : m.stats === 'Global')
    const out: Detour[] = []
    for (const src of baseIndex.data.bonusSources ?? []) {
      if (src.kind !== 'purchase' || p.owned[src.id] > 0 || !src.mods.some(affects)) continue
      const purchase = baseIndex.purchases.get(src.id)
      if (!purchase || purchase.demoLocked || purchase.reqs.some((q) => q.type === 'other')) continue
      out.push({ id: src.id, name: purchase.name, apply: () => ensurePurchase(src.id, { key: 'why.upgrade' }, 1) })
    }
    // Günstige zuerst — die Auswahl ist begrenzt
    const price = (d: Detour) => baseIndex.purchases.get(d.id)?.costs.find((c) => c.currency === GP)?.qty ?? 0
    return out.sort((a, b) => price(a) - price(b))
  }

  /** Andere Quellen für Items, deren Standardquelle erst etwas verlangt
   *  (Level, Kauf, Werkzeug) — deine eigene Wahl im Inspector bleibt */
  function sourceCandidates(goals: ItemGoal[]): Detour[] {
    const plan = makePlan(idx(), goals, p, ch)
    const out: Detour[] = []
    const seen = new Set<Id>()
    const walk = (n: Plan['roots'][number]) => {
      n.children.forEach(walk)
      const r = n.recipe
      if (!r || seen.has(n.item) || choices[n.item] || n.alternatives < 2) return
      seen.add(n.item)
      if (!unmetReqs(r.reqs, p).length) return
      for (const alt of baseIndex.producers.get(n.item) ?? []) {
        if (alt.id === r.id || alt.demoLocked) continue
        const item = n.item
        out.push({
          id: `src:${item}:${alt.id}`,
          name: `${itemName(item)} ← ${alt.name}`,
          apply: () => (ch = { ...ch, [item]: alt.id }),
        })
      }
    }
    plan.roots.forEach(walk)
    return out
  }

  /** Gesperrte Rezepte dieses Skills, die sich freischalten ließen */
  function unlockCandidates(skill: Id, upTo: number): Detour[] {
    return blockedRecipes(skill, upTo)
      .slice(0, 6)
      .map((b) => ({
        id: `unlock:${b.name}`,
        name: b.name,
        apply: () => resolveNeeds(b.needs, { key: 'why.unlocks', params: { name: b.name } }, 1),
      }))
  }

  // --- Routen

  function runRoute(goal: RouteGoal, why: Msg) {
    const route = planRoute(idx(), goal, p, options)
    if (route.alreadyDone) return route
    if (route.segments.length) phases.push({ kind: 'route', route, why })
    // Was beim Trainieren anfällt, liegt danach im Lager
    const inventory = { ...p.inventory }
    for (const [item, n] of route.produced) inventory[item] = (inventory[item] ?? 0) + Math.floor(n)
    p = { ...route.after, inventory, owned: p.owned }
    return route
  }

  function ensureLevel(skill: Id, level: number, why: Msg, depth = 0) {
    if (levelOf(p, skill) >= level) return
    optimize(
      () => plainLevel(skill, level, why, depth),
      () => [...upgradeCandidates(chainSkills(skill)), ...unlockCandidates(skill, level)],
    )
  }

  function plainLevel(skill: Id, level: number, why: Msg, depth: number) {
    let route = runRoute({ kind: 'level', skill, level }, why)
    // Kein freies Rezept mehr? Dann das nächste freischalten (Kauf, Werkzeug,
    // Level in einem anderen Skill) und weitermachen.
    for (let tries = 0; !route.reached && tries < 3 && depth < 4; tries++) {
      if (!unlockNext(skill, depth)) break
      route = runRoute({ kind: 'level', skill, level }, why)
    }
    if (!route.reached) {
      problem({ key: 'problem.level', params: { skill: skillName(skill), level, reason: route.stopReason ?? { key: 'problem.unreachable' } } })
    }
  }

  function ensureGold(amount: number, why: Msg) {
    if (gold() >= amount) return
    optimize(
      () => plainGold(amount, why),
      () => {
        // Upgrades für die Skills, mit denen die direkte Route Gold verdient
        const direct = trial(() => plainGold(amount, why))
        const skills = new Set<Id>()
        for (const ph of direct.phases) {
          if (ph.kind !== 'route') continue
          for (const seg of ph.route.segments) {
            for (const id of seg.chain.keys()) {
              const s = baseIndex.recipes.get(id)?.skill
              if (s) skills.add(s)
            }
          }
        }
        return upgradeCandidates(skills)
      },
    )
  }

  function plainGold(amount: number, why: Msg) {
    const route = runRoute({ kind: 'gold', amount }, why)
    if (!route.reached) problem({ key: 'problem.gold', params: { reason: route.stopReason ?? { key: 'problem.unreachable' } } })
  }

  // --- Freischalten

  const reqCost = (reqs: Req[]) =>
    reqs.reduce((s, q) => {
      if (q.type === 'level') return s + Math.max(0, xpForLevel(q.level) - xpForLevel(levelOf(p, q.skill)))
      if (q.type === 'purchase') return s + (baseIndex.purchases.get(q.purchase)?.costs.find((c) => c.currency === GP)?.qty ?? 1e6)
      return s + 1000
    }, 0)

  /** Rezepte des Skills, die an Käufen, Werkzeugen oder Materialquellen hängen */
  function blockedRecipes(skill: Id, upTo: number) {
    const unit = unitCosts(idx(), p)
    const out: { name: string; needs: Req[]; cost: number }[] = []
    for (const r of baseIndex.data.recipes) {
      if (r.skill !== skill || r.demoLocked || r.xp <= 0 || r.level > upTo) continue
      const needs = unmetReqs(r.reqs, p).filter((q) => q.type !== 'level' || q.skill !== skill)
      for (const i of r.inputs) {
        if (unit(i.item)) continue
        // billigste Quelle dieses Materials, die noch etwas verlangt
        const options = (baseIndex.producers.get(i.item) ?? [])
          .filter((src) => !src.demoLocked && src.kind !== 'shop')
          .map((src) => unmetReqs(src.reqs, p))
          .filter((u) => u.length > 0)
          .sort((a, b) => reqCost(a) - reqCost(b))
        if (!options.length) {
          needs.push({ type: 'other', text: '' })
          break
        }
        needs.push(...options[0])
      }
      if (!needs.length || needs.some((q) => q.type === 'other')) continue
      out.push({ name: r.name, needs, cost: reqCost(needs) })
    }
    return out.sort((a, b) => a.cost - b.cost)
  }

  function resolveNeeds(needs: Req[], why: Msg, depth: number) {
    for (const q of needs) {
      if (q.type === 'purchase') ensurePurchase(q.purchase, why, depth + 1)
      else if (q.type === 'item') ensureItems([{ item: q.item, qty: 1 }], why, depth + 1)
      else if (q.type === 'level') ensureLevel(q.skill, q.level, why, depth + 1)
    }
  }

  /** Steckt ein Skill fest, das am leichtesten freizuschaltende Rezept frei
   *  machen: eigene Anforderungen (Kauf, Werkzeug) oder die Quelle seines
   *  Materials (z. B. Samen nur per Thieving 35). */
  function unlockNext(skill: Id, depth: number): boolean {
    const best = blockedRecipes(skill, levelOf(p, skill))[0]
    if (!best) return false
    resolveNeeds(best.needs, { key: 'why.unlocks', params: { name: best.name } }, depth)
    return unmetReqs(best.needs, p).length === 0
  }

  function ensurePurchase(id: Id, why: Msg, depth = 0) {
    if (p.owned[id] > 0) return
    const purchase = baseIndex.purchases.get(id)
    if (!purchase) {
      problem({ key: 'problem.unknownPurchase', params: { id } })
      return
    }
    if (purchase.demoLocked) problem({ key: 'problem.locked', params: { name: purchase.name } })
    const own: Msg = { key: 'why.forPurchase', params: { name: purchase.name } }
    for (const q of purchase.reqs) {
      if (q.type === 'level') ensureLevel(q.skill, q.level, own, depth + 1)
      else if (q.type === 'purchase' && depth < 5) ensurePurchase(q.purchase, own, depth + 1)
      else if (q.type === 'item') ensureItems([{ item: q.item, qty: 1 }], own, depth + 1)
      else if (q.type === 'other') notes.add(q.text)
    }
    if (purchase.inputs.length) ensureItems(purchase.inputs, own, depth + 1)
    const price = purchase.costs.find((c) => c.currency === GP)?.qty ?? 0
    ensureGold(price, own)
    p = {
      ...p,
      currencies: { ...p.currencies, [GP]: gold() - price },
      inventory: Object.fromEntries(
        Object.entries(p.inventory).map(([item, n]) => [item, Math.max(0, n - (purchase.inputs.find((i) => i.item === item)?.qty ?? 0))]),
      ),
      owned: { ...p.owned, [id]: (p.owned[id] ?? 0) + 1 },
    }
    phases.push({ kind: 'buy', purchase, why })
  }

  function ensureItems(goals: ItemGoal[], why: Msg, depth = 0) {
    if (depth > 6) return
    if (depth === 0) pickSources(goals, why)
    plainItems(goals, why, depth)
  }

  function plainItems(goals: ItemGoal[], why: Msg, depth: number) {
    // Anforderungen auflösen, bis der Plan ohne Lücken steht (Level-Ups können
    // andere Quellen freischalten, deshalb neu planen)
    for (let i = 0; i < 4; i++) {
      const plan = makePlan(idx(), goals, p, ch)
      let changed = false
      for (const tool of plan.tools) {
        if (goals.some((g) => g.item === tool)) continue
        ensureItems([{ item: tool, qty: 1 }], { key: 'why.tool', params: { name: itemName(tool) } }, depth + 1)
        changed = true
      }
      for (const id of plan.purchases) {
        ensurePurchase(id, why, depth + 1)
        changed = true
      }
      for (const [skill, level] of plan.levels) {
        if (levelOf(p, skill) < level) {
          ensureLevel(skill, level, why, depth)
          changed = true
        }
      }
      const cost = plan.spent.get(GP) ?? 0
      if (gold() < cost) {
        ensureGold(cost, why)
        changed = true
      }
      if (!changed) break
    }

    const plan = makePlan(idx(), goals, p, ch)
    phases.push({ kind: 'craft', plan, goals, why, at: p })
    for (const [item, n] of plan.missing) problem({ key: 'problem.noSource', params: { n, item: itemName(item) } })
    plan.otherReqs.forEach((t) => notes.add(t))

    const inv = { ...p.inventory }
    for (const [item, n] of plan.stockUsed) inv[item] = Math.max(0, (inv[item] ?? 0) - n)
    for (const g of goals) inv[g.item] = (inv[g.item] ?? 0) + g.qty
    const levels = { ...p.levels }
    const xpNow = { ...p.xp }
    const cap = p.levelCap ?? MAX_LEVEL
    for (const [skill, xp] of plan.xp) {
      const before = xpNow[skill] ?? xpForLevel(levels[skill] ?? 1)
      xpNow[skill] = before + xp
      levels[skill] = Math.max(levels[skill] ?? 1, Math.min(cap, levelForXp(before + xp)))
    }
    const currencies = { ...p.currencies }
    for (const [c, n] of plan.spent) currencies[c] = (currencies[c] ?? 0) - n
    p = { ...p, inventory: inv, levels, xp: xpNow, currencies }
  }

  switch (target.kind) {
    case 'items':
      if (target.items.length) ensureItems(target.items, GOAL)
      break
    case 'level':
      ensureLevel(target.skill, target.level, GOAL)
      break
    case 'gold':
      ensureGold(target.amount, GOAL)
      break
    case 'unlock':
      ensurePurchase(target.purchase, GOAL)
      break
  }

  let activeMs = 0
  let passiveMs = 0
  for (const ph of phases) {
    if (ph.kind === 'route') activeMs += ph.route.totalMs
    if (ph.kind === 'craft') {
      activeMs += ph.plan.activeMs
      passiveMs += ph.plan.passiveMs
    }
  }

  return {
    target,
    phases,
    activeMs,
    passiveMs,
    before: profile,
    after: p,
    problems: [...problems.values()],
    notes: [...notes],
    smart,
    choices: ch,
  }
}

/** Gesamtzeit einer Folge von Phasen (aktiv + Wachstum) */
function timeOf(phases: Phase[]): number {
  let ms = 0
  for (const ph of phases) {
    if (ph.kind === 'route') ms += ph.route.totalMs
    else if (ph.kind === 'craft') ms += ph.plan.activeMs + ph.plan.passiveMs
  }
  return ms
}

/** Summe der XP je Skill über alle Phasen */
export function solutionXp(s: Solution): Map<Id, number> {
  const xp = new Map<Id, number>()
  for (const ph of s.phases) {
    const src = ph.kind === 'route' ? ph.route.xp : ph.kind === 'craft' ? ph.plan.xp : null
    if (src) for (const [k, v] of src) add(xp, k, v)
  }
  return xp
}

export function cloneProfile(p: Profile): Profile {
  return {
    ...p,
    levels: { ...p.levels },
    inventory: { ...p.inventory },
    currencies: { ...p.currencies },
    owned: { ...(p.owned ?? {}) },
    xp: p.xp ? { ...p.xp } : undefined,
    equipped: p.equipped ? [...p.equipped] : undefined,
  }
}
