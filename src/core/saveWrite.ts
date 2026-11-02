// Spielstand bearbeiten. Die Datei wird in Kopf, Einheiten und Komponenten
// zerlegt (jede Komponente als Bytes); geändert werden nur Komponenten, deren
// Aufbau hier bekannt ist — Wallet, Bank-Inventar, Experience, Shop. Alles
// andere bleibt byte-genau, wie es war; die Längenangaben der Blöcke
// (SaveWriter.WriteInRegion) werden beim Zusammensetzen neu geschrieben.
//
// Geschrieben wird nie in den Spielordner: Heraus kommen die Bytes für eine
// neue .sav-Datei bzw. der Import-Text (Base64), den man im Spiel einfügt.

import { MAX_LEVEL, levelForXp } from './experience'
import { KNOWN_SAVE_VERSIONS, SaveError } from './save'
import type { Id } from './types'

// ---------------------------------------------------------------------------
// Lesen und Schreiben der Grundtypen (.NET BinaryReader/BinaryWriter)

class Cursor {
  pos = 0
  private view: DataView
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }
  private need(n: number) {
    if (this.pos + n > this.bytes.length) throw new SaveError({ key: 'save.truncated', params: { pos: this.pos } })
  }
  i32() {
    this.need(4)
    this.pos += 4
    return this.view.getInt32(this.pos - 4, true)
  }
  i64() {
    this.need(8)
    this.pos += 8
    return this.view.getBigInt64(this.pos - 8, true)
  }
  f64() {
    this.need(8)
    this.pos += 8
    return this.view.getFloat64(this.pos - 8, true)
  }
  bool() {
    this.need(1)
    return this.bytes[this.pos++] !== 0
  }
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
    this.pos += len
    return new TextDecoder().decode(this.bytes.subarray(this.pos - len, this.pos))
  }
  take(n: number) {
    this.need(n)
    this.pos += n
    return this.bytes.subarray(this.pos - n, this.pos)
  }
  region() {
    return this.take(this.i32())
  }
  rest() {
    return this.take(this.bytes.length - this.pos)
  }
}

class Writer {
  private parts: Uint8Array[] = []
  private size = 0
  bytes(b: Uint8Array) {
    this.parts.push(b)
    this.size += b.length
    return this
  }
  private num(n: number, f: (v: DataView) => void) {
    const b = new Uint8Array(n)
    f(new DataView(b.buffer))
    return this.bytes(b)
  }
  i32(v: number) {
    return this.num(4, (d) => d.setInt32(0, v, true))
  }
  i64(v: bigint) {
    return this.num(8, (d) => d.setBigInt64(0, v, true))
  }
  f64(v: number) {
    return this.num(8, (d) => d.setFloat64(0, v, true))
  }
  bool(v: boolean) {
    return this.bytes(new Uint8Array([v ? 1 : 0]))
  }
  str(s: string) {
    const utf8 = new TextEncoder().encode(s)
    const len: number[] = []
    let n = utf8.length
    do {
      len.push((n & 0x7f) | (n > 0x7f ? 0x80 : 0))
      n >>>= 7
    } while (n > 0)
    return this.bytes(new Uint8Array(len)).bytes(utf8)
  }
  region(b: Uint8Array) {
    return this.i32(b.length).bytes(b)
  }
  done() {
    const out = new Uint8Array(this.size)
    let pos = 0
    for (const p of this.parts) {
      out.set(p, pos)
      pos += p.length
    }
    return out
  }
}

// ---------------------------------------------------------------------------
// Zerlegen und Zusammensetzen

export interface SaveComponent {
  name: string
  bytes: Uint8Array
}
export interface SaveEntity {
  name: string
  components: SaveComponent[]
  /** Was nach den Komponenten im Block steht (z. B. „Tutorial schon gesehen“) */
  tail: Uint8Array
}
export interface SaveTree {
  version: number
  /** Version und Kopf bis vor die Anzahl der Einheiten */
  head: Uint8Array
  /** Lage der Kopf-Felder, die mit dem Inhalt übereinstimmen sollen */
  at: { totalLevel: number; gold: number; slayerCoins: number }
  entities: SaveEntity[]
  /** Was hinter den Einheiten steht */
  rest: Uint8Array
}

export function splitSave(raw: Uint8Array): SaveTree {
  const c = new Cursor(raw)
  const version = c.i32()
  if (!KNOWN_SAVE_VERSIONS.includes(version)) throw new SaveError({ key: 'edit.unknownVersion', params: { version } })
  c.take(16) // UUID
  c.str() // Charakter
  c.str() // Spielmodus
  c.i64() // gespeichert
  c.str() // aktive Einheit
  c.str()
  c.str() // aktive Aktion
  c.str()
  const totalLevel = c.pos
  c.i32()
  const gold = c.pos
  c.i64()
  const slayerCoins = c.pos
  c.i64()
  c.bool() // Demo
  const head = raw.slice(0, c.pos)
  const entities: SaveEntity[] = []
  const count = c.i32()
  for (let e = 0; e < count; e++) {
    const name = c.str()
    const er = new Cursor(c.region())
    const components: SaveComponent[] = []
    const n = er.i32()
    for (let k = 0; k < n; k++) components.push({ name: er.str(), bytes: er.region().slice() })
    entities.push({ name, components, tail: er.rest().slice() })
  }
  return { version, head, at: { totalLevel, gold, slayerCoins }, entities, rest: c.rest().slice() }
}

