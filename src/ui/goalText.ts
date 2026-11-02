// Ziele von Mastery-Aufgaben und Quests als Text. Die Demo hat dafür keine
// eigenen Texte (nur Platzhalter) — das Spiel baut sie aus der Zielart, wir
// auch: „Fälle 200× Normal Tree“, „Besiege 100 Gegner mit Melee“.

import type { GameIndex } from '../core/planner'
import { STAT_LABELS, STAT_DEFS } from '../core/statDefs'
import type { GameGoal, Id } from '../core/types'
import type { T } from '../i18n'
import { fmtInt } from '../core/format'

const short = (id: string) => id.replace(/^MelvorBase:/, '')
const human = (id: string) => short(id).replace(/([a-z])([A-Z])/g, '$1 $2')

/** Name eines Verweises: Item, Monster, Skill, Rezept oder was die Daten kennen */
export function refName(index: GameIndex, id: Id | undefined): string {
  if (!id) return ''
  return (
    index.items.get(id)?.name ??
    index.data.enemies?.find((e) => e.id === id)?.name ??
    index.skills.get(id)?.name ??
    index.data.names?.[id] ??
    index.data.recipes.find((r) => r.ref === id)?.name ??
    human(id)
  )
}

/** Wohin ein Ziel führt (für Tooltip und Klick) */
export function goalEntity(index: GameIndex, g: GameGoal): string | null {
  const id = (k: string) => (typeof g[k] === 'string' ? (g[k] as string) : undefined)
  const item = id('item')
  if (item && index.items.has(item)) return `item:${item}`
  const enemy = id('enemy')
  if (enemy) return `enemy:${enemy}`
  const recipe = id('recipe')
  const r = recipe ? index.data.recipes.find((x) => x.ref === recipe) : undefined
  if (r?.outputs[0]) return `item:${r.outputs[0].item}`
  return null
}

export function goalText(index: GameIndex, g: GameGoal, t: T, lang: string): string {
  const s = (k: string) => (typeof g[k] === 'string' ? (g[k] as string) : undefined)
  const target = refName(index, s('recipe') ?? s('item') ?? s('enemy') ?? s('subcategory') ?? s('category') ?? s('goalCategory') ?? s('animal') ?? s('location') ?? s('combatEffect') ?? s('effect') ?? s('master'))
  const stat = () => {
    const def = STAT_DEFS[short(s('statistic') ?? '').replace(/Statistic$/, '')] ?? STAT_DEFS[short(s('statistic') ?? '')]
    const label = def ? STAT_LABELS[def[0]] : undefined
    return label ? (lang === 'de' ? label[0] : label[1]).toLowerCase() : human(s('statistic') ?? '')
  }
  const params = {
    n: fmtInt(g.max),
    target,
    value: fmtInt(Number(g.value ?? g.max)),
    level: String(g.level ?? ''),
    skill: refName(index, s('entity')),
    count: fmtInt(Number(g.count ?? g.minimumCount ?? 1)),
    min: fmtInt(Number(g.minDamage ?? 0)),
    stat: '',
    style: refName(index, s('playerCombatStyle')),
    where: refName(index, s('location')),
    who: refName(index, s('targetType')),
    currency: refName(index, s('currency')),
  }
  if (g.type === 'ItemStatistic' || g.type === 'RanchingAnimalStatistic' || g.type === 'SlayerMasterStatistic') params.stat = stat()
  let text: string
  switch (g.type) {
    case 'CombatKillEnemy':
      text = t(s('enemy') ? 'goal.CombatKillEnemy' : params.style ? 'goal.CombatKillAnyStyle' : 'goal.CombatKillAny', params)
      break
    case 'CombatDamageEnemy':
      text = t(s('enemy') ? 'goal.CombatDamageEnemy' : 'goal.CombatDamageAny', params)
      break
    case 'ArtisanCreateRecipe':
    case 'ArtisanCreateRecipeGoalCategory':
      text = t('goal.ArtisanCreateRecipe', params)
      break
    case 'ThievingPickpocketTargetType':
      text = t(params.where ? 'goal.ThievingAt' : 'goal.Thieving', params)
      break
    case 'HuntingTrapAnimal':
      text = t('goal.HuntingTrapAnimal', params) + (g.usingBait ? ` ${t('goal.withBait')}` : '') + (g.withoutFail ? ` ${t('goal.withoutFail')}` : '')
      break
    case 'RanchingSameAnimalCount':
      text = t('goal.RanchingSameAnimalCount', params) + (g.sameEnclosure ? ` ${t('goal.sameEnclosure')}` : '')
      break
    default: {
      const key = `goal.${g.type}`
      text = t(key, params)
      if (text === key) text = `${human(g.type)}${g.max > 1 ? ` ×${params.n}` : ''}${target ? ` — ${target}` : ''}`
    }
  }
  return text
}
