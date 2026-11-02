// Ausrüstung bewerten: Kennzahlen eines Kampfs, ein Teil einsetzen, die beste
// Kombination gegen ein Monster suchen (src/ui/GearTools.tsx zeigt sie an).

import { enemyAreas, HITPOINTS, perHour, playerFighter, simulate, type FightResult } from './combat'
import { unmetReqs, type GameIndex } from './planner'
import type { CombatLoadout, Enemy, Id, Item, Profile } from './types'

export type Metric = 'xp' | 'time' | 'gold' | 'damage'

/** Kampf-XP je Stunde ohne Hitpoints */
export const xpRate = (f: FightResult) => Object.entries(perHour(f).xp).reduce((s, [k, v]) => (k === HITPOINTS ? s : s + v), 0)

export function metricOf(f: FightResult, m: Metric): number {
  if (!f.canAttack) return m === 'time' || m === 'damage' ? Infinity : 0
  const h = perHour(f)
  if (m === 'xp') return xpRate(f)
  if (m === 'gold') return h.gold + h.loot
  if (m === 'time') return f.killMs
  return h.damage
}
/** Höher ist besser? */
export const better = (m: Metric) => (m === 'xp' || m === 'gold' ? 1 : -1)

/** Platz, in den ein Teil gehört (Ring → erster Ring-Platz) */
export const slotFor = (index: GameIndex, item: Item) => index.data.combat.slots.find((s) => s.fits === item.equipment?.type)?.id ?? null

/** Teil einsetzen; bei Waffen die beste Haltung für die Kennzahl */
export function withItem(index: GameIndex, profile: Profile, loadout: CombatLoadout, item: Item, enemy: Enemy, metric: Metric) {
  const darkness = enemyAreas(index, enemy.id).darkness
  const slot = slotFor(index, item)
  const gear = { ...loadout.gear }
  if (slot) gear[slot] = item.id
  const run = (lo: CombatLoadout) => simulate(index, playerFighter(index, profile, lo, darkness), enemy)
  let f = run({ ...loadout, gear })
  if (item.weapon)
    for (const st of index.data.combat.weaponTypes[item.weapon.type] ?? []) {
      const g = run({ ...loadout, gear, stances: { ...loadout.stances, [item.weapon.type]: st } })
      if (better(metric) * (metricOf(g, metric) - metricOf(f, metric)) > 0) f = g
    }
  return f
}

export type Scope = 'owned' | 'wearable' | 'all'

export interface Pick {
  slot: string
  item: Item | null
  owned: boolean
  wearable: boolean
  /** bestes Teil aus dem Lager für diesen Platz, falls das gewählte fehlt */
  alternative: Item | null
}

export interface Optimum {
  loadout: CombatLoadout
  f: FightResult
  value: number
  picks: Pick[]
}

/** Beste Kombination: erst die besten Waffen (je mit bester Haltung), dann
 *  für jede die übrigen Plätze nacheinander (zwei Durchgänge) — gierig, aber
 *  die Werte addieren sich fast unabhängig, das trifft das Optimum meist. */
