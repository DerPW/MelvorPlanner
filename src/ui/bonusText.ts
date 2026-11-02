import type { GameIndex } from '../core/planner'
import type { Mod } from '../core/types'

type Unit = 'pct' | 'flat' | 'ms'

// Deutsche Beschriftung je Stat; was hier fehlt, zeigt den Namen aus dem Spiel
const LABEL: Record<string, [string, Unit]> = {
  PercentInterval: ['Aktionszeit', 'pct'],
  FlatInterval: ['Aktionszeit', 'ms'],
  DoublingChance: ['Chance auf doppelt', 'pct'],
  PreservationChance: ['Zutaten bewahren', 'pct'],
  FlatProductQuantity: ['Menge je Aktion', 'flat'],
  PercentProductQuantity: ['Menge je Aktion', 'pct'],
  PercentIngredientCost: ['Zutatenbedarf', 'pct'],
  FlatSteps: ['Schritte', 'flat'],
  SkipStepChance: ['Schritt überspringen', 'pct'],
  FlatProficiency: ['Kochkunst', 'flat'],
  FlatDifficulty: ['Schwierigkeit', 'flat'],
  FlatMaxHealth: ['Lebenspunkte des Baums', 'flat'],
  PercentMaxHealth: ['Lebenspunkte des Baums', 'pct'],
  DoubleDamageChance: ['doppelter Schaden', 'pct'],
  InstantCutChance: ['sofort fällen', 'pct'],
  WeakSpotChance: ['Schwachstelle treffen', 'pct'],
  FlatMinimumProspecting: ['Start-Fortschritt', 'pct'],
  PercentIncreaseRockBreakChance: ['Bruchchance', 'pct'],
  AdditionalProductQuantityChance: ['Chance auf +1 Erz', 'pct'],
  ShatterChance: ['Zertrümmern (×3 Erz)', 'pct'],
  FlatMinInterval: ['kürzeste Wurfzeit', 'ms'],
  FlatMaxInterval: ['längste Wurfzeit', 'ms'],
  PercentMinInterval: ['kürzeste Wurfzeit', 'pct'],
  PercentMaxInterval: ['längste Wurfzeit', 'pct'],
  FlatFishChance: ['Fischchance', 'pct'],
  IncreasedFishChance: ['Fischchance', 'pct'],
  IncreasedSpecialProductChance: ['Chance auf Besonderes', 'pct'],
  FlatStealth: ['Schleichen', 'flat'],
  PercentStealth: ['Schleichen', 'pct'],
  FlatPerception: ['Wahrnehmung des Ziels', 'flat'],
  PercentPerception: ['Wahrnehmung des Ziels', 'pct'],
  PercentCommonLootChance: ['Beutechance', 'pct'],
  PercentRareLootChance: ['Chance auf seltene Beute', 'pct'],
  PercentCurrencyLootChance: ['Goldchance', 'pct'],
  PercentCurrencyReward: ['Goldmenge', 'pct'],
  FlatCurrencyReward: ['Goldmenge', 'flat'],
  StunAvoidanceChance: ['Betäubung vermeiden', 'pct'],
  PercentStunInterval: ['Betäubungsdauer', 'pct'],
  FlatStunInterval: ['Betäubungsdauer', 'ms'],
  FlatDiseaseProtection: ['Krankheitsschutz', 'flat'],
  FlatPestProtection: ['Schädlingsschutz', 'flat'],
  PercentXPGained: ['XP', 'pct'],
  FlatXPGained: ['XP je Aktion', 'flat'],
  GlobalPercentActionInterval: ['Aktionszeit aller Skills', 'pct'],
  GlobalFlatActionInterval: ['Aktionszeit aller Skills', 'ms'],
  GlobalPercentXpGained: ['XP aller Skills', 'pct'],
  FlatProductChance: ['Chance auf Nebenprodukt', 'pct'],
  IncreasedProductChance: ['Chance auf Nebenprodukt', 'pct'],
  PercentPreparingInterval: ['Vorbereiten', 'pct'],
  PercentHeatingInterval: ['Erhitzen', 'pct'],
  PercentStirringInterval: ['Rühren', 'pct'],
  PercentBottlingInterval: ['Abfüllen', 'pct'],
}

const pct = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2, signDisplay: 'always' })
const num = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2, signDisplay: 'always' })

export function modValue(mod: Mod, value = mod.value): string {
  const [, unit] = LABEL[mod.stat] ?? ['', mod.stat.startsWith('Percent') || mod.stat.endsWith('Chance') ? 'pct' : 'flat']
  if (unit === 'pct') return `${pct.format(value * 100)} %`
  if (unit === 'ms') return `${num.format(value / 1000)} s`
  return num.format(value)
}

export function modLabel(mod: Mod): string {
  return LABEL[mod.stat]?.[0] ?? mod.stat.replace(/([a-z])([A-Z])/g, '$1 $2')
}

/** „Bergbau · Ore" — wofür der Bonus gilt */
export function modScope(index: GameIndex, mod: Mod): string {
  const parts: string[] = []
  if (mod.entity) parts.push(index.skills.get(mod.entity)?.name ?? mod.entity)
  for (const id of [mod.category, mod.subcategory, mod.location, mod.recipe, mod.recipetype, mod.item]) {
    if (id) parts.push(index.data.names?.[id] ?? id.replace(/^MelvorBase:/, ''))
  }
  return parts.join(' · ') || 'alle Skills'
}
