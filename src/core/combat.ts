// Kampf-Simulation: Spieler mit Ausrüstung und Haltung gegen ein Monster.
//
// Formeln aus dem Spielcode (Demo 0.11.4): CharacterStats (Treffer,
// Ausweichen, Max Hit, Intervall, HP), TargetCharacterStats (Trefferchance,
// Resistenz), CharacterComponent.ModifyAttackDamage (Schaden nach Resistenz
// und Rüstung, abgeschnitten), CombatActionComponent (3 s Respawn, der
// Angriffstimer beginnt jeden Kampf neu, Kampf-Dreieck, Elemente),
// CombatExperienceComponent (XP je Schaden), FoodComponent (Auto-Essen bei
// 25 % bis voll), CombatLootComponent (ein Wurf je Tabelle und Kill).
//
// Gerechnet wird der Erwartungswert, nicht gewürfelt: Die Züge bis zum Kill
// kommen exakt aus der Schadensverteilung (siehe killTurns). Nicht drin:
// Ausrüstungs-Boni als Modifikatoren (+x % Max Hit …), Gebets-, Slayer- und
// Gebiets-Effekte, Schaden über Zeit, Betäubung, Lebensraub, Reflexion.

import { levelOf, type GameIndex } from './planner'
import type { AttackDef, AttackStance, CombatLoadout, CombatStyle, Enemy, Id, Item, Msg, Profile } from './types'

export const HITPOINTS = 'MelvorBase:Hitpoints'
export const COMBAT_SKILLS = ['MelvorBase:Attack', 'MelvorBase:Strength', 'MelvorBase:Defence', 'MelvorBase:Ranged', 'MelvorBase:Magic', HITPOINTS]
const FISTS = 'MelvorBase:DefaultWeapon'
/** Ein Tick bei 60 Bildern je Sekunde — Intervalle werden darauf gerundet (TickTimer.MSToTicks) */
const TICK = 1000 / 60
const ticked = (ms: number) => Math.round(ms / TICK) * TICK

/** Was eine Seite im Kampf ausmacht — Spieler und Monster gleich gerechnet */
export interface Fighter {
  style: CombatStyle
  stance: AttackStance
  /** Kampf-Level inkl. unsichtbarer Haltungs-Boni */
  levels: Record<Id, number>
  stats: Record<string, number>
  accuracy: number
  /** Ausweichen gegen die Haltung des Angreifers */
  evasion: (attacker: AttackStance) => number
  /** Max Hit vor Kampf-Dreieck und Element */
  baseMaxHit: number
  intervalMs: number
  maxHp: number
  power: number
  protection: number
  armour: number
  element: string
  attacks: { attack: AttackDef; chance: number }[]
}

export interface PlayerFighter extends Fighter {
  weapon: Item | null
  ammo: Item | null
  spell: Id | null
  food: Item | null
  /** Ausrüstung je Platz (ohne belegte Nebenplätze) */
  gear: Record<string, Item>
  /** Warum der Spieler nicht angreifen kann (keine Munition, kein Zauber) */
  problems: Msg[]
}

const NORMAL: AttackDef = { name: 'Normal', avoidable: true, hits: [{ count: 1, interval: 0, damage: [{ who: 'attacker', type: 'NormalDamage', Percent: 1 }] }] }

function tables(index: GameIndex) {
  const c = index.data.combat
  return {
    c,
    style: (id: string) => c.styles.find((s) => s.id === id)!,
    stance: (id: string) => c.stances.find((s) => s.id === id) ?? c.stances[0],
    attack: (id: string) => (id === 'Normal' ? NORMAL : (c.attacks[id] ?? NORMAL)),
  }
}

/** Σ Level × Anteil (CombatLevelRatio.ComputeLevel — nicht gerundet) */
const effLevel = (levels: Record<Id, number>, ratios: { skill: Id; ratio: number }[]) =>
  ratios.reduce((s, r) => s + (levels[r.skill] ?? 1) * r.ratio, 0)

const darknessFactor = (darkness: number) => 1 - 0.05 * Math.min(20, Math.max(0, darkness))

/** Angriffswahrscheinlichkeiten normieren (CharacterComponent.NormalizeAttackChances) */
function normalize(list: { attack: AttackDef; chance: number }[]): { attack: AttackDef; chance: number }[] {
  const sum = list.reduce((s, a) => s + a.chance, 0)
  if (sum < 1) return [{ attack: NORMAL, chance: 1 - sum }, ...list]
  return list.map((a) => ({ ...a, chance: a.chance / sum }))
}

