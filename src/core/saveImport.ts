// Spielstand aus Datei (.sav) oder Export-Text (Base64) laden und in ein
// Profil übersetzen. Brotli kommt aus WASM: Das Spiel schließt seinen
// Brotli-Strom nie ab (BrotliStream wird vor ToArray nur geflusht), strenge
// Decoder brechen deshalb ab — der Strom-Decoder liefert alles bis dahin.

import { MAX_LEVEL, levelForXp } from './experience'
import { guildRanksOf } from './mastery'
import type { GameIndex } from './planner'
import { parseSave, SaveError, type SaveData } from './save'
import type { Profile } from './types'

export const DEMO_LEVEL_CAP = 60

async function brotliDecode(input: Uint8Array): Promise<Uint8Array> {
  const [{ default: init, BrotliDecStream }, { default: wasmUrl }] = await Promise.all([
    import('brotli-dec-wasm/web'),
    import('brotli-dec-wasm/web/bg.wasm?url'),
  ])
  await init({ module_or_path: wasmUrl })
  const stream = new BrotliDecStream()
  const chunks: Uint8Array[] = []
  let offset = 0
  try {
    for (let guard = 0; guard < 10_000; guard++) {
      const res = stream.dec(input.subarray(offset), 1 << 20)
      chunks.push(res.buf)
      offset += res.input_offset
      // 1 = fertig, 2 = will mehr Eingabe (beim Spiel: Ende ohne Abschluss), 3 = mehr Platz
      if (res.code !== 3) break
    }
  } catch {
    throw new SaveError({ key: 'save.unpack' })
  } finally {
    stream.free()
  }
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) {
    out.set(c, pos)
    pos += c.length
  }
  if (!total) throw new SaveError({ key: 'save.unpack' })
  return out
}

function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/\s+/g, '')
  if (!/^[A-Za-z0-9+/=_-]+$/.test(clean)) throw new SaveError({ key: 'save.notBase64' })
  const bin = atob(clean.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** Datei, Bytes oder eingefügter Export-Text → entpackte Spielstand-Bytes */
export async function unpackSave(input: File | Uint8Array | string): Promise<Uint8Array> {
  const compressed =
    typeof input === 'string' ? base64ToBytes(input) : input instanceof Uint8Array ? input : new Uint8Array(await input.arrayBuffer())
  return brotliDecode(compressed)
}

/** Datei, Bytes oder eingefügter Export-Text → gelesener Spielstand */
export async function readSave(input: File | Uint8Array | string): Promise<SaveData> {
  return parseSave(await unpackSave(input))
}

/** Bytes wieder packen wie das Spiel (Brotli) — für den Editor */
export async function packSave(raw: Uint8Array): Promise<Uint8Array> {
  const brotli = await (await import('brotli-wasm')).default
  return brotli.compress(raw, { quality: 9 })
}

export interface ImportResult {
  profile: Profile
  /** Skills, deren XP schon für ein höheres Level reicht als gespeichert */
  pendingLevelUps: { skill: string; saved: number; byXp: number }[]
  unknownItems: string[]
}

/** Spielstand → Profil. Was nicht im Spielstand steht (Farming-Felder,
 *  Gilden-Rang), bleibt, wie es eingestellt war. */
export function profileFromSave(index: GameIndex, save: SaveData, current: Profile): ImportResult {
  const cap = save.isDemo ? DEMO_LEVEL_CAP : MAX_LEVEL
  const levels: Record<string, number> = {}
  const pendingLevelUps: ImportResult['pendingLevelUps'] = []
  for (const [skill, saved] of Object.entries(save.levels)) {
    if (!index.skills.has(skill)) continue
    // Das Spiel übernimmt das gespeicherte Level und rechnet erst bei der
    // nächsten XP-Gutschrift neu — XP, die schon weiter reicht, zählt.
    const byXp = Math.min(cap, levelForXp(save.xp[skill] ?? 0))
    if (byXp > saved) pendingLevelUps.push({ skill, saved, byXp })
    levels[skill] = Math.max(saved, byXp)
  }
  const unknownItems = Object.keys(save.bank).filter((id) => !index.items.has(id))
  const fromSave = {
    gear: Object.fromEntries(Object.entries(save.combat.gear).map(([slot, g]) => [slot, g.item])),
    qty: Object.fromEntries(Object.entries(save.combat.gear).map(([slot, g]) => [slot, g.qty])),
    stances: save.combat.stances,
    food: save.combat.food,
    spell: save.combat.spell,
    hp: save.combat.hp,
  }
  const profile: Profile = {
    levels,
    xp: { ...save.xp },
    inventory: Object.fromEntries(Object.entries(save.bank).filter(([id]) => index.items.has(id))),
    currencies: { ...save.currencies },
    owned: Object.fromEntries(Object.entries(save.purchases).filter(([, n]) => n > 0)),
    equipped: save.equipped,
    levelCap: cap,
    farmingPlots: current.farmingPlots,
    guildRanks: current.guildRanks,
    unlocked: current.unlocked,
    // Selbst gewählte Ausrüstung bleibt; die aus dem Spiel wird trotzdem gemerkt
    combat: current.combatManual && current.combat ? current.combat : fromSave,
    combatSave: fromSave,
    stats: save.stats,
    values: save.values,
    mastery: save.mastery,
    quests: save.quests,
    bankTabs: save.bankTabs.map((t) => ({ ...t, items: t.items.filter((i) => index.items.has(i.item)) })),
    combatManual: current.combatManual && !!current.combat,
    source: {
      character: save.character,
      savedAt: save.savedAt?.toISOString() ?? null,
      importedAt: new Date().toISOString(),
      version: save.version,
    },
  }
  // Gilden-Rang aus dem Mastery-Fortschritt — wie das Spiel ihn beim Laden rechnet
  if (Object.keys(save.mastery).length) profile.guildRanks = { ...profile.guildRanks, ...guildRanksOf(index, profile) }
  return { profile, pendingLevelUps, unknownItems }
}
