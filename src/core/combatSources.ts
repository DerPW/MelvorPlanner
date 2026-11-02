// Monster als Rezepte: Beute und Gold als Quelle, Kampf-XP als Training —
// mit der Ausrüstung aus dem Stand. Je Monster eine Variante je Kampf-Skill
// (die Haltung der Waffe, die diesem Skill am meisten XP gibt); Beute und
// Gold trägt nur die Variante der gewählten Haltung, damit nichts doppelt
// als Quelle erscheint.
//
// Die Dauer eines Kills hängt an den Leveln — sie wird bei jedem Aufruf von
// actionTime neu simuliert (planner.hooks.combatTime), damit eine Level-Route
// mit jedem Level schneller wird. Essen je Kill und die Auswahl der Monster
// (sicher, angreifbar, Essen vorhanden) sind eine Momentaufnahme zum Stand.

import { COMBAT_SKILLS, enemyAreas, HITPOINTS, loadoutOf, playerFighter, simulate, stanceFor } from './combat'
import { buildIndex, hooks, unlockReqFor, type GameIndex } from './planner'
import { GP } from './route'
import type { AttackStance, Id, Profile, Recipe } from './types'

export function withCombat(index: GameIndex, profile: Profile): GameIndex {
  const loadout = loadoutOf(profile)
  const tables = index.data.combat
  if (!tables) return index
  const base = playerFighter(index, profile, loadout)
  const weapon = base.gear.Weapon ?? null
  const type = weapon?.weapon?.type ?? 'Melee'
  const current = stanceFor(index, loadout, weapon)
  const stances = (tables.weaponTypes[type] ?? []).map((id) => tables.stances.find((s) => s.id === id)).filter((s): s is AttackStance => !!s)
  const lock = unlockReqFor(index, 'MelvorBase:Combat')
  const xpFor = (s: AttackStance, skill: Id) => s.xp.find((g) => g.skill === skill)?.perDamage ?? 0

  const recipes: Recipe[] = []
  const seen = new Set<Id>()
  for (const area of index.data.areas ?? []) {
    if (area.kind !== 'area') continue
    for (const id of area.enemies) {
      if (seen.has(id)) continue
      seen.add(id)
      const enemy = index.data.enemies?.find((e) => e.id === id)
      if (!enemy) continue
      const { darkness } = enemyAreas(index, id)
      const f = simulate(index, playerFighter(index, profile, loadout, darkness), enemy)
      // Nur Kämpfe, die man ohne Tod übersteht und durchhält
      if (!f.canAttack || f.danger !== 'safe') continue
      if (f.damageTakenPerKill > 0 && !f.player.food) continue
      const reqs = [...(lock ? [lock] : []), ...area.reqs, ...enemy.reqs]
      const loot = (index.data.infoSources ?? []).filter((s) => s.via === 'enemy' && s.from === id)
      const mainSkill = current.xp.find((g) => g.skill !== HITPOINTS)?.skill

      for (const skill of COMBAT_SKILLS) {
        const stance =
          skill === HITPOINTS ? current : [...stances].sort((a, b) => xpFor(b, skill) - xpFor(a, skill)).find((s) => xpFor(s, skill) > 0)
        if (!stance) continue
        const sim =
          stance.id === current.id ? f : simulate(index, playerFighter(index, profile, { ...loadout, stances: { ...loadout.stances, [type]: stance.id } }, darkness), enemy)
        if (!sim.canAttack || sim.danger !== 'safe') continue
        const drops = stance.id === current.id && skill === mainSkill
        recipes.push({
          id: `Combat:${id}:${skill.replace(/^MelvorBase:/, '')}`,
          ref: id,
          category: area.id,
          subcategory: null,
          kind: 'combat',
          name: enemy.name,
          icon: enemy.icon,
          skill,
          level: 1,
          reqs,
          inputs: sim.player.food && sim.foodPerKill > 0 ? [{ item: sim.player.food.id, qty: sim.foodPerKill }] : [],
          costs: [],
          outputs: drops ? loot.map((s) => ({ item: s.item, qty: (s.min + s.max) / 2, chance: s.chance })) : [],
          currencyOutputs: drops && enemy.gold ? [{ currency: GP, qty: (enemy.gold.min + enemy.gold.max) / 2, chance: 1 }] : [],
          timeMs: sim.killMs,
          xp: sim.xpPerKill[skill] ?? 0,
          combat: { enemy: id, stance: stance.id, darkness },
          demoLocked: false,
        })
      }
    }
  }

  // Kill-Dauer mit den Leveln des jeweiligen Stands (gemerkt je Level-Satz)
  const memo = new Map<string, number>()
  hooks.combatTime = (r, p) => {
    const c = r.combat!
    const key = `${r.id}|${COMBAT_SKILLS.map((s) => p.levels[s] ?? 0).join(',')}`
    let ms = memo.get(key)
    if (ms === undefined) {
      const enemy = index.data.enemies?.find((e) => e.id === c.enemy)
      const lo = loadoutOf(p)
      const sim = enemy && simulate(index, playerFighter(index, p, { ...lo, stances: { ...lo.stances, [type]: c.stance } }, c.darkness), enemy)
      ms = sim && sim.canAttack ? sim.killMs : r.timeMs
      memo.set(key, ms)
    }
    return ms
  }

  return recipes.length ? buildIndex({ ...index.data, recipes: [...index.data.recipes, ...recipes] }) : index
}