function makeFighter(
  index: GameIndex,
  stance: AttackStance,
  baseLevels: Record<Id, number>,
  stats: Record<string, number>,
  power: number,
  protection: number,
  element: string,
  attacks: { attack: AttackDef; chance: number }[],
  darkness: number,
): Fighter {
  const T = tables(index)
  const style = T.style(stance.style)
  const levels = { ...baseLevels }
  for (const b of stance.levels) levels[b.skill] = (levels[b.skill] ?? 1) + b.value
  const stat = (name: string) => stats[name] ?? 0
  const dark = darknessFactor(darkness)

  const accBase = Math.floor((effLevel(levels, style.accuracy) + 9) * (stat(stance.accuracyStat) + 64))
  const accuracy = Math.max(Math.trunc(accBase * dark), 1)
  const evasion = (attacker: AttackStance) => {
    const s = T.style(attacker.style)
    const base = Math.floor((effLevel(levels, s.evasion) + 9) * (stat(attacker.evasionStat) + 64))
    return Math.max(Math.trunc(base * dark), 1)
  }

  let baseMaxHit: number
  const L = effLevel(levels, style.maxHit.levels)
  if (style.maxHit.kind === 'strength') baseMaxHit = Math.floor(22 + L + ((L + 17) * stat(style.maxHit.stat)) / 64)
  else baseMaxHit = Math.floor(stat(style.maxHit.stat) * (1 + stat(style.maxHit.bonus)) * (1 + (L + 1) / 200))

  return {
    style,
    stance,
    levels,
    stats,
    accuracy,
    evasion,
    baseMaxHit,
    intervalMs: ticked(Math.max(Math.floor(stat('AttackInterval')), 250)),
    maxHp: Math.max((levels[HITPOINTS] ?? 1) * 10, 1),
    power: Math.max(power, 1),
    protection: Math.max(protection, 0),
    armour: Math.max(Math.trunc(stat('Armour')), 0),
    element,
    attacks: normalize(attacks),
  }
}

/** Ausrüstung aus dem Stand; ohne Waffe kämpft man mit Fäusten */
export function loadoutOf(profile: Profile): CombatLoadout {
  return profile.combat ?? { gear: {}, stances: {}, food: null, spell: null }
}

/** Stance für eine Waffe: gewählt oder die erste ihres Typs */
export function stanceFor(index: GameIndex, loadout: CombatLoadout, weapon: Item | null): AttackStance {
  const T = tables(index)
  const type = weapon?.weapon?.type ?? 'Melee'
  const allowed = T.c.weaponTypes[type] ?? ['Stab']
  const chosen = loadout.stances[type]
  return T.stance(chosen && allowed.includes(chosen) ? chosen : allowed[0])
}

export function playerFighter(index: GameIndex, profile: Profile, loadout = loadoutOf(profile), darkness = 0): PlayerFighter {
  const T = tables(index)
  const gear: Record<string, Item> = {}
  for (const [slot, id] of Object.entries(loadout.gear)) {
    const item = id ? index.items.get(id) : undefined
    if (item?.equipment) gear[slot] = item
  }
  // Plätze, die ein anderes Teil mitbelegt (Bogen → Offhand), zählen nicht doppelt
  for (const item of Object.values(gear)) for (const s of item.equipment?.occupies ?? []) if (gear[s] && gear[s] !== item) delete gear[s]
  const weapon = gear.Weapon ?? index.items.get(FISTS) ?? null
  const stance = stanceFor(index, loadout, gear.Weapon ?? null)
  const style = T.style(stance.style)

  const stats: Record<string, number> = {}
  let power = 0
  let protection = 0
  const parts = gear.Weapon ? Object.values(gear) : [...Object.values(gear), ...(weapon ? [weapon] : [])]
  for (const item of parts) {
    for (const s of item.equipment?.stats ?? []) stats[s.name] = (stats[s.name] ?? 0) + s.value
    power += item.equipment?.power.find((p) => p.name === 'Normal')?.value ?? 0
    protection += item.equipment?.protection.find((p) => p.name === 'Normal')?.value ?? 0
  }

  const problems: Msg[] = []
  const spell = style.spells ? (T.c.spells.find((s) => s.id === loadout.spell) ?? null) : null
  if (style.spells) {
    if (spell) stats.SpellMaxHit = (stats.SpellMaxHit ?? 0) + spell.maxHit
    else problems.push({ key: 'combat.noSpell' })
  }
  const ammo = gear.Ammo ?? null
  const needs = weapon?.weapon?.ammo
  if (needs && ammo?.equipment?.ammoType !== needs) problems.push({ key: 'combat.noAmmo', params: { type: needs } })

  const element = spell ? spell.element : (weapon?.weapon?.elements[0] ?? 'Neutral')
  const attacks = spell?.attack
    ? [{ attack: T.attack(spell.attack), chance: 1 }]
    : Object.values(gear).flatMap((i) => (i.equipment?.attacks ?? []).map((a) => ({ attack: T.attack(a.attack), chance: a.chance })))
  const levels: Record<Id, number> = {}
  for (const s of COMBAT_SKILLS) levels[s] = levelOf(profile, s)
  // Neue Spielstände beginnen mit Hitpoints 10
  if (!profile.levels[HITPOINTS]) levels[HITPOINTS] = 10

  const f = makeFighter(index, stance, levels, stats, power, protection, element, attacks, darkness)
  const food = loadout.food ? (index.items.get(loadout.food) ?? null) : null
  return { ...f, weapon, ammo, spell: spell?.id ?? null, food: food?.food ? food : null, gear, problems }
}

