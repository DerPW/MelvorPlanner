// Ein Ziel beliebiger Art → eine Abfolge von Phasen, die von deinem Stand
// dorthin führt: Trainieren, Gold verdienen, Freischaltungen kaufen,
// Herstellen. Jede Phase arbeitet mit dem Stand, den die vorige hinterlässt
// (Level, Gold, Lager, Käufe).

import { levelForXp, xpForLevel } from './experience'
import { add, levelOf, makePlan, unmetReqs, type GameIndex, type Plan, type SourceChoices } from './planner'
import { GP, planRoute, unitCosts, type Route, type RouteOptions } from './route'
import type { Id, ItemGoal, Profile, Purchase, Req } from './types'

export type Target =
  | { kind: 'items'; items: ItemGoal[] }
  | { kind: 'level'; skill: Id; level: number }
  | { kind: 'gold'; amount: number }
  | { kind: 'unlock'; purchase: Id }

export type Phase =
  | { kind: 'route'; route: Route; why: string }
  | { kind: 'buy'; purchase: Purchase; why: string }
  | { kind: 'craft'; plan: Plan; goals: ItemGoal[]; why: string; at: Profile }

export interface Solution {
  target: Target
  phases: Phase[]
  activeMs: number
  passiveMs: number
  before: Profile
  after: Profile
  problems: string[]
  notes: string[]
}

