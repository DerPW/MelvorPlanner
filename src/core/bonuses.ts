// Boni einrechnen: welche Quellen aktiv sind (gekauft, ausgerüstet, Gilden-
// Rang) und wie sie ein Rezept verändern. Jedes Rezept wird dafür aus seinen
// Grundwerten (`base`) neu berechnet — mit denselben Formeln wie im Spiel
// (…ActionStats.StatComputer der Demo 0.11.4). Boni werden addiert, globale
// Gruppen fließen in die Werte jedes Skills ein.

import { buildIndex, type GameIndex } from './planner'
import type { BonusSource, Id, Mod, Profile, Recipe } from './types'

export interface ActiveSource {
  source: BonusSource
  /** Shop-Käufe zählen mehrfach, wenn mehrfach gekauft */
  count: number
}

export interface AppliedMod {
  source: BonusSource
  mod: Mod
  value: number
  supported: boolean
}

export interface BonusResult {
  index: GameIndex
  active: ActiveSource[]
  /** Rezept-Id → Boni, die darauf wirken */
  perRecipe: Map<Id, AppliedMod[]>
}

export function activeSources(index: GameIndex, profile: Profile): ActiveSource[] {
  const out: ActiveSource[] = []
  for (const source of index.data.bonusSources ?? []) {
    if (source.kind === 'purchase') {
      const n = profile.owned[source.id] ?? 0
      if (n > 0) out.push({ source, count: n })
    } else if (source.kind === 'item') {
      if (profile.equipped?.includes(source.id)) out.push({ source, count: 1 })
    } else if (source.kind === 'guild' && source.skill && source.rank) {
      const ranks = index.data.guildRanks?.[source.skill] ?? []
      const needed = ranks.findIndex((r) => r.id === source.rank)
      if (needed >= 0 && (profile.guildRanks?.[source.skill] ?? 0) >= needed) out.push({ source, count: 1 })
    }
  }
  return out
}

/** Stat-Klasse des Spiels für ein Rezept */
export function statsClass(r: Recipe): string | null {
  switch (r.kind) {
    case 'artisan':
      return r.skill === 'MelvorBase:Herblore' ? 'HerbloreAction' : 'ArtisanAction'
    case 'cooking':
      return 'CookingAction'
    case 'woodcutting':
      return 'WoodcuttingAction'
    case 'mining':
      return 'MiningAction'
    case 'fishing':
      return 'FishingAction'
    case 'thieving':
      return 'ThievingAction'
    case 'firemaking':
      return 'FiremakingAction'
    case 'farming':
      return 'FarmingAction'
    default:
      return null
  }
}

