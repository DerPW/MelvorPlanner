import { fmtInt } from '../core/format'
import type { GameIndex } from '../core/planner'
import { GP } from '../core/route'
import type { RouteTarget } from './state'

export function routeLabel(index: GameIndex, r: RouteTarget): string {
  if (r.kind === 'level') return `${index.skills.get(r.skill)?.name ?? r.skill} → ${r.level}`
  if (r.kind === 'gold') return `${fmtInt(r.amount)} GP`
  return index.purchases.get(r.purchase)?.name ?? r.purchase
}

export function routeIcon(index: GameIndex, r: RouteTarget): string | null {
  if (r.kind === 'level') return index.skills.get(r.skill)?.icon ?? null
  if (r.kind === 'gold') return index.currencies.get(GP)?.icon ?? null
  return index.purchases.get(r.purchase)?.icon ?? null
}