export function joinSave(tree: SaveTree): Uint8Array {
  const w = new Writer().bytes(tree.head).i32(tree.entities.length)
  for (const e of tree.entities) {
    const ew = new Writer().i32(e.components.length)
    for (const comp of e.components) ew.str(comp.name).region(comp.bytes)
    ew.bytes(e.tail)
    w.str(e.name).region(ew.done())
  }
  return w.bytes(tree.rest).done()
}

const component = (tree: SaveTree, entity: Id, name: string) => tree.entities.find((e) => e.name === entity)?.components.find((c) => c.name === name)

// ---------------------------------------------------------------------------
// Bekannte Komponenten: lesen → ändern → schreiben (der Rest bleibt, wie er war)

/** CurrencyWalletComponent: Anzahl × (i64 Menge, Währung) */
interface Wallet {
  entries: { id: Id; qty: bigint }[]
  rest: Uint8Array
}
function readWallet(b: Uint8Array): Wallet {
  const c = new Cursor(b)
  const n = c.i32()
  const entries = Array.from({ length: n }, () => {
    const qty = c.i64()
    return { id: c.str(), qty }
  })
  return { entries, rest: c.rest() }
}
function writeWallet(w: Wallet) {
  const out = new Writer().i32(w.entries.length)
  for (const e of w.entries) out.i64(e.qty).str(e.id)
  return out.bytes(w.rest).done()
}

/** BankInventoryComponent: Reiter mit Stapeln (Menge, Platzhalter, gesperrt, Item), Name, Tags */
interface Bank {
  defaultTab: number
  tabs: {
    head: Uint8Array // MaxStacks, Min-/MaxStackQuantity, zwei Schalter
    maxQty: number
    stacks: { qty: number; placeholder: boolean; locked: boolean; item: Id }[]
    name: string
    tags: { a: boolean; b: boolean; id: string }[]
  }[]
  rest: Uint8Array
}
function readBank(b: Uint8Array): Bank {
  const c = new Cursor(b)
  const defaultTab = c.i32()
  const tabs = Array.from({ length: c.i32() }, () => {
    const start = c.pos
    c.i32() // MaxStacks
    c.i32() // MinStackQuantity
    const maxQty = c.i32()
    c.bool()
    c.bool()
    const head = b.slice(start, c.pos)
    const stacks = Array.from({ length: c.i32() }, () => {
      const qty = c.i32()
      const placeholder = c.bool()
      const locked = c.bool()
      return { qty, placeholder, locked, item: c.str() }
    })
    const name = c.str()
    const tags = Array.from({ length: c.i32() }, () => ({ a: c.bool(), b: c.bool(), id: c.str() }))
    return { head, maxQty, stacks, name, tags }
  })
  return { defaultTab, tabs, rest: c.rest() }
}
function writeBank(bank: Bank) {
  const w = new Writer().i32(bank.defaultTab).i32(bank.tabs.length)
  for (const t of bank.tabs) {
    w.bytes(t.head).i32(t.stacks.length)
    for (const s of t.stacks) w.i32(s.qty).bool(s.placeholder).bool(s.locked).str(s.item)
    w.str(t.name).i32(t.tags.length)
    for (const g of t.tags) w.bool(g.a).bool(g.b).str(g.id)
  }
  return w.bytes(bank.rest).done()
}

/** ShopComponent: Anzeige-Schalter, dann Anzahl × (i32 gekauft, Kauf) */
interface Shop {
  head: Uint8Array
  bought: { id: Id; qty: number }[]
  rest: Uint8Array
}
function readShop(b: Uint8Array): Shop {
  const c = new Cursor(b)
  c.bool()
  c.bool()
  c.bool()
  c.i32()
  c.i32()
  const head = b.slice(0, c.pos)
  const bought = Array.from({ length: c.i32() }, () => {
    const qty = c.i32()
    return { id: c.str(), qty }
  })
  return { head, bought, rest: c.rest() }
}
function writeShop(s: Shop) {
  const w = new Writer().bytes(s.head).i32(s.bought.length)
  for (const b of s.bought) w.i32(b.qty).str(b.id)
  return w.bytes(s.rest).done()
}

// ---------------------------------------------------------------------------
// Änderungen

export interface SaveEdits {
  /** Währung → neue Menge */
  currencies?: Record<Id, number>
  /** Item → neue Menge in der Bank (0 = entfernen) */
  bank?: Record<Id, number>
  /** Skill → neue XP (das Level folgt daraus, gedeckelt) */
  xp?: Record<Id, number>
  /** Kauf → wie oft gekauft (0 = nicht gekauft) */
  purchases?: Record<Id, number>
}

