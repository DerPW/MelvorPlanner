import { fmtInt } from '../core/format'
import type { GameIndex } from '../core/planner'
import { GP } from '../core/route'
import type { Target } from '../core/solve'
import type { Profile } from '../core/types'
import { newId, type RouteTarget } from './state'

export function routeLabel(index: GameIndex, r: RouteTarget): string {
  if (r.kind === 'item') return index.items.get(r.item)?.name ?? r.item
  if (r.kind === 'level') return `${index.skills.get(r.skill)?.name ?? r.skill} → ${r.level}`
  if (r.kind === 'gold') return `${fmtInt(r.amount)} GP`
  return index.purchases.get(r.purchase)?.name ?? r.purchase
}

export function routeIcon(index: GameIndex, r: RouteTarget): string | null {
  if (r.kind === 'item') return index.items.get(r.item)?.icon ?? null
  if (r.kind === 'level') return index.skills.get(r.skill)?.icon ?? null
  if (r.kind === 'gold') return index.currencies.get(GP)?.icon ?? null
  return index.purchases.get(r.purchase)?.icon ?? null
}

/** Das Ziel als Entität — für Tooltip, Kontextmenü und Klick */
export function routeEntity(r: RouteTarget): string | null {
  if (r.kind === 'item') return `item:${r.item}`
  if (r.kind === 'level') return `skill:${r.skill}`
  if (r.kind === 'unlock') return `purchase:${r.purchase}`
  return null
}

/** Was das Solver-Ziel ist */
export function routeTarget(r: RouteTarget): Target {
  if (r.kind === 'item') return { kind: 'items', items: [{ item: r.item, qty: r.qty }] }
  const { id: _id, avoid: _a, avoidHistory: _h, ...rest } = r
  return rest
}

/** Eine neue Route mit vernünftigem Startwert: Level +10, 10.000 GP, die erste offene Freischaltung */
export function newRoute(index: GameIndex, profile: Profile, kind: 'level' | 'gold' | 'unlock'): RouteTarget | null {
  if (kind === 'level') {
    const skill = index.data.skills.find((s) => s.id === 'MelvorBase:Woodcutting') ?? index.data.skills[0]
    return { id: newId(), kind, skill: skill.id, level: Math.min(profile.levelCap ?? 120, (profile.levels[skill.id] ?? 1) + 10) }
  }
  if (kind === 'gold') return { id: newId(), kind, amount: 10000 }
  const p = index.data.purchases.find((x) => !x.items.length && !x.demoLocked && !(profile.owned[x.id] > 0))
  return p ? { id: newId(), kind, purchase: p.id } : null
}