export function optimize(index: GameIndex, profile: Profile, loadout: CombatLoadout, enemy: Enemy, metric: Metric, scope: Scope): Optimum | null {
  const darkness = enemyAreas(index, enemy.id).darkness
  const dir = better(metric)
  const equipped = new Set(Object.values(loadout.gear))
  const owned = (i: Item) => (profile.inventory[i.id] ?? 0) > 0 || equipped.has(i.id)
  const wearable = (i: Item) => unmetReqs(i.equipment?.reqs ?? [], profile).length === 0
  const allowed = (i: Item) => (scope === 'all' ? true : scope === 'wearable' ? wearable(i) : owned(i) && wearable(i))
  const slots = index.data.combat.slots
  const pool = (fits: string) => index.data.items.filter((i) => i.equipment?.type === fits && i.id !== 'MelvorBase:DefaultWeapon' && allowed(i))
  // Zweites Kriterium: weniger erlittener Schaden — sonst bliebe Rüstung bei XP/h oder GP/h weg
  const run = (lo: CombatLoadout) => {
    const f = simulate(index, playerFighter(index, profile, lo, darkness), enemy)
    const v = f.danger === 'deadly' ? (dir > 0 ? 0 : Infinity) : metricOf(f, metric)
    return { f, v, d: metric === 'damage' ? f.killMs : perHour(f).damage }
  }
  const same = (x: number, y: number) => x === y || Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(y))
  const beats = (x: number, y: number) => (dir > 0 ? x > y + 1e-9 : x < y - 1e-9)
  const beatsBoth = (r: { v: number; d: number }, cur: { v: number; d: number }) => beats(r.v, cur.v) || (same(r.v, cur.v) && r.d < cur.d - 1e-9)

  // Ausgang: was erlaubt ist von der jetzigen Ausrüstung
  const start: Record<string, Id> = {}
  for (const [s, id] of Object.entries(loadout.gear)) {
    const it = index.items.get(id)
    if (it && allowed(it)) start[s] = id
  }

  // 1. Waffen vorsortieren (mit jetziger übriger Ausrüstung)
  const weapons: { gear: Record<string, Id>; stances: Record<string, string>; v: number }[] = []
  for (const w of [null, ...pool('Weapon')]) {
    const gear = { ...start }
    if (w) gear.Weapon = w.id
    else delete gear.Weapon
    const type = w?.weapon?.type ?? 'Melee'
    let bestS = { stances: loadout.stances, v: dir > 0 ? -Infinity : Infinity }
    for (const st of index.data.combat.weaponTypes[type] ?? []) {
      const stances = { ...loadout.stances, [type]: st }
      const { v } = run({ ...loadout, gear, stances })
      if (beats(v, bestS.v)) bestS = { stances, v }
    }
    weapons.push({ gear, stances: bestS.stances, v: bestS.v })
  }
  weapons.sort((x, y) => dir * (y.v - x.v))

  // 2. Für die besten Waffen die übrigen Plätze
  let best: { gear: Record<string, Id>; stances: Record<string, string>; v: number; d: number } | null = null
  for (const w of weapons.slice(0, 4)) {
    const gear = { ...w.gear }
    const weapon = gear.Weapon ? index.items.get(gear.Weapon) : null
    const blocked = new Set(weapon?.equipment?.occupies ?? [])
    for (const b of blocked) delete gear[b]
    let cur = run({ ...loadout, gear, stances: w.stances })
    for (let pass = 0; pass < 2; pass++) {
      for (const slot of slots) {
        if (slot.id === 'Weapon' || blocked.has(slot.id)) continue
        let candidates = pool(slot.fits)
        // Munition nur passend zur Waffe
        if (slot.id === 'Ammo') candidates = weapon?.weapon?.ammo ? candidates.filter((c) => c.equipment?.ammoType === weapon.weapon!.ammo) : []
        for (const c of [null, ...candidates]) {
          if ((gear[slot.id] ?? null) === (c?.id ?? null)) continue
          const trial = { ...gear }
          if (c) trial[slot.id] = c.id
          else delete trial[slot.id]
          const r = run({ ...loadout, gear: trial, stances: w.stances })
          if (beatsBoth(r, cur)) {
            cur = r
            if (c) gear[slot.id] = c.id
            else delete gear[slot.id]
          }
        }
      }
    }
    if (!best || beatsBoth(cur, best)) best = { gear, stances: w.stances, v: cur.v, d: cur.d }
  }
  if (!best) return null
  const result: CombatLoadout = { ...loadout, gear: best.gear, stances: best.stances }
  const f = run(result).f

  // Alternativen: fehlt ein gewähltes Teil, das beste aus dem Lager für den Platz
  const picks: Pick[] = slots.map((slot) => {
    const item = best!.gear[slot.id] ? (index.items.get(best!.gear[slot.id]) ?? null) : null
    let alternative: Item | null = null
    if (item && !(owned(item) && wearable(item))) {
      let alt = { v: dir > 0 ? -Infinity : Infinity, d: Infinity }
      for (const c of index.data.items.filter((i) => i.equipment?.type === slot.fits && owned(i) && wearable(i))) {
        const r = run({ ...result, gear: { ...best!.gear, [slot.id]: c.id } })
        if (beatsBoth(r, alt)) {
          alt = r
          alternative = c
        }
      }
    }
    return { slot: slot.id, item, owned: item ? owned(item) : true, wearable: item ? wearable(item) : true, alternative }
  })
  return { loadout: result, f, value: best.v, picks }
}

