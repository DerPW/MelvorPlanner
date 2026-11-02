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

/** Aus dem Lager, mit jetzigen Leveln tragbar, alles — oder alles bis zu einem Level */
export type Scope = 'owned' | 'wearable' | 'all' | { cap: number }

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
  /** Level, die das Set verlangt und die noch fehlen */
  levels: { skill: Id; level: number }[]
}

/** Level-Anforderungen eines Teils */
const levelReqs = (i: Item) => (i.equipment?.reqs ?? []).flatMap((q) => (q.type === 'level' ? [{ skill: q.skill, level: q.level }] : []))
const levelOfReqs = (i: Item) => Math.max(1, ...levelReqs(i).map((l) => l.level))

/** Beste Kombination: erst die besten Waffen (je mit bester Haltung), dann
 *  für jede die übrigen Plätze nacheinander (zwei Durchgänge) — gierig, aber
 *  die Werte addieren sich fast unabhängig, das trifft das Optimum meist. */
export function optimize(index: GameIndex, profile: Profile, loadout: CombatLoadout, enemy: Enemy, metric: Metric, scope: Scope): Optimum | null {
  const darkness = enemyAreas(index, enemy.id).darkness
  const dir = better(metric)
  const equipped = new Set(Object.values(loadout.gear))
  const owned = (i: Item) => (profile.inventory[i.id] ?? 0) > 0 || equipped.has(i.id)
  const wearable = (i: Item) => unmetReqs(i.equipment?.reqs ?? [], profile).length === 0
  // Mit Level-Grenze: Level-Anforderungen bis dahin, alles andere muss schon erfüllt sein
  const cap = typeof scope === 'object' ? scope.cap : null
  const withinCap = (i: Item) => levelOfReqs(i) <= cap! && unmetReqs((i.equipment?.reqs ?? []).filter((q) => q.type !== 'level'), profile).length === 0
  const allowed = (i: Item) => (cap !== null ? withinCap(i) : scope === 'all' ? true : scope === 'wearable' ? wearable(i) : owned(i) && wearable(i))
  // Eine Stufe „bis Lv n" heißt: du hast dann auch die Level — fürs Auswählen angehoben
  const levelsAt = (base: Profile, raise: { skill: Id; level: number }[]): Profile => {
    const levels = { ...base.levels }
    for (const r of raise) levels[r.skill] = Math.max(levels[r.skill] ?? 1, r.level)
    return { ...base, levels }
  }
  const gating = [...new Set(index.data.items.flatMap((i) => (i.equipment ? levelReqs(i).map((l) => l.skill) : [])))]
  const chooser = cap !== null ? levelsAt(profile, gating.map((skill) => ({ skill, level: cap }))) : profile
  const slots = index.data.combat.slots
  const pool = (fits: string) => index.data.items.filter((i) => i.equipment?.type === fits && i.id !== 'MelvorBase:DefaultWeapon' && allowed(i))
  // Zweites Kriterium: weniger erlittener Schaden — sonst bliebe Rüstung bei XP/h oder GP/h weg
  const run = (lo: CombatLoadout, prof: Profile = chooser) => {
    const f = simulate(index, playerFighter(index, prof, lo, darkness), enemy)
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
  // Gerechnet mit genau den Leveln, die das Set verlangt (nicht mehr)
  const needed = new Map<Id, number>()
  for (const id of Object.values(best.gear)) {
    const it = index.items.get(id)
    if (it) for (const l of levelReqs(it)) needed.set(l.skill, Math.max(needed.get(l.skill) ?? 0, l.level))
  }
  const levels = [...needed].filter(([s, l]) => (profile.levels[s] ?? 1) < l).map(([skill, level]) => ({ skill, level }))
  const finalProfile = levelsAt(profile, levels)
  const final = run(result, finalProfile)
  const f = final.f

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
  return { loadout: result, f, value: final.v, picks, levels }
}

export interface Tier {
  key: string
  kind: 'owned' | 'wearable' | 'level'
  cap?: number
  result: Optimum
}

/** Stufenleiter: aus dem Lager, jetzt tragbar, dann je Level-Grenze bis zur
 *  Grenze der Version — nur Stufen, die etwas ändern und besser sind */
export function gearTiers(index: GameIndex, profile: Profile, loadout: CombatLoadout, enemy: Enemy, metric: Metric): Tier[] {
  const dir = better(metric)
  const top = profile.levelCap ?? 99
  const reqLevels = new Set(index.data.items.filter((i) => i.equipment).map(levelOfReqs))
  const caps = [10, 20, 30, 40, 50, 60, 70, 80, 90, 99, 120].filter((c) => c <= top && [...reqLevels].some((l) => l > c - 10 && l <= c))
  if (!caps.includes(top) && [...reqLevels].some((l) => l <= top && l > (caps.at(-1) ?? 0))) caps.push(top)
  const out: Tier[] = []
  const add = (key: string, kind: Tier['kind'], scope: Scope, cap?: number) => {
    const result = optimize(index, profile, loadout, enemy, metric, scope)
    if (!result) return
    const prev = out.at(-1)?.result
    const sameGear = prev && JSON.stringify(prev.loadout.gear) === JSON.stringify(result.loadout.gear)
    const gain = prev ? dir * (result.value - prev.value) : Infinity
    if (prev && (sameGear || !(gain > Math.abs(prev.value) * 0.005))) return
    out.push({ key, kind, cap, result })
  }
  add('owned', 'owned', 'owned')
  add('wearable', 'wearable', 'wearable')
  for (const c of caps) add(`lv${c}`, 'level', { cap: c }, c)
  return out
}