export function enemyFighter(index: GameIndex, e: Enemy): Fighter {
  const T = tables(index)
  const stats: Record<string, number> = {}
  for (const s of e.stats) stats[s.name] = (stats[s.name] ?? 0) + s.value
  // Alle Demo-Monster haben genau eine Haltung; sonst die häufigste
  const stance = T.stance([...e.stances].sort((a, b) => b.weight - a.weight)[0]?.stance ?? 'Stab')
  return makeFighter(index, stance, e.levels, stats, e.power, e.protection, e.element ?? 'Neutral', e.attacks.map((a) => ({ attack: T.attack(a.attack), chance: a.chance })), 0)
}

/** Trefferchance (TargetCharacterStats.ComputeHitChance) */
export function hitChance(acc: number, eva: number): number {
  const p = acc >= eva ? 1 - eva / 2 / acc : acc / 2 / eva
  return Math.min(1, Math.max(0, p))
}

/** Resistenz: Schutz / (Kraft + Schutz), höchstens 70 %, dann das Kampf-Dreieck */
export function resistance(attackerPower: number, defenderProtection: number, triangle = 0): number {
  const r = Math.min(0.7, Math.max(0, defenderProtection / (attackerPower + defenderProtection)))
  return Math.min(1, Math.max(0, r * (1 + triangle)))
}

/** Schaden nach Resistenz und Rüstung, abgeschnitten, mindestens 1 (ModifyAttackDamage) */
const finalDamage = (raw: number, R: number, armour: number) => (raw <= 0 ? 0 : Math.trunc(Math.max(raw * (1 - R) - armour, 1)))

/** Verteilung des Schadens eines Treffers: Wert → Wahrscheinlichkeit */
function hitDistribution(min: number, max: number, R: number, armour: number): Map<number, number> {
  const out = new Map<number, number>()
  const lo = Math.min(min, max)
  const n = max - lo + 1
  for (let x = lo; x <= max; x++) {
    const d = finalDamage(x, R, armour)
    out.set(d, (out.get(d) ?? 0) + 1 / n)
  }
  return out
}

/** Erwartete Züge, bis `hp` Lebenspunkte weg sind — exakt über die
 *  Verteilung: E[h] = (1 + p · Σ P(d) · E[h − d]) / p. Damit zählt auch, dass
 *  der letzte Treffer meist mehr kann als nötig. */
export function killTurns(hp: number, p: number, dist: Map<number, number>): number {
  if (p <= 0 || hp <= 0) return hp <= 0 ? 0 : Infinity
  const entries = [...dist].filter(([d]) => d > 0)
  const zero = dist.get(0) ?? 0
  const q = p * (1 - zero)
  if (q <= 0) return Infinity
  const E = new Float64Array(hp + 1)
  for (let h = 1; h <= hp; h++) {
    let s = 0
    for (const [d, w] of entries) s += w * (d >= h ? 0 : E[h - d])
    E[h] = (1 + p * s) / q
  }
  return E[hp]
}