// Was die Formeln unten auswerten — alles andere wird angezeigt, aber nicht gerechnet
const PRODUCT = ['DoublingChance', 'FlatProductQuantity', 'PercentProductQuantity']
const SUPPORTED: Record<string, string[]> = {
  ArtisanAction: [...PRODUCT, 'PreservationChance', 'PercentIngredientCost', 'FlatInterval', 'PercentInterval', 'FlatSteps', 'SkipStepChance'],
  CookingAction: [...PRODUCT, 'PreservationChance', 'PercentIngredientCost', 'FlatInterval', 'PercentInterval', 'FlatProficiency', 'FlatDifficulty'],
  FiremakingAction: [...PRODUCT, 'PreservationChance', 'PercentIngredientCost', 'FlatInterval', 'PercentInterval', 'FlatProductChance', 'IncreasedProductChance'],
  HerbloreAction: [
    ...PRODUCT, 'PreservationChance', 'PercentIngredientCost',
    'FlatPreparingInterval', 'PercentPreparingInterval', 'FlatHeatingInterval', 'PercentHeatingInterval',
    'FlatStirringInterval', 'PercentStirringInterval', 'FlatBottlingInterval', 'PercentBottlingInterval',
  ],
  WoodcuttingAction: [
    'DoublingChance', 'FlatProductQuantity', 'FlatInterval', 'PercentInterval',
    'FlatMaxHealth', 'PercentMaxHealth', 'DoubleDamageChance', 'InstantCutChance', 'WeakSpotChance',
  ],
  MiningAction: [
    'DoublingChance', 'FlatProductQuantity', 'FlatInterval', 'PercentInterval', 'FlatMinimumProspecting',
    'PercentIncreaseRockBreakChance', 'AdditionalProductQuantityChance', 'ShatterChance',
  ],
  FishingAction: ['DoublingChance', 'FlatMinInterval', 'FlatMaxInterval', 'PercentMinInterval', 'PercentMaxInterval', 'FlatFishChance', 'IncreasedFishChance'],
  ThievingAction: [
    'DoublingChance', 'FlatInterval', 'PercentInterval', 'FlatStealth', 'PercentStealth', 'FlatPerception', 'PercentPerception',
    'PercentCommonLootChance', 'PercentRareLootChance', 'PercentCurrencyLootChance', 'PercentCurrencyReward', 'FlatCurrencyReward',
    'StunAvoidanceChance', 'PercentStunInterval', 'FlatStunInterval',
  ],
  FarmingAction: ['DoublingChance', 'FlatProductQuantity', 'PercentProductQuantity', 'FlatDiseaseProtection', 'FlatPestProtection'],
  Experience: ['FlatXPGained', 'PercentXPGained'],
  Global: ['GlobalPercentActionInterval', 'GlobalFlatActionInterval', 'GlobalPercentXpGained'],
}

function matches(mod: Mod, r: Recipe, cls: string): boolean {
  if (mod.stats === 'Global') return true
  if (mod.stats === 'Experience') return !mod.entity || mod.entity === r.skill
  if (mod.stats !== cls) return false
  if (mod.entity && mod.entity !== r.skill) return false
  if (mod.recipe && mod.recipe !== r.ref) return false
  if (mod.category && mod.category !== r.category) return false
  if (mod.subcategory && mod.subcategory !== r.subcategory) return false
  if (mod.location && mod.location !== r.location) return false
  if (mod.recipetype && mod.recipetype !== r.recipeType) return false
  // Auf ein bestimmtes Item gemünzt: nur, wenn es das Hauptprodukt ist
  if (mod.item && !(PRODUCT.includes(mod.stat) && r.outputs[0]?.item === mod.item)) return false
  return true
}

