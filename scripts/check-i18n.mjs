#!/usr/bin/env node
// Prüft, dass jeder im Code benutzte Übersetzungsschlüssel in de.ts steht
// (en.ts muss per Typ dieselben haben). Zusammengesetzte Schlüssel wie
// `verb.${kind}` werden über die bekannten Werte aufgelöst.
//
//   pnpm check:i18n

import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const src = path.join(root, 'src')
const files = []
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(e.name) && !p.includes(`${path.sep}i18n${path.sep}`)) files.push(p)
  }
}
walk(src)

const dict = fs.readFileSync(path.join(src, 'i18n/de.ts'), 'utf8')
const known = new Set([...dict.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]))

const used = new Set()
for (const f of files) {
  if (f.endsWith('bonuses.ts')) continue // dort heißt t(...) „Summe eines Stats"
  const s = fs.readFileSync(f, 'utf8')
  for (const m of s.matchAll(/\bt\(\s*'([^']+)'/g)) used.add(m[1])
  for (const m of s.matchAll(/\bt\(\s*[\w.]+\s*\?\s*'([^']+)'\s*:\s*'([^']+)'/g)) used.add(m[1]).add(m[2])
  for (const m of s.matchAll(/key:\s*'([^':]+)'/g)) used.add(m[1])
  for (const m of s.matchAll(/key:\s*[\w.]+\s*===\s*'[^']+'\s*\?\s*'([^']+)'\s*:\s*'([^']+)'/g)) used.add(m[1]).add(m[2])
}

// Zusammengesetzte Schlüssel
const kinds = ['artisan', 'cooking', 'woodcutting', 'mining', 'fishing', 'firemaking', 'thieving', 'farming', 'mill', 'shop', 'upgrade']
for (const k of kinds) used.add(`verb.${k}`).add(`kind.${k}`)
for (const k of ['level', 'gold', 'unlock']) used.add(`route.kind.${k}`)
for (const k of ['purchase', 'item', 'guild']) used.add(`bonus.kind.${k}`)
for (const k of ['gather', 'buy', 'have', 'missing']) used.add(`mat.${k}`).add(`mat.${k}.hint`)
for (const k of ['views', 'actions', 'items', 'skills', 'enemies', 'areas', 'shop', 'recipes', 'recent']) used.add(`search.group.${k}`)
for (const k of ['enemy', 'hunting', 'survey', 'ranching', 'chest']) used.add(`via.${k}`)
for (const k of ['search.turnOn', 'search.turnOff', 'detail.area', 'detail.dungeon']) used.add(k)

const missing = [...used].filter((k) => !known.has(k)).sort()
// stat.* und cstat.* sind optional (Rückfall auf den Namen aus dem Spiel)
const unused = [...known].filter((k) => !used.has(k) && !k.startsWith('stat.') && !k.startsWith('cstat.')).sort()
if (unused.length) console.log(`Nicht benutzt (${unused.length}): ${unused.join(', ')}`)
if (missing.length) {
  console.error(`✗ Fehlen in de.ts (${missing.length}): ${missing.join(', ')}`)
  process.exit(1)
}
console.log(`✓ ${used.size} Schlüssel, alle vorhanden`)
