// Spielstand aus Datei (.sav) oder Export-Text (Base64) laden und in ein
// Profil übersetzen. Brotli kommt aus WASM: Das Spiel schließt seinen
// Brotli-Strom nie ab (BrotliStream wird vor ToArray nur geflusht), strenge
// Decoder brechen deshalb ab — der Strom-Decoder liefert alles bis dahin.

import { MAX_LEVEL, levelForXp } from './experience'
import type { GameIndex } from './planner'
import { parseSave, type SaveData } from './save'
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
    throw new Error('Die Daten ließen sich nicht entpacken — ist das ein Spielstand aus Melvor Idle 2?')
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
  if (!total) throw new Error('Datei ließ sich nicht entpacken — ist das ein Melvor-Idle-2-Spielstand?')
  return out
}

function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/\s+/g, '')
  if (!/^[A-Za-z0-9+/=_-]+$/.test(clean)) throw new Error('Der Text ist kein Export-Text aus dem Spiel (Base64 erwartet).')
  const bin = atob(clean.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** Datei oder eingefügter Export-Text → gelesener Spielstand */
export async function readSave(input: File | string): Promise<SaveData> {
  const compressed = typeof input === 'string' ? base64ToBytes(input) : new Uint8Array(await input.arrayBuffer())
  return parseSave(await brotliDecode(compressed))
}

export interface ImportResult {
  profile: Profile
  /** Skills, deren XP schon für ein höheres Level reicht als gespeichert */
  pendingLevelUps: { skill: string; saved: number; byXp: number }[]
  unknownItems: string[]
}

/** Spielstand → Profil. Farming-Felder bleiben, wie sie eingestellt waren. */
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
  return {
    profile: {
      levels,
      xp: { ...save.xp },
      inventory: Object.fromEntries(Object.entries(save.bank).filter(([id]) => index.items.has(id))),
      currencies: { ...save.currencies },
      owned: Object.fromEntries(Object.entries(save.purchases).filter(([, n]) => n > 0)),
      equipped: save.equipped,
      levelCap: cap,
      farmingPlots: current.farmingPlots,
      source: {
        character: save.character,
        savedAt: save.savedAt?.toISOString() ?? null,
        importedAt: new Date().toISOString(),
        version: save.version,
      },
    },
    pendingLevelUps,
    unknownItems,
  }
}
