import type { GameIndex } from '../core/planner'
import type { Mod } from '../core/types'
import type { T } from '../i18n'

type Unit = 'pct' | 'flat' | 'ms'

// Einheit je Stat; die Beschriftung steht in den Wörterbüchern unter stat.<Name>
const UNIT: Record<string, Unit> = {
  FlatInterval: 'ms',
  FlatMinInterval: 'ms',
  FlatMaxInterval: 'ms',
  FlatStunInterval: 'ms',
  GlobalFlatActionInterval: 'ms',
  FlatProductQuantity: 'flat',
  FlatSteps: 'flat',
  FlatProficiency: 'flat',
  FlatDifficulty: 'flat',
  FlatMaxHealth: 'flat',
  FlatStealth: 'flat',
  FlatPerception: 'flat',
  FlatCurrencyReward: 'flat',
  FlatDiseaseProtection: 'flat',
  FlatPestProtection: 'flat',
  FlatXPGained: 'flat',
}

const fmt = (locale: string) => ({
  pct: new Intl.NumberFormat(locale, { maximumFractionDigits: 2, signDisplay: 'always' }),
  num: new Intl.NumberFormat(locale, { maximumFractionDigits: 2, signDisplay: 'always' }),
})

export function modValue(mod: Mod, value = mod.value, locale = document.documentElement.lang === 'en' ? 'en-US' : 'de-DE'): string {
  const unit = UNIT[mod.stat] ?? 'pct'
  const f = fmt(locale)
  if (unit === 'pct') return `${f.pct.format(value * 100)} %`
  if (unit === 'ms') return `${f.num.format(value / 1000)} s`
  return f.num.format(value)
}

export function modLabel(mod: Mod, t: T): string {
  const label = t(`stat.${mod.stat}`)
  // Unbekannt → Name aus dem Spiel, lesbar getrennt
  return label === `stat.${mod.stat}` ? mod.stat.replace(/([a-z])([A-Z])/g, '$1 $2') : label
}

/** „Mining · Ore Vein" — wofür der Bonus gilt */
export function modScope(index: GameIndex, mod: Mod, t: T): string {
  const parts: string[] = []
  if (mod.entity) parts.push(index.skills.get(mod.entity)?.name ?? mod.entity)
  for (const id of [mod.category, mod.subcategory, mod.location, mod.recipe, mod.recipetype, mod.item]) {
    if (id) parts.push(index.data.names?.[id] ?? id.replace(/^MelvorBase:/, ''))
  }
  return parts.join(' · ') || t('bonus.allSkills')
}