/** Erwarteter Schaden eines Angriffs (alle Treffer) und der größte mögliche */
function attackDamage(att: AttackDef, attacker: Fighter, defender: Fighter, maxHit: number, minHit: number, p: number, R: number) {
  let mean = 0
  let worst = 0
  for (const hit of att.hits) {
    for (const part of hit.damage) {
      const owner = part.who === 'defender' ? defender : attacker
      const pct = part.Percent ?? 1
      let lo = 0
      let hi = 0
      if (part.type === 'NormalDamage') {
        lo = Math.trunc(minHit * pct)
        hi = Math.trunc(maxHit * pct)
      } else if (part.type === 'MaxHit') lo = hi = Math.trunc(maxHit * pct)
      else if (part.type === 'MaxHitpoints' || part.type === 'CurrentHitpoints') lo = hi = Math.trunc(owner.maxHp * pct)
      else if (part.type === 'FixedRange') {
        lo = part.Minimum ?? 0
        hi = part.Maximum ?? 0
      } else if (part.type === 'Fixed') lo = hi = part.Damage ?? 0
      const dist = hitDistribution(lo, hi, R, defender.armour)
      let m = 0
      for (const [d, w] of dist) m += d * w
      const chance = att.avoidable ? p : 1
      mean += hit.count * chance * m
      worst += hit.count * finalDamage(hi, R, defender.armour)
    }
  }
  return { mean, worst, turnMs: att.hits.reduce((s, h) => s + h.interval * Math.max(0, h.count - 1), 0) }
}

export interface FightResult {
  enemy: Enemy
  player: PlayerFighter
  foe: Fighter
  canAttack: boolean
  hitChance: number
  enemyHitChance: number
  maxHit: number
  minHit: number
  /** Resistenz gegen den Spieler bzw. des Spielers */
  enemyResistance: number
  playerResistance: number
  enemyMaxHit: number
  /** Erwarteter Schaden je Angriff des Monsters (nach Treffern und Resistenz) */
  enemyDamagePerAttack: number
  turnsPerKill: number
  killMs: number
  fightMs: number
  damageTakenPerKill: number
  foodPerKill: number
  /** Kann ein einzelner Angriff durchs Auto-Essen kommen? */
  danger: 'safe' | 'risky' | 'deadly'
  autoEatAt: number
  xpPerKill: Record<Id, number>
  goldPerKill: number
  drops: { item: Id; qty: number }[]
  dropValuePerKill: number
  ammoPerKill: number
  runesPerKill: { item: Id; qty: number }[]
}

