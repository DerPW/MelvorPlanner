// Mastery Guild wie im Spiel (MasteryGuildComponent): Jede erledigte Aufgabe
// bringt die Punkte ihrer Kategorie; ein Rang ist erreicht, sobald die Punkte
// ceil(Gesamtpunkte × Prozent) erreichen. Gespeichert ist nur der Fortschritt
// der Aufgaben — Punkte und Rang werden daraus gerechnet, Bedingungen (Level,
// Statistiken) am aktuellen Stand geprüft.

import type { GameIndex } from './planner'
import type { GameGoal, Id, MasteryGuild, Profile } from './types'

export interface TaskProgress {
  task: MasteryGuild['tasks'][number]
  /** das Ziel, nach dem sich die Aufgabe richtet */
  goal: GameGoal
  kind: 'goal' | 'condition' | 'trigger'
  done: boolean
  /** Stand und Ziel (bei Ja/Nein-Aufgaben 0/1) */
  value: number
  target: number
  /** Stand ist nicht bekannt (kein Spielstand oder nicht lesbar) */
  unknown: boolean
}

export interface MasteryProgress {
  guild: MasteryGuild
  tasks: TaskProgress[]
  points: number
  total: number
  /** Index in guild.ranks */
  rank: number
  /** Punkte, ab denen jeder Rang gilt */
  thresholds: number[]
}

/** Ist eine Bedingung (ConditionGoal) am Stand erfüllt — und wie weit? */
function condition(profile: Profile, g: GameGoal): { value: number; target: number; unknown: boolean } {
  const stat = (statistic: unknown, key: unknown) => profile.stats?.[String(statistic)]?.[String(key)] ?? 0
  switch (g.type) {
    case 'Level': {
      const skill = String(g.entity ?? '')
      return { value: profile.levels[skill] ?? 1, target: Number(g.level ?? 1), unknown: false }
    }
    case 'ItemStatistic':
      return { value: stat(g.statistic, g.item), target: Number(g.value ?? 1), unknown: !profile.stats }
    case 'RanchingAnimalStatistic':
      return { value: stat(g.statistic, g.animal), target: Number(g.value ?? 1), unknown: !profile.stats }
    case 'SlayerMasterStatistic':
      return { value: stat(g.statistic, g.master), target: Number(g.value ?? 1), unknown: !profile.stats }
    default:
      // Jagd-Tagebuch u. a. liest der Planer nicht
      return { value: 0, target: 1, unknown: true }
  }
}

export function masteryProgress(index: GameIndex, profile: Profile, skill: Id): MasteryProgress | null {
  const guild = index.data.mastery?.[skill]
  if (!guild) return null
  const saved = profile.mastery?.[skill]
  const points = new Map(guild.categories.map((c) => [c.id, c.points]))
  const tasks: TaskProgress[] = guild.tasks.map((task) => {
    const state = saved?.[task.id]
    if (task.goal) {
      const progress = state ? Math.min(task.goal.max, state.progress) : 0
      const done = !!state && (state.complete || state.progress >= task.goal.max)
      return { task, goal: task.goal, kind: 'goal', done, value: done ? task.goal.max : progress, target: task.goal.max, unknown: !saved }
    }
    if (task.condition) {
      const c = condition(profile, task.condition)
      return { task, goal: task.condition, kind: 'condition', done: !c.unknown && c.value >= c.target, ...c }
    }
    const trigger = task.trigger!
    const done = !!state?.triggerMet
    return { task, goal: trigger, kind: 'trigger', done, value: done ? 1 : 0, target: 1, unknown: !saved }
  })
  const total = tasks.reduce((n, t) => n + (points.get(t.task.category) ?? 0), 0)
  const have = tasks.reduce((n, t) => n + (t.done ? (points.get(t.task.category) ?? 0) : 0), 0)
  const thresholds = guild.ranks.map((r) => Math.ceil(total * r.percent))
  let rank = 0
  for (let i = 1; i < guild.ranks.length && have >= thresholds[i]; i++) rank = i
  return { guild, tasks, points: have, total, rank, thresholds }
}

/** Gilden-Rang je Skill aus dem Mastery-Fortschritt (Index wie data.guildRanks) */
export function guildRanksOf(index: GameIndex, profile: Profile): Record<Id, number> {
  const out: Record<Id, number> = {}
  for (const skill of Object.keys(index.data.mastery ?? {})) {
    const m = masteryProgress(index, profile, skill)
    if (m && m.guild.ranks.length > 1) out[skill] = m.rank
  }
  return out
}