/** Prüft den Rundlauf: Zerlegen und unverändert Zusammensetzen ergibt dieselben Bytes */
export function roundTrips(raw: Uint8Array): boolean {
  const back = joinSave(splitSave(raw))
  return back.length === raw.length && back.every((b, i) => b === raw[i])
}

/** Änderungen anwenden; gibt die neuen (unkomprimierten) Bytes zurück */
export function editSave(raw: Uint8Array, edits: SaveEdits, levelCap = MAX_LEVEL): Uint8Array {
  if (!roundTrips(raw)) throw new SaveError({ key: 'edit.noRoundTrip' })
  const tree = splitSave(raw)
  const head = new DataView(tree.head.buffer, tree.head.byteOffset, tree.head.byteLength)

  for (const [id, qty] of Object.entries(edits.currencies ?? {})) {
    const target = BigInt(Math.max(0, Math.round(qty)))
    // Die Börse, in der die Währung steht (sonst die mit Gold)
    const wallets = tree.entities.flatMap((e) => e.components.filter((c) => c.name === 'Wallet'))
    const comp = wallets.find((c) => readWallet(c.bytes).entries.some((x) => x.id === id)) ?? wallets.find((c) => readWallet(c.bytes).entries.some((x) => x.id === 'MelvorBase:GoldPieces'))
    if (!comp) throw new SaveError({ key: 'edit.missing', params: { what: id } })
    const w = readWallet(comp.bytes)
    const entry = w.entries.find((x) => x.id === id)
    if (entry) entry.qty = target
    else w.entries.push({ id, qty: target })
    comp.bytes = writeWallet(w)
    // Der Kopf nennt Gold und Slayer-Münzen für die Spielstand-Auswahl
    if (id === 'MelvorBase:GoldPieces') head.setBigInt64(tree.at.gold, target, true)
    if (id === 'MelvorBase:SlayerCoins') head.setBigInt64(tree.at.slayerCoins, target, true)
  }

  if (edits.bank && Object.keys(edits.bank).length) {
    const comp = component(tree, 'MelvorBase:Bank', 'Inventory')
    if (!comp) throw new SaveError({ key: 'edit.missing', params: { what: 'Bank' } })
    const bank = readBank(comp.bytes)
    for (const [item, wanted] of Object.entries(edits.bank)) {
      let left = Math.max(0, Math.round(wanted))
      // Vorhandene Stapel der Reihe nach füllen, übrige leeren; Platzhalter bleiben
      for (const tab of bank.tabs) {
        for (const s of tab.stacks) {
          if (s.item !== item || s.placeholder) continue
          s.qty = Math.min(left, tab.maxQty > 0 ? tab.maxQty : left)
          left -= s.qty
        }
        tab.stacks = tab.stacks.filter((s) => s.item !== item || s.placeholder || s.qty > 0)
      }
      if (left > 0) {
        const tab = bank.tabs[bank.defaultTab] ?? bank.tabs[0]
        if (!tab) throw new SaveError({ key: 'edit.missing', params: { what: 'Bank-Reiter' } })
        tab.stacks.push({ qty: Math.min(left, tab.maxQty > 0 ? tab.maxQty : left), placeholder: false, locked: false, item })
      }
    }
    comp.bytes = writeBank(bank)
  }

  if (edits.xp && Object.keys(edits.xp).length) {
    for (const [skill, xp] of Object.entries(edits.xp)) {
      const comp = component(tree, skill, 'Experience')
      if (!comp) throw new SaveError({ key: 'edit.missing', params: { what: skill } })
      const b = comp.bytes.slice()
      const d = new DataView(b.buffer)
      const value = Math.max(0, xp)
      d.setFloat64(0, value, true)
      d.setInt32(8, Math.min(levelCap, levelForXp(value)), true)
      comp.bytes = b
    }
    // Gesamtlevel im Kopf neu: Summe der Level aller Einheiten mit Erfahrung
    let total = 0
    for (const e of tree.entities) {
      const exp = e.components.find((c) => c.name === 'Experience')
      if (exp) total += new DataView(exp.bytes.buffer, exp.bytes.byteOffset).getInt32(8, true)
    }
    head.setInt32(tree.at.totalLevel, total, true)
  }

  if (edits.purchases && Object.keys(edits.purchases).length) {
    const comp = component(tree, 'MelvorBase:Shop', 'Shop')
    if (!comp) throw new SaveError({ key: 'edit.missing', params: { what: 'Shop' } })
    const shop = readShop(comp.bytes)
    for (const [id, qty] of Object.entries(edits.purchases)) {
      const n = Math.max(0, Math.round(qty))
      const entry = shop.bought.find((x) => x.id === id)
      if (entry) entry.qty = n
      else if (n > 0) shop.bought.push({ id, qty: n })
    }
    comp.bytes = writeShop(shop)
  }

  return joinSave(tree)
}

/** Base64 der Datei-Bytes = der Import-Text des Spiels */
export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