/** Summen der Boni für ein Rezept; globale Gruppen gehen in die Skill-Werte */
function totalsFor(r: Recipe, active: ActiveSource[], applied: AppliedMod[]): (stat: string) => number {
  const cls = statsClass(r)
  const sums = new Map<string, number>()
  const add = (k: string, v: number) => sums.set(k, (sums.get(k) ?? 0) + v)
  if (!cls) return () => 0
  for (const { source, count } of active) {
    for (const mod of source.mods) {
      if (!matches(mod, r, cls)) continue
      const value = mod.value * count
      const supported = SUPPORTED[mod.stats]?.includes(mod.stat) ?? false
      applied.push({ source, mod, value, supported })
      if (!supported) continue
      if (mod.stats === 'Global') {
        if (mod.stat === 'GlobalPercentXpGained') add('XP:PercentXPGained', value)
        else {
          const percent = mod.stat === 'GlobalPercentActionInterval'
          for (const s of SUPPORTED[cls] ?? []) {
            if (/Interval$/.test(s) && s.startsWith(percent ? 'Percent' : 'Flat') && !/Stun/.test(s)) add(s, value)
          }
        }
      } else if (mod.stats === 'Experience') add(`XP:${mod.stat}`, value)
      else add(mod.stat, value)
    }
  }
  return (stat) => sums.get(stat) ?? 0
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Erwartete Aktionen, bis ein Rezept mit `steps` Schritten fertig ist, wenn
 *  jede Aktion mit Chance `skip` einen Schritt mehr schafft (ArtisanActionComponent) */
function expectedActions(steps: number, skip: number): number {
  const e = [0, 1]
  for (let h = 2; h <= steps; h++) e[h] = 1 + skip * e[h - 2] + (1 - skip) * e[h - 1]
  return e[steps] ?? 1
}

/** Erwartete Schläge, bis ein Baum mit `hp` Lebenspunkten fällt
 *  (WoodcuttingActionComponent: sofort › Schwachstelle › doppelter Schaden) */
function expectedHits(hp: number, instant: number, weak: number, double: number): number {
  const weakDamage = 3 + Math.floor(0.1 * hp)
  const e = [0, 1]
  const at = (h: number) => (h <= 0 ? 0 : e[h])
  for (let h = 2; h <= hp; h++) {
    const normal = double * at(h - 2) + (1 - double) * at(h - 1)
    const weakHit = double * at(h - 2 * weakDamage) + (1 - double) * at(h - weakDamage)
    e[h] = 1 + (1 - instant) * (weak * weakHit + (1 - weak) * normal)
  }
  return at(hp)
}

/** Rezept aus Grundwerten + Boni neu berechnen. Ohne Boni kommt dasselbe
 *  heraus wie im Extraktions-Skript. */
export function deriveRecipe(r: Recipe, t: (stat: string) => number): Recipe {
  const b = r.base
  if (!b) return r
  const doubling = 1 + clamp01(t('DoublingChance'))
  const xp = (r.xp + t('XP:FlatXPGained')) * (1 + t('XP:PercentXPGained'))
  const productQty = (q: number) => Math.max(1, Math.trunc((q + t('FlatProductQuantity')) * (1 + t('PercentProductQuantity'))))
  const ingredients = () => {
    const keep = 1 - clamp01(t('PreservationChance'))
    return r.inputs.map((i) => ({ ...i, qty: Math.max(1, Math.trunc(i.qty * (1 + t('PercentIngredientCost')))) * keep }))
  }

  switch (r.kind) {
    case 'artisan':
    case 'cooking':
    case 'firemaking': {
      let timeMs: number
      if (r.skill === 'MelvorBase:Herblore') {
        const phase = (base: number, name: string) => Math.floor(base * (1 + t(`Percent${name}Interval`)) + t(`Flat${name}Interval`))
        timeMs = phase(b.preparing, 'Preparing') + phase(b.heating, 'Heating') + phase(b.stirring, 'Stirring') + phase(b.bottling, 'Bottling') * 10
      } else {
        const interval = Math.floor(b.interval * (1 + t('PercentInterval')) + t('FlatInterval'))
        const steps = Math.max(1, (b.steps ?? 0) + t('FlatSteps'))
        timeMs = interval * expectedActions(steps, clamp01(t('SkipStepChance')))
      }
      const outputs = r.outputs.map((o) =>
        r.kind === 'firemaking'
          ? { ...o, chance: clamp01((o.chance + t('FlatProductChance')) * (1 + t('IncreasedProductChance'))), qty: (o.qty + t('FlatProductQuantity')) * doubling }
          : { ...o, qty: productQty(o.qty) * doubling },
      )
      const success =
        r.success?.kind === 'cooking'
          ? { ...r.success, difficulty: Math.max(0, r.success.difficulty + t('FlatDifficulty')), proficiency: t('FlatProficiency') }
          : r.success
      return { ...r, timeMs, inputs: ingredients(), outputs, xp, success }
    }
    case 'woodcutting': {
      const interval = Math.floor((b.interval + t('FlatInterval')) * (1 + t('PercentInterval')))
      const hp = Math.max(1, Math.ceil((b.maxHealth + t('FlatMaxHealth')) * (1 + t('PercentMaxHealth'))))
      const hits = expectedHits(hp, clamp01(t('InstantCutChance')), clamp01(t('WeakSpotChance')), clamp01(t('DoubleDamageChance')))
      const outputs = r.outputs.map((o) =>
        o.extra ? (o.perHit ? { ...o, chance: Math.min(1, o.perHit * hits) } : o) : { ...o, qty: (o.qty + t('FlatProductQuantity')) * doubling },
      )
      return { ...r, timeMs: interval * hits, outputs, xp }
    }
    case 'mining': {
      const interval = Math.floor((b.interval + t('FlatInterval')) * (1 + t('PercentInterval')))
      const p = clamp01(b.productChance * (1 + t('PercentIncreaseRockBreakChance')))
      const start = t('FlatMinimumProspecting')
      const n = Math.max(1, Math.ceil((0.9999 - start) / p - 1e-9))
      const hits = p >= 1 ? 1 : (1 - (1 - p) ** n) / p
      const shatter = clamp01(t('ShatterChance'))
      const outputs = r.outputs.map((o) =>
        o.extra
          ? o.perHit
            ? { ...o, chance: Math.min(1, o.perHit * hits) }
            : o
          : { ...o, qty: (o.qty + t('FlatProductQuantity') + clamp01(t('AdditionalProductQuantityChance'))) * doubling * (1 + 2 * shatter) },
      )
      return { ...r, timeMs: interval * hits, outputs, xp: xp * (1 + shatter) }
    }
    case 'fishing': {
      const min = Math.floor((b.minInterval + t('FlatMinInterval')) * (1 + t('PercentMinInterval')))
      const max = Math.max(min, Math.floor((b.maxInterval + t('FlatMaxInterval')) * (1 + t('PercentMaxInterval'))))
      const fish = clamp01((b.fishChance + t('FlatFishChance')) * (1 + t('IncreasedFishChance')))
      const outputs = r.outputs.map((o) => ({ ...o, chance: fish * (o.share ?? 1), qty: o.qty * doubling }))
      return { ...r, timeMs: (min + max) / 2, outputs, xp }
    }
    case 'thieving': {
      const interval = Math.floor((b.interval + t('FlatInterval')) * (1 + t('PercentInterval')))
      const loot = {
        common: clamp01(b.commonChance * (1 + t('PercentCommonLootChance'))),
        rare: clamp01(b.rareChance * (1 + t('PercentRareLootChance'))),
      }
      const outputs = r.outputs.map((o) => ({
        ...o,
        chance: o.table === 'rare' ? loot.rare * (o.share ?? 1) : o.table === 'common' ? loot.common * (o.share ?? 1) : o.chance,
        qty: o.qty * doubling,
      }))
      const currencyOutputs = (r.currencyOutputs ?? []).map((c) => ({
        ...c,
        chance: clamp01(b.currencyChance * (1 + t('PercentCurrencyLootChance'))),
        qty: (c.qty + t('FlatCurrencyReward')) * (1 + t('PercentCurrencyReward')),
      }))
      const success =
        r.success?.kind === 'thieving'
          ? {
              ...r.success,
              perception: Math.max(0, Math.floor((b.perception + t('FlatPerception')) * (1 + t('PercentPerception')))),
              stunMs: Math.floor((2000 + t('FlatStunInterval')) * (1 + t('PercentStunInterval'))),
              stealthFlat: t('FlatStealth'),
              stealthPct: t('PercentStealth'),
              stunAvoid: clamp01(t('StunAvoidanceChance')),
            }
          : r.success
      return { ...r, timeMs: interval, outputs, currencyOutputs, xp, success }
    }
    case 'farming': {
      const adjust = 1 - (Math.max(0, b.pest - t('FlatPestProtection')) + Math.max(0, b.disease - t('FlatDiseaseProtection'))) / 100
      const qty = Math.max(1, Math.trunc((b.productQty + t('FlatProductQuantity')) * (1 + t('PercentProductQuantity')) * adjust))
      const outputs = r.outputs.map((o, i) => (i === 0 ? { ...o, qty: qty * doubling } : o))
      return { ...r, outputs, xp }
    }
    default:
      return r
  }
}

/** Bonus-Summen für ein einzelnes Rezept (wie im Spiel-Panel) */
export function recipeTotals(index: GameIndex, profile: Profile, r: Recipe, enabled: boolean): (stat: string) => number {
  return totalsFor(r, enabled ? activeSources(index, profile) : [], [])
}

/** Ein Wert des Aktions-Panels: Grundwert und mit Boni. `label` ist ein
 *  Wörterbuch-Schlüssel; `core` = immer zeigen (wie im Spiel), sonst nur, wenn ≠ 0 */
export interface StatLine {
  label: string
  unit: 'ms' | 'pct' | 'num'
  base: number
  now: number
  core?: boolean
  /** weniger ist besser (Zeiten, Zutatenbedarf, Wahrnehmung) */
  lower?: boolean
}

/** Die Werte einer Aktion wie im Spiel-Panel: Intervalle, Chancen, Mengen —
 *  mit denselben Formeln wie `deriveRecipe`, je einmal ohne und mit Boni */
export function statLines(r: Recipe, t: (stat: string) => number): StatLine[] {
  const b = r.base
  if (!b) return []
  const zero = () => 0
  const out: StatLine[] = []
  const line = (label: string, unit: StatLine['unit'], f: (t: (stat: string) => number) => number, opt: { core?: boolean; lower?: boolean } = {}) => {
    const base = f(zero)
    const now = f(t)
    if (opt.core || base !== 0 || now !== 0) out.push({ label, unit, base, now, ...opt })
  }
  const pct = (stat: string, core = false) => line(`stat.${stat}`, 'pct', (x) => clamp01(x(stat)), { core })
  const doubling = () => pct('DoublingChance', true)
  const product = () => {
    line('stat.FlatProductQuantity', 'num', (x) => x('FlatProductQuantity'))
    line('stat.PercentProductQuantity', 'pct', (x) => x('PercentProductQuantity'))
  }

  switch (r.kind) {
    case 'artisan':
    case 'cooking':
    case 'firemaking': {
      if (r.skill === 'MelvorBase:Herblore') {
        for (const [key, name] of [['preparing', 'Preparing'], ['heating', 'Heating'], ['stirring', 'Stirring'], ['bottling', 'Bottling']] as const)
          line(`stat.Percent${name}Interval`, 'ms', (x) => Math.floor(b[key] * (1 + x(`Percent${name}Interval`)) + x(`Flat${name}Interval`)), { core: true, lower: true })
      } else {
        line('val.interval', 'ms', (x) => Math.floor(b.interval * (1 + x('PercentInterval')) + x('FlatInterval')), { core: true, lower: true })
        if ((b.steps ?? 0) > 1) line('stat.FlatSteps', 'num', (x) => Math.max(1, b.steps + x('FlatSteps')), { lower: true })
        pct('SkipStepChance')
      }
      pct('PreservationChance', true)
      doubling()
      product()
      line('stat.PercentIngredientCost', 'pct', (x) => x('PercentIngredientCost'), { lower: true })
      // Feuermachen: Chance auf das Nebenprodukt (Asche)
      const extra = r.kind === 'firemaking' ? r.outputs.find((o) => o.chance < 1) : undefined
      if (extra) line('stat.FlatProductChance', 'pct', (x) => clamp01((extra.chance + x('FlatProductChance')) * (1 + x('IncreasedProductChance'))), { core: true })
      if (r.success?.kind === 'cooking') {
        line('stat.FlatProficiency', 'num', (x) => x('FlatProficiency'), { core: true })
        line('stat.FlatDifficulty', 'num', (x) => Math.max(0, (r.success?.kind === 'cooking' ? r.success.difficulty : 0) + x('FlatDifficulty')), { lower: true })
      }
      break
    }
    case 'woodcutting':
      line('val.interval', 'ms', (x) => Math.floor((b.interval + x('FlatInterval')) * (1 + x('PercentInterval'))), { core: true, lower: true })
      line('stat.FlatMaxHealth', 'num', (x) => Math.max(1, Math.ceil((b.maxHealth + x('FlatMaxHealth')) * (1 + x('PercentMaxHealth')))), { core: true, lower: true })
      pct('InstantCutChance', true)
      pct('WeakSpotChance', true)
      pct('DoubleDamageChance', true)
      doubling()
      line('stat.FlatProductQuantity', 'num', (x) => x('FlatProductQuantity'))
      break
    case 'mining':
      line('val.interval', 'ms', (x) => Math.floor((b.interval + x('FlatInterval')) * (1 + x('PercentInterval'))), { core: true, lower: true })
      line('stat.PercentIncreaseRockBreakChance', 'pct', (x) => clamp01(b.productChance * (1 + x('PercentIncreaseRockBreakChance'))), { core: true })
      pct('FlatMinimumProspecting')
      pct('AdditionalProductQuantityChance')
      pct('ShatterChance')
      doubling()
      line('stat.FlatProductQuantity', 'num', (x) => x('FlatProductQuantity'))
      break
    case 'fishing': {
      const min = (x: (stat: string) => number) => Math.floor((b.minInterval + x('FlatMinInterval')) * (1 + x('PercentMinInterval')))
      line('stat.FlatMinInterval', 'ms', min, { core: true, lower: true })
      line('stat.FlatMaxInterval', 'ms', (x) => Math.max(min(x), Math.floor((b.maxInterval + x('FlatMaxInterval')) * (1 + x('PercentMaxInterval')))), { core: true, lower: true })
      line('stat.IncreasedFishChance', 'pct', (x) => clamp01((b.fishChance + x('FlatFishChance')) * (1 + x('IncreasedFishChance'))), { core: true })
      doubling()
      break
    }
    case 'thieving':
      line('val.interval', 'ms', (x) => Math.floor((b.interval + x('FlatInterval')) * (1 + x('PercentInterval'))), { core: true, lower: true })
      line('stat.FlatPerception', 'num', (x) => Math.max(0, Math.floor((b.perception + x('FlatPerception')) * (1 + x('PercentPerception')))), { core: true, lower: true })
      line('stat.FlatStealth', 'num', (x) => x('FlatStealth'))
      pct('PercentStealth')
      line('stat.FlatStunInterval', 'ms', (x) => Math.floor((2000 + x('FlatStunInterval')) * (1 + x('PercentStunInterval'))), { core: true, lower: true })
      pct('StunAvoidanceChance', true)
      line('stat.PercentCommonLootChance', 'pct', (x) => clamp01(b.commonChance * (1 + x('PercentCommonLootChance'))), { core: true })
      line('stat.PercentRareLootChance', 'pct', (x) => clamp01(b.rareChance * (1 + x('PercentRareLootChance'))), { core: true })
      line('stat.PercentCurrencyLootChance', 'pct', (x) => clamp01(b.currencyChance * (1 + x('PercentCurrencyLootChance'))))
      line('stat.PercentCurrencyReward', 'pct', (x) => x('PercentCurrencyReward'))
      line('stat.FlatCurrencyReward', 'num', (x) => x('FlatCurrencyReward'))
      doubling()
      break
    case 'farming':
      doubling()
      product()
      line('stat.FlatDiseaseProtection', 'num', (x) => x('FlatDiseaseProtection'))
      line('stat.FlatPestProtection', 'num', (x) => x('FlatPestProtection'))
      break
    default:
      return []
  }
  line('val.xpBonus', 'pct', (x) => x('XP:PercentXPGained'))
  line('stat.FlatXPGained', 'num', (x) => x('XP:FlatXPGained'))
  return out
}

/** Index mit allen Rezepten neu berechnet — Planer, Routen und Ansichten
 *  arbeiten damit, ohne von Boni zu wissen */
export function applyBonuses(index: GameIndex, profile: Profile, enabled: boolean): BonusResult {
  const active = enabled ? activeSources(index, profile) : []
  const perRecipe = new Map<Id, AppliedMod[]>()
  if (!active.length) return { index, active, perRecipe }
  const recipes = index.data.recipes.map((r) => {
    const applied: AppliedMod[] = []
    const t = totalsFor(r, active, applied)
    if (!applied.length) return r
    perRecipe.set(r.id, applied)
    return deriveRecipe(r, t)
  })
  return { index: buildIndex({ ...index.data, recipes }), active, perRecipe }
}
