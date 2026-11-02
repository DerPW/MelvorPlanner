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

/** Wie weit die Messung ist: Aufnahmen derselben Aktion im Fenster und wie
 *  viele es braucht, bis sie 20 s abdecken (bei ~10 s Speichertakt drei) */
export function measureProgress(history: Snapshot[]): { have: number; need: number } | null {
  const last = history.at(-1)
  if (!last) return null
  let first = last
  let have = 1
  for (let i = history.length - 2; i >= 0; i--) {
    const s = history[i]
    if (s.entity !== last.entity || s.action !== last.action || last.at - s.at > WINDOW_MS) break
    first = s
    have++
  }
  // Speichertakt aus den letzten Abständen, sonst 10 s
  const gaps = history
    .slice(-6)
    .map((s, i, a) => (i ? s.at - a[i - 1].at : 0))
    .filter((g) => g > 0 && g < 60_000)
  const step = gaps.length ? Math.min(...gaps) : 10_000
  const missing = Math.max(0, MIN_SPAN_MS - (last.at - first.at))
  return { have, need: have + Math.ceil(missing / step) }
}

/** Der laufende Schritt einer verfolgten Route — gemessen, wo es geht */
export interface LiveStep {
  /** Schritt-Schlüssel (mit Route davor) */
  key: string
  /** Rest beim letzten Spielstand (XP oder Items) und gemessene Rate je ms (0 = noch nicht gemessen) */
  amount: number
  unit: 'xp' | 'items'
  perMs: number
  /** Rest, als der Schritt zuerst lief — für den Fortschritt */
  start: number
  /** geplante Restzeit */
  planMs: number
  /** Zeit des Spielstands */
  at: number
  /** was danach dran ist (null = das Ziel) */
  next: string | null
}

/** Restzeit jetzt: gemessen ab dem Spielstand heruntergezählt, sonst geplant */
export const liveRemaining = (s: LiveStep, now: number) => (s.perMs > 0 ? Math.max(0, s.amount / s.perMs - Math.max(0, now - s.at)) : s.planMs)

/** Rest jetzt (XP bzw. Stück): ab dem Spielstand mit der Rate weitergerechnet */
export const liveAmount = (s: LiveStep, now: number) => Math.max(0, s.amount - s.perMs * Math.max(0, now - s.at))

/** Bestand jetzt: ab dem Spielstand mit der Rate (je Stunde, Verbrauch negativ) weitergerechnet */
export const liveStock = (stock: number, perHour: number, at: number | null, now: number) => Math.max(0, stock + (perHour * Math.max(0, now - (at ?? now))) / 3_600_000)

/** Anteil geschafft (0–1) seit der Schritt zuerst lief */
export function liveProgress(s: LiveStep, now: number): number {
  if (s.start <= 0) return 0
  const left = liveAmount(s, now)
  return Math.min(1, Math.max(0, 1 - left / s.start))
}

/** Was die laufende Aktion bringt und verbraucht, und wann ihr das Material ausgeht */
export interface LiveFlow {
  gains: { item: Id; perHour: number; stock: number }[]
  /** Verbrauch; `emptyMs` = bis der Bestand leer ist, zum Spielstand */
  uses: { item: Id; perHour: number; stock: number; emptyMs: number }[]
  /** Das, was zuerst ausgeht — dann stoppt die Aktion */
  stop: { item: Id; emptyMs: number } | null
}

/** Gewinn und Verbrauch aus den Raten; mit bekanntem Rezept zählen als
 *  Verbrauch nur seine Zutaten (Verkäufe nebenher sind kein Verbrauch) */
export function flowOf(rates: LiveRates, snap: Snapshot, inputs: Id[] | null): LiveFlow {
  const gains: LiveFlow['gains'] = []
  const uses: LiveFlow['uses'] = []
  for (const [item, h] of Object.entries(rates.itemsPerHour)) {
    const stock = snap.bank[item] ?? 0
    if (h > 0) gains.push({ item, perHour: h, stock })
    else if (h < 0 && (!inputs || inputs.includes(item))) uses.push({ item, perHour: -h, stock, emptyMs: (stock / -h) * 3_600_000 })
  }
  gains.sort((a, b) => b.perHour - a.perHour)
  uses.sort((a, b) => a.emptyMs - b.emptyMs)
  return { gains, uses, stop: uses[0] ? { item: uses[0].item, emptyMs: uses[0].emptyMs } : null }
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
