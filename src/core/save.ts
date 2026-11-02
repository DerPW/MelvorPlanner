// Spielstand von Melvor Idle 2 lesen (Demo 0.11.4, SaveVersion 28).
//
// Datei = Brotli( Version · Kopf · Spiel ), der Export-Text im Spiel ist
// Base64 derselben Bytes. Das Spiel ist eine Liste von Einheiten (Skills,
// Bank, Shop …), jede mit Komponenten; beide stehen in Blöcken mit
// Längenangabe (SaveWriter.WriteInRegion) — gelesen wird nur, was der Planer
// braucht, der Rest wird übersprungen. So übersteht der Import auch Updates,
// die anderswo etwas am Format ändern.
//
// Aufbau aus dem Spielcode: SaveHeader.ReadFrom, Game.ReadFrom,
// GameEntity.ReadFrom, BaseExperience, CurrencyWalletComponent,
// BankInventoryComponent/StackableInventory, ShopComponent, ToolbeltComponent.

import type { Id, Msg } from './types'

/** Fehler mit Übersetzungsschlüssel (die Oberfläche übersetzt) */
export class SaveError extends Error {
  constructor(public msg: Msg) {
    super(msg.key)
  }
}

export interface SaveData {
  version: number
  character: string
  gamemode: string
  savedAt: Date | null
  activeEntity: string
  activeAction: string
  totalLevel: number
  isDemo: boolean
  /** Skill → XP / Level (Level ist schon auf die Level-Grenze gedeckelt) */
  xp: Record<Id, number>
  levels: Record<Id, number>
  bank: Record<Id, number>
  currencies: Record<Id, number>
  purchases: Record<Id, number>
  equipped: Id[]
  entities: string[]
  warnings: Msg[]
}

/** Versionen, deren Aufbau hier geprüft ist */
export const KNOWN_SAVE_VERSIONS = [28]

class Reader {
  private view: DataView
  pos = 0
  private utf8 = new TextDecoder()
  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }
  get length() {
    return this.bytes.length
  }
  private need(n: number) {
    if (this.pos + n > this.bytes.length) throw new SaveError({ key: 'save.truncated', params: { pos: this.pos } })
  }
  i32() {
    this.need(4)
    const v = this.view.getInt32(this.pos, true)
    this.pos += 4
    return v
  }
  i64(): bigint {
    this.need(8)
    const v = this.view.getBigInt64(this.pos, true)
    this.pos += 8
    return v
  }
  f64() {
    this.need(8)
    const v = this.view.getFloat64(this.pos, true)
    this.pos += 8
    return v
  }
  bool() {
    this.need(1)
    return this.bytes[this.pos++] !== 0
  }
  skip(n: number) {
    this.need(n)
    this.pos += n
  }
  /** .NET BinaryWriter.Write(string): 7-Bit-Länge, dann UTF-8 */
  str() {
    let len = 0
    let shift = 0
    let b: number
    do {
      this.need(1)
      b = this.bytes[this.pos++]
      len |= (b & 0x7f) << shift
      shift += 7
    } while (b & 0x80 && shift < 35)
    this.need(len)
    const s = this.utf8.decode(this.bytes.subarray(this.pos, this.pos + len))
    this.pos += len
    return s
  }
  /** Teil-Leser für einen Block [Länge][Inhalt]; der Haupt-Leser springt dahinter */
  region(): Reader {
    const len = this.i32()
    this.need(len)
    const sub = new Reader(this.bytes.subarray(this.pos, this.pos + len))
    this.pos += len
    return sub
  }
}

/** .NET DateTime.ToBinary → Date (Ticks in den unteren 62 Bit, UTC) */
function fromDotNetBinary(v: bigint): Date | null {
  const ticks = v & 0x3fffffffffffffffn
  const ms = Number((ticks - 621355968000000000n) / 10000n)
  return Number.isFinite(ms) && ms > 0 ? new Date(ms) : null
}

