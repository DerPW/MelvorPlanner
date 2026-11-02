// Live-Messung: Das Spiel speichert alle ~10 s. Aus aufeinanderfolgenden
// Spielständen ergibt sich, was gerade läuft (Kopf: Skill und Aktion als
// Anzeigename) und wie schnell es wirklich geht (XP, Items, Gold je Stunde).

import type { GameIndex } from './planner'
import { GP } from './route'
import type { Enemy, Id, Recipe, Skill } from './types'

export interface Snapshot {
  at: number
  entity: string
  action: string
  xp: Record<Id, number>
  bank: Record<Id, number>
  gold: number
}

export interface LiveRates {
  /** Seit wann dieselbe Aktion läuft (erste Aufnahme im Fenster) */
  since: number
  spanMs: number
  xpPerHour: Record<Id, number>
  /** Netto-Änderung im Lager je Stunde (Verbrauch negativ) */
  itemsPerHour: Record<Id, number>
  goldPerHour: number
}

/** Höchstens so weit zurück wird gemessen */
const WINDOW_MS = 10 * 60_000
/** Kürzer gemessen ist zu ungenau */
const MIN_SPAN_MS = 20_000

/** Raten der laufenden Aktion: von der ersten Aufnahme mit derselben Aktion
 *  (höchstens 10 min zurück) bis zur letzten */
export function measure(history: Snapshot[]): LiveRates | null {
  const last = history.at(-1)
  if (!last) return null
  let first = last
  for (let i = history.length - 2; i >= 0; i--) {
    const s = history[i]
    if (s.entity !== last.entity || s.action !== last.action || last.at - s.at > WINDOW_MS) break
    first = s
  }
  const span = last.at - first.at
  if (span < MIN_SPAN_MS) return null
  const h = 3_600_000 / span
  const xpPerHour: Record<Id, number> = {}
  for (const [k, v] of Object.entries(last.xp)) {
    const d = v - (first.xp[k] ?? v)
    if (d > 0) xpPerHour[k] = d * h
  }
  const itemsPerHour: Record<Id, number> = {}
  for (const k of new Set([...Object.keys(last.bank), ...Object.keys(first.bank)])) {
    const d = (last.bank[k] ?? 0) - (first.bank[k] ?? 0)
    if (d !== 0) itemsPerHour[k] = d * h
  }
  return { since: first.at, spanMs: span, xpPerHour, itemsPerHour, goldPerHour: (last.gold - first.gold) * h }
}

export interface LiveAction {
  skill: Skill | null
  /** Rezept der Aktion, wenn eindeutig zuzuordnen */
  recipe: Recipe | null
  enemy: Enemy | null
  entity: string
  action: string
}

/** Kopf-Namen („Fishing", „Shallow Pools") → Skill, Rezept bzw. Monster */
export function resolveAction(index: GameIndex, snap: Snapshot): LiveAction {
  const skill = index.data.skills.find((s) => s.name === snap.entity) ?? null
  const name = snap.action
  let recipe: Recipe | null = null
  let enemy: Enemy | null = null
  if (snap.entity === 'Combat' || !skill) {
    enemy = (index.data.enemies ?? []).find((e) => e.name === name) ?? null
    // Kampf-Rezept des Monsters — das mit Beute (die gewählte Haltung)
    if (enemy) recipe = index.data.recipes.find((r) => r.combat?.enemy === enemy!.id && r.outputs.length > 0) ?? index.data.recipes.find((r) => r.combat?.enemy === enemy!.id) ?? null
  } else if (name) {
    const own = index.data.recipes.filter((r) => r.skill === skill.id && !r.demoLocked)
    recipe =
      own.find((r) => r.name === name) ??
      // Angeln: „Shallow Pools (Shallow Shores)"
      own.find((r) => r.name.startsWith(`${name} (`)) ??
      own.find((r) => r.outputs.some((o) => index.items.get(o.item)?.name === name)) ??
      null
  }
  return { skill, recipe, enemy, entity: snap.entity, action: name }
}

/** Momentaufnahme aus einem gelesenen Spielstand */
export function snapshotOf(data: { savedAt: Date | null; activeEntity: string; activeAction: string; xp: Record<Id, number>; bank: Record<Id, number>; currencies: Record<Id, number> }): Snapshot {
  return {
    at: data.savedAt?.getTime() ?? Date.now(),
    entity: data.activeEntity,
    action: data.activeAction,
    xp: { ...data.xp },
    bank: { ...data.bank },
    gold: data.currencies[GP] ?? 0,
  }
}