export function solve(index: GameIndex, target: Target, profile: Profile, choices: SourceChoices, options: RouteOptions): Solution {
  let p = cloneProfile(profile)
  const phases: Phase[] = []
  const problems = new Set<string>()
  const notes = new Set<string>()
  const skillName = (id: Id) => index.skills.get(id)?.name ?? id
  const itemName = (id: Id) => index.items.get(id)?.name ?? id
  const gold = () => p.currencies[GP] ?? 0

  function runRoute(goal: Parameters<typeof planRoute>[1], why: string) {
    const route = planRoute(index, goal, p, options)
    if (route.alreadyDone) return route
    if (route.segments.length) phases.push({ kind: 'route', route, why })
    // Was beim Trainieren anfällt, liegt danach im Lager
    const inventory = { ...p.inventory }
    for (const [item, n] of route.produced) inventory[item] = (inventory[item] ?? 0) + Math.floor(n)
    p = { ...route.after, inventory, owned: p.owned }
    return route
  }

  function ensureLevel(skill: Id, level: number, why: string, depth = 0) {
    if (levelOf(p, skill) >= level) return
    let route = runRoute({ kind: 'level', skill, level }, why)
    // Kein freies Rezept mehr? Dann das nächste freischalten (Kauf, Werkzeug,
    // Level in einem anderen Skill) und weitermachen.
    for (let tries = 0; !route.reached && tries < 3 && depth < 4; tries++) {
      if (!unlockNext(skill, depth)) break
      route = runRoute({ kind: 'level', skill, level }, why)
    }
    if (!route.reached) problems.add(`${skillName(skill)} ${level}: ${route.stopReason ?? 'nicht erreichbar'}`)
  }

  /** Steckt ein Skill fest, das am leichtesten freizuschaltende Rezept frei
   *  machen: eigene Anforderungen (Kauf, Werkzeug) oder die Quelle seines
   *  Materials (z. B. Samen nur per Thieving 35). */
  function unlockNext(skill: Id, depth: number): boolean {
    const have = levelOf(p, skill)
    const unit = unitCosts(index, p)
    const cost = (reqs: Req[]) =>
      reqs.reduce((s, q) => {
        if (q.type === 'level') return s + Math.max(0, xpForLevel(q.level) - xpForLevel(levelOf(p, q.skill)))
        if (q.type === 'purchase') return s + (index.purchases.get(q.purchase)?.costs.find((c) => c.currency === GP)?.qty ?? 1e6)
        return s + 1000
      }, 0)

    let best: { name: string; needs: Req[]; cost: number } | null = null
    for (const r of index.data.recipes) {
      if (r.skill !== skill || r.demoLocked || r.xp <= 0 || r.level > have) continue
      const needs = unmetReqs(r.reqs, p)
      for (const i of r.inputs) {
        if (unit(i.item)) continue
        // billigste Quelle dieses Materials, die noch etwas verlangt
        const options = (index.producers.get(i.item) ?? [])
          .filter((src) => !src.demoLocked && src.kind !== 'shop')
          .map((src) => unmetReqs(src.reqs, p))
          .filter((u) => u.length > 0)
          .sort((a, b) => cost(a) - cost(b))
        if (!options.length) {
          needs.push({ type: 'other', text: 'unerreichbar' })
          break
        }
        needs.push(...options[0])
      }
      if (!needs.length || needs.some((q) => q.type === 'other')) continue
      const c = cost(needs)
      if (!best || c < best.cost) best = { name: r.name, needs, cost: c }
    }
    if (!best) return false
    const why = `damit „${best.name}" geht`
    for (const q of best.needs) {
      if (q.type === 'purchase') ensurePurchase(q.purchase, why, depth + 1)
      else if (q.type === 'item') ensureItems([{ item: q.item, qty: 1 }], why, depth + 1)
      else if (q.type === 'level') ensureLevel(q.skill, q.level, why, depth + 1)
    }
    return unmetReqs(best.needs, p).length === 0
  }

  function ensureGold(amount: number, why: string) {
    if (gold() >= amount) return
    const route = runRoute({ kind: 'gold', amount }, why)
    if (!route.reached) problems.add(`Gold: ${route.stopReason ?? 'nicht erreichbar'}`)
  }

  function ensurePurchase(id: Id, why: string, depth = 0) {
    if (p.owned[id] > 0) return
    const purchase = index.purchases.get(id)
    if (!purchase) {
      problems.add(`Unbekannter Kauf ${id}`)
      return
    }
    if (purchase.demoLocked) problems.add(`„${purchase.name}" ist in dieser Version gesperrt`)
    const own = `für „${purchase.name}"`
    for (const q of purchase.reqs) {
      if (q.type === 'level') ensureLevel(q.skill, q.level, own, depth + 1)
      else if (q.type === 'purchase' && depth < 5) ensurePurchase(q.purchase, own, depth + 1)
      else if (q.type === 'item') ensureItems([{ item: q.item, qty: 1 }], own, depth + 1)
      else if (q.type === 'other') notes.add(q.text)
    }
    if (purchase.inputs.length) ensureItems(purchase.inputs, own, depth + 1)
    const price = purchase.costs.find((c) => c.currency === GP)?.qty ?? 0
    ensureGold(price, own)
    p.currencies = { ...p.currencies, [GP]: gold() - price }
    for (const i of purchase.inputs) p.inventory = { ...p.inventory, [i.item]: Math.max(0, (p.inventory[i.item] ?? 0) - i.qty) }
    p.owned = { ...p.owned, [id]: (p.owned[id] ?? 0) + 1 }
    phases.push({ kind: 'buy', purchase, why })
  }

  function ensureItems(goals: ItemGoal[], why: string, depth = 0) {
    if (depth > 6) return
    // Anforderungen auflösen, bis der Plan ohne Lücken steht (Level-Ups können
    // andere Quellen freischalten, deshalb neu planen)
    for (let i = 0; i < 4; i++) {
      const plan = makePlan(index, goals, p, choices)
      let changed = false
      for (const tool of plan.tools) {
        if (goals.some((g) => g.item === tool)) continue
        ensureItems([{ item: tool, qty: 1 }], `Werkzeug ${itemName(tool)}`, depth + 1)
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

    const plan = makePlan(index, goals, p, choices)
    phases.push({ kind: 'craft', plan, goals, why, at: p })
    for (const [item, n] of plan.missing) problems.add(`Keine Quelle für ${n}× ${itemName(item)}`)
    plan.otherReqs.forEach((t) => notes.add(t))

    const inv = { ...p.inventory }
    for (const [item, n] of plan.stockUsed) inv[item] = Math.max(0, (inv[item] ?? 0) - n)
    for (const g of goals) inv[g.item] = (inv[g.item] ?? 0) + g.qty
    const levels = { ...p.levels }
    for (const [skill, xp] of plan.xp) levels[skill] = levelForXp(xpForLevel(levels[skill] ?? 1) + xp)
    const currencies = { ...p.currencies }
    for (const [c, n] of plan.spent) currencies[c] = (currencies[c] ?? 0) - n
    p = { ...p, inventory: inv, levels, currencies }
  }

  switch (target.kind) {
    case 'items':
      if (target.items.length) ensureItems(target.items, 'Ziel')
      break
    case 'level':
      ensureLevel(target.skill, target.level, 'Ziel')
      break
    case 'gold':
      ensureGold(target.amount, 'Ziel')
      break
    case 'unlock':
      ensurePurchase(target.purchase, 'Ziel')
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
    problems: [...problems],
    notes: [...notes],
  }
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
    levels: { ...p.levels },
    inventory: { ...p.inventory },
    currencies: { ...p.currencies },
    owned: { ...(p.owned ?? {}) },
  }
}
