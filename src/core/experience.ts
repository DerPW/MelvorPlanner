// StandardExperienceTable aus dem Spielcode: 0,25 · Σ ⌊i + 300 · 2^(i/7)⌋

export const MAX_LEVEL = 120

const table: number[] = [0]
let sum = 0

export function xpForLevel(level: number): number {
  if (level < 1) return 0
  for (let i = table.length; i < level; i++) {
    sum += Math.floor(i + 300 * Math.pow(2, i / 7))
    table.push(Math.floor(0.25 * sum))
  }
  return table[level - 1]
}

export function levelForXp(xp: number): number {
  let level = 1
  while (level < MAX_LEVEL && xpForLevel(level + 1) <= xp) level++
  return level
}