/** Ein Kampf gegen `enemy`, gerechnet als Erwartungswert je Kill */
export function simulate(index: GameIndex, player: PlayerFighter, enemy: Enemy): FightResult {
  const T = tables(index)
  const foe = enemyFighter(index, enemy)
  const tri = T.c.triangle.find((t) => t.player === player.style.id && t.enemy === foe.style.id)
  const elem = T.c.elements.find((e) => e.player === player.element && e.enemy === foe.element)

  // Spieler → Monster
  const maxHit = Math.max(Math.floor(player.baseMaxHit * (1 + (elem?.maxHit ?? 0)) * (1 + (tri?.maxHit ?? 0))), 1)
  const minHit = 1
  const p = hitChance(player.accuracy, foe.evasion(player.stance))
  const enemyR = resistance(player.power, foe.protection)
  // Zug-Verteilung des normalen Angriffs; Spezialangriffe gehen über ihren Schnitt ein
  const normal = hitDistribution(minHit, maxHit, enemyR, foe.armour)
  let turns = killTurns(foe.maxHp, p, normal)
  let extraMs = 0
  if (player.attacks.length > 1 || player.attacks[0]?.attack !== NORMAL) {
    let meanMixed = 0
    for (const a of player.attacks) {
      const d = attackDamage(a.attack, player, foe, maxHit, minHit, p, enemyR)
      meanMixed += a.chance * d.mean
      extraMs += a.chance * d.turnMs
    }
    const meanNormal = attackDamage(NORMAL, player, foe, maxHit, minHit, p, enemyR).mean
    if (meanMixed > 0 && meanNormal > 0) turns *= meanNormal / meanMixed
  }
  const canAttack = player.problems.length === 0 && Number.isFinite(turns)
  const fightMs = canAttack ? turns * (player.intervalMs + extraMs) : Infinity
  const killMs = T.c.spawnMs + fightMs

  // Monster → Spieler (Dreieck schützt nur den Spieler)
  const enemyMaxHitBase = Math.max(foe.baseMaxHit, 1)
  const q = hitChance(foe.accuracy, player.evasion(foe.stance))
  const playerR = resistance(foe.power, player.protection, tri?.resistance ?? 0)
  let perAttack = 0
  let worst = 0
  let enemyTurnExtra = 0
  for (const a of foe.attacks) {
    const d = attackDamage(a.attack, foe, player, enemyMaxHitBase, 1, q, playerR)
    perAttack += a.chance * d.mean
    worst = Math.max(worst, d.worst)
    enemyTurnExtra += a.chance * d.turnMs
  }
  const enemyAttacks = Number.isFinite(fightMs) ? fightMs / (foe.intervalMs + enemyTurnExtra) : 0
  const damageTaken = enemyAttacks * perAttack
  const autoEatAt = Math.round(0.25 * player.maxHp)
  const danger = worst >= player.maxHp ? 'deadly' : worst > autoEatAt ? 'risky' : 'safe'
  const healing = player.food?.food?.healing ?? 0

  // XP: der ganze Lebensbalken (kein Overkill), dazu der Kill-Bonus aus Rüstung
  const xpPerKill: Record<Id, number> = {}
  for (const g of player.stance.xp) xpPerKill[g.skill] = (xpPerKill[g.skill] ?? 0) + g.perDamage * (foe.maxHp + 4 * foe.armour)

  // Beute: Chance je Kill × mittlere Menge
  const drops = (index.data.infoSources ?? [])
    .filter((s) => s.via === 'enemy' && s.from === enemy.id)
    .map((s) => ({ item: s.item, qty: (s.chance * (s.min + s.max)) / 2 }))
  const dropValue = drops.reduce((sum, d) => sum + d.qty * (index.items.get(d.item)?.sells?.qty ?? 0), 0)
  const gold = enemy.gold ? (enemy.gold.min + enemy.gold.max) / 2 : 0

  return {
    enemy,
    player,
    foe,
    canAttack,
    hitChance: p,
    enemyHitChance: q,
    maxHit,
    minHit,
    enemyResistance: enemyR,
    playerResistance: playerR,
    enemyMaxHit: worst,
    enemyDamagePerAttack: perAttack,
    turnsPerKill: turns,
    killMs,
    fightMs,
    damageTakenPerKill: damageTaken,
    foodPerKill: healing > 0 ? damageTaken / healing : 0,
    danger,
    autoEatAt,
    xpPerKill,
    goldPerKill: gold,
    drops,
    dropValuePerKill: dropValue,
    ammoPerKill: player.weapon?.weapon?.ammo && canAttack ? turns : 0,
    runesPerKill: player.spell ? (T.c.spells.find((s) => s.id === player.spell)?.runes ?? []).map((r) => ({ item: r.item, qty: r.qty * turns })) : [],
  }
}

/** Je Stunde: Kills, XP, Gold, Schaden, Essen */
export function perHour(f: FightResult) {
  const kills = Number.isFinite(f.killMs) && f.killMs > 0 ? 3_600_000 / f.killMs : 0
  const xp: Record<Id, number> = {}
  for (const [k, v] of Object.entries(f.xpPerKill)) xp[k] = v * kills
  return {
    kills,
    xp,
    gold: f.goldPerKill * kills,
    loot: f.dropValuePerKill * kills,
    damage: f.damageTakenPerKill * kills,
    food: f.foodPerKill * kills,
  }
}

/** Kampf-Level (nur Anzeige): bester Wert über die Stile des Charakters */
export function combatLevel(style: CombatStyle, levels: Record<Id, number>): number {
  return Math.max(1, Math.floor(effLevel(levels, style.level)))
}

/** Gebiete eines Monsters; die Dunkelheit des hellsten zählt */
export function enemyAreas(index: GameIndex, enemy: Id) {
  const areas = (index.data.areas ?? []).filter((a) => a.enemies.includes(enemy))
  const normal = areas.filter((a) => a.kind === 'area')
  const darkness = (normal.length ? normal : areas).reduce((m, a) => Math.min(m, a.darkness ?? 0), Infinity)
  return { areas, darkness: Number.isFinite(darkness) ? darkness : 0 }
}
