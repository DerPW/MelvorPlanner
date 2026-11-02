// Werkzeuggürtel optimal belegen: je Platz eines Skills das Item, mit dem eine
// Aktion am meisten bringt — XP/h, Menge/h oder GP/h. Gerechnet mit denselben
// Formeln wie die Boni (recipeTotals + deriveRecipe), nur für die eine Aktion;
// ein Skill hat wenige Plätze mit wenigen Kandidaten, also werden alle
// Kombinationen probiert.

import { deriveRecipe, recipeTotals } from './bonuses'
import { actionTime, successChance, unmetReqs, yieldOf, type GameIndex } from './planner'
import { GP } from './route'
import type { BonusSource, Id, Profile, Recipe } from './types'

export type SkillMetric = 'xp' | 'items' | 'gold'
export type SkillScope = 'owned' | 'wearable' | 'all'

export interface SlotChoice {
  slot: Id
  current: BonusSource | null
  best: BonusSource | null
  /** Kandidaten für den Platz (vor dem Filter) */
  candidates: BonusSource[]
}

export interface SkillGearResult {
  now: number
  best: number
  slots: SlotChoice[]
}

const short = (id: string) => id.replace(/^MelvorBase:/, '')

/** Gürtel-Plätze eines Skills (FishingTool, FishingGloves …), soweit es Items dafür gibt */
export function skillSlots(index: GameIndex, skill: Id): Id[] {
  const name = short(skill)
  const slots = new Set<Id>()
  for (const b of index.data.bonusSources) if (b.kind === 'item' && b.slot && short(b.slot).startsWith(name)) slots.add(b.slot)
  return [...slots]
}

/** Was die Aktion mit dieser Gürtel-Belegung je Stunde bringt */
export function skillRate(index: GameIndex, profile: Profile, base: Recipe, equipped: Id[], metric: SkillMetric): number {
  const p = { ...profile, equipped }
  const r = deriveRecipe(base, recipeTotals(index, p, base, true))
  const ms = actionTime(r, p)
  if (ms <= 0) return 0
  const sc = successChance(r, p)
  const h = 3_600_000 / ms
  if (metric === 'xp') return r.xp * sc * h
  if (metric === 'items') {
    const main = base.outputs.find((o) => !o.extra)?.item
    return main ? yieldOf(r, main, p) * h : 0
  }
  let value = 0
  for (const o of r.outputs) {
    const sells = index.items.get(o.item)?.sells
    if (sells?.currency === GP) value += sells.qty * o.qty * o.chance * sc
  }
  for (const c of r.currencyOutputs ?? []) if (c.currency === GP) value += c.qty * c.chance * sc
  for (const c of r.costs) if (c.currency === GP) value -= c.qty
  return value * h
}

export function optimizeSkillGear(index: GameIndex, profile: Profile, skill: Id, recipe: Recipe, metric: SkillMetric, scope: SkillScope): SkillGearResult {
  const slots = skillSlots(index, skill)
  const sources = index.data.bonusSources.filter((b) => b.kind === 'item' && b.slot && slots.includes(b.slot))
  const equipped = profile.equipped ?? []
  const owned = (b: BonusSource) => (profile.inventory[b.id] ?? 0) > 0 || equipped.includes(b.id)
  const wearable = (b: BonusSource) => unmetReqs(b.reqs ?? [], profile).length === 0
  const allowed = (b: BonusSource) => (scope === 'all' ? true : scope === 'wearable' ? wearable(b) : owned(b) && wearable(b))
  // Was sonst im Gürtel steckt (andere Skills), bleibt
  const others = equipped.filter((id) => !sources.some((s) => s.id === id))
  const current = slots.map((slot) => sources.find((b) => b.slot === slot && equipped.includes(b.id)) ?? null)
  // Je Platz: erst das Angelegte (gleich gut → bleibt), dann leer, dann der Rest
  const options = slots.map((slot, i) => {
    const list: (BonusSource | null)[] = []
    if (current[i]) list.push(current[i])
    list.push(null)
    for (const b of sources) if (b.slot === slot && b !== current[i] && allowed(b)) list.push(b)
    return list
  })
  let best: (BonusSource | null)[] = current
  let bestRate = -Infinity
  const chosen: (BonusSource | null)[] = []
  const walk = (i: number) => {
    if (i === options.length) {
      const v = skillRate(index, profile, recipe, [...others, ...chosen.filter((b): b is BonusSource => !!b).map((b) => b.id)], metric)
      if (v > bestRate + 1e-9) {
        bestRate = v
        best = [...chosen]
      }
      return
    }
    for (const o of options[i]) {
      chosen[i] = o
      walk(i + 1)
    }
  }
  walk(0)
  return {
    now: skillRate(index, profile, recipe, equipped, metric),
    best: Math.max(bestRate, 0),
    slots: slots.map((slot, i) => ({ slot, current: current[i], best: best[i] ?? null, candidates: sources.filter((b) => b.slot === slot) })),
  }
}