export function parseSave(raw: Uint8Array): SaveData {
  const r = new Reader(raw)
  const out: SaveData = {
    version: r.i32(),
    character: '',
    gamemode: '',
    savedAt: null,
    activeEntity: '',
    activeAction: '',
    totalLevel: 0,
    isDemo: false,
    xp: {},
    levels: {},
    bank: {},
    currencies: {},
    purchases: {},
    equipped: [],
    entities: [],
    warnings: [],
  }
  if (out.version < 0 || out.version > 1000) throw new SaveError({ key: 'save.notASave' })
  if (!KNOWN_SAVE_VERSIONS.includes(out.version)) {
    out.warnings.push({ key: 'save.unknownVersion', params: { version: out.version, known: KNOWN_SAVE_VERSIONS.join(', ') } })
  }

  // Kopf (SaveHeader.ReadFrom)
  r.skip(16) // UUID
  out.character = r.str()
  out.gamemode = r.str()
  out.savedAt = fromDotNetBinary(r.i64())
  if (out.version < 9 /* Localization */) {
    out.activeEntity = r.str()
  } else {
    out.activeEntity = r.str()
    r.str()
    out.activeAction = r.str()
    r.str()
  }
  out.totalLevel = r.i32()
  out.currencies['MelvorBase:GoldPieces'] = Number(r.i64())
  out.currencies['MelvorBase:SlayerCoins'] = Number(r.i64())
  if (out.version >= 24 /* Alpha0_11_0 */) out.isDemo = r.bool()

  // Spiel: Einheiten → Komponenten
  const count = r.i32()
  for (let e = 0; e < count; e++) {
    const entity = r.str()
    const er = r.region()
    out.entities.push(entity)
    try {
      const components = er.i32()
      for (let c = 0; c < components; c++) {
        const component = er.str()
        const cr = er.region()
        try {
          readComponent(out, entity, component, cr)
        } catch (err) {
          out.warnings.push({ key: 'save.unreadable', params: { what: `${short(entity)}/${component}`, reason: errMsg(err) } })
        }
      }
    } catch (err) {
      out.warnings.push({ key: 'save.unreadable', params: { what: short(entity), reason: errMsg(err) } })
    }
  }
  return out
}

function readComponent(out: SaveData, entity: string, component: string, r: Reader) {
  switch (component) {
    case 'Experience': {
      out.xp[entity] = r.f64()
      out.levels[entity] = r.i32()
      return
    }
    case 'Wallet': {
      const n = r.i32()
      for (let i = 0; i < n; i++) {
        const qty = Number(r.i64())
        out.currencies[r.str()] = qty
      }
      return
    }
    case 'Inventory': {
      if (entity !== 'MelvorBase:Bank') return
      r.i32() // DefaultNewItemTab
      const tabs = r.i32()
      for (let t = 0; t < tabs; t++) {
        r.i32() // MaxStacks
        r.i32() // MinStackQuantity
        r.i32() // MaxStackQuantity
        r.bool() // AllowStackCombining
        r.bool() // AllowSameItemStacks
        const stacks = r.i32()
        for (let s = 0; s < stacks; s++) {
          const qty = r.i32()
          const placeholder = r.bool()
          r.bool() // IsLocked
          const item = r.str()
          if (!placeholder && qty > 0) out.bank[item] = (out.bank[item] ?? 0) + qty
        }
        r.str() // Reitername
        const tags = r.i32()
        for (let g = 0; g < tags; g++) {
          r.bool()
          r.bool()
          r.str()
        }
      }
      return
    }
    case 'Shop': {
      if (entity !== 'MelvorBase:Shop') return
      r.bool() // ShowPurchased
      r.bool() // ShowLocked
      r.bool() // HoldToBuy
      r.i32() // CustomQuantity
      r.i32() // PurchaseMode
      const n = r.i32()
      for (let i = 0; i < n; i++) {
        const qty = r.i32()
        out.purchases[r.str()] = qty
      }
      return
    }
    case 'Toolbelt': {
      const slots = r.i32()
      for (let i = 0; i < slots; i++) {
        r.str() // Slot
        const sr = r.region()
        sr.i32() // Quantity
        if (sr.bool()) {
          const item = sr.str()
          if (!out.equipped.includes(item)) out.equipped.push(item)
        }
      }
      return
    }
  }
}

const short = (id: string) => id.replace(/^MelvorBase:/, '')

/** Grund eines Fehlers als Meldung — SaveError behält seinen Schlüssel */
export function errMsg(err: unknown): Msg {
  if (err instanceof SaveError) return err.msg
  return { key: 'save.error', params: { reason: String((err as Error)?.message ?? err) } }
}
