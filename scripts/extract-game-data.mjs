#!/usr/bin/env node
// Liest Spieldaten und Icons aus der installierten Melvor-Idle-2-Installation
// (Godot-Paket `Melvor2.pck`) und schreibt sie aufbereitet nach public/game/.
//
//   pnpm extract                      # sucht die Steam-Installation selbst
//   pnpm extract -- /pfad/Melvor2.pck # oder ausdrücklich
//
// Die Ausgabe ist Eigentum von Games by Malcs / Jagex und steht in .gitignore.
//
// Die Zeit- und Ertragsformeln unten sind aus dem Spielcode der Demo 0.11.4
// nachgebaut (Grundwerte, ohne Boni) — Quelle steht jeweils am Rezepttyp.
// Zum Release: einfach neu laufen lassen. Taucht ein Objekttyp auf, der Items
// erzeugt und hier nicht behandelt wird, steht er am Ende als Warnung da.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const OUT_DIR = path.resolve(import.meta.dirname, '..', 'public', 'game')
const ICON_DIR = path.join(OUT_DIR, 'icons')

// ---------------------------------------------------------------------------
// Godot-Paket lesen

function findPck() {
  const arg = process.argv.slice(2).find((a) => !a.startsWith('-'))
  if (arg) return arg
  const steamRoots = [
    path.join(os.homedir(), 'Library/Application Support/Steam/steamapps/common'),
    path.join(os.homedir(), '.steam/steam/steamapps/common'),
    path.join(os.homedir(), '.local/share/Steam/steamapps/common'),
    'C:/Program Files (x86)/Steam/steamapps/common',
  ]
  // Vollversion vor Demo
  for (const game of ['Melvor Idle 2', 'Melvor Idle 2 Demo']) {
    for (const root of steamRoots) {
      for (const rel of ['Melvor2.app/Contents/Resources/Melvor2.pck', 'Melvor2.pck']) {
        const p = path.join(root, game, rel)
        if (fs.existsSync(p)) return p
      }
    }
  }
  throw new Error('Melvor2.pck nicht gefunden — Pfad als Argument übergeben.')
}

class Pck {
  constructor(file) {
    this.fd = fs.openSync(file, 'r')
    const head = this.read(0, 40)
    if (head.toString('ascii', 0, 4) !== 'GDPC') throw new Error('Kein Godot-Paket')
    this.format = head.readUInt32LE(4)
    this.godot = `${head.readUInt32LE(8)}.${head.readUInt32LE(12)}.${head.readUInt32LE(16)}`
    const flags = head.readUInt32LE(20)
    if (flags & 1) throw new Error('Paketverzeichnis ist verschlüsselt')
    if (this.format < 3) throw new Error(`Paketformat ${this.format} wird nicht unterstützt`)
    this.base = Number(head.readBigUInt64LE(24))
    const dirOffset = Number(head.readBigUInt64LE(32))

    this.files = new Map()
    const count = this.read(dirOffset, 4).readUInt32LE(0)
    let pos = dirOffset + 4
    for (let i = 0; i < count; i++) {
      const len = this.read(pos, 4).readUInt32LE(0)
      const entry = this.read(pos + 4, len + 36)
      const name = entry.toString('utf8', 0, len).replace(/\0+$/, '')
      const offset = Number(entry.readBigUInt64LE(len))
      const size = Number(entry.readBigUInt64LE(len + 8))
      const fileFlags = entry.readUInt32LE(len + 32)
      this.files.set(name, { offset, size, encrypted: (fileFlags & 1) !== 0 })
      pos += 4 + len + 36
    }
  }

  read(offset, length) {
    const buf = Buffer.alloc(length)
    fs.readSync(this.fd, buf, 0, length, offset)
    return buf
  }

  file(name) {
    const f = this.files.get(name)
    if (!f) return null
    if (f.encrypted) throw new Error(`${name} ist verschlüsselt`)
    return this.read(this.base + f.offset, f.size)
  }
}

// `res://Assets/Items/X.png` → Bild-Bytes der ersten Mip-Stufe aus der .ctex
function textureBytes(pck, resPath) {
  const rel = resPath.replace(/^res:\/\//, '')
  const imp = pck.file(rel + '.import')
  if (!imp) return null
  const m = imp.toString('utf8').match(/path(?:\.\w+)?="res:\/\/([^"]+\.ctex)"/)
  if (!m) return null
  const ctex = pck.file(m[1])
  if (!ctex || ctex.toString('ascii', 0, 4) !== 'GST2') return null
  const dataFormat = ctex.readUInt32LE(0x24) // 1 = PNG, 2 = WebP
  if (dataFormat !== 1 && dataFormat !== 2) return null
  const size = ctex.readUInt32LE(0x34)
  return { bytes: ctex.subarray(0x38, 0x38 + size), ext: dataFormat === 1 ? 'png' : 'webp' }
}

// ---------------------------------------------------------------------------
// Daten aufbereiten

const pckPath = findPck()
const pck = new Pck(pckPath)
console.log(`Paket: ${pckPath}\nGodot ${pck.godot}, Format ${pck.format}, ${pck.files.size} Dateien`)

const packages = [...pck.files.keys()].filter((f) => /^Data\/Packages\/[^/]+\.json$/.test(f)).sort()
if (!packages.length) throw new Error('Keine Datenpakete (Data/Packages/*.json) gefunden')

// Mehrere Pakete: spätere überschreiben frühere je Typ + Id
const objects = {}
const entityConfig = {}
for (const p of packages) {
  const pkg = JSON.parse(pck.file(p).toString('utf8'))
  const ns = pkg.Namespace
  for (const [type, list] of Object.entries(pkg.Objects ?? {})) {
    const byId = (objects[type] ??= new Map())
    for (const o of list) byId.set(`${ns}:${o.Id}`, o)
  }
  Object.assign(entityConfig, pkg.EntityConfig ?? {})
  console.log(`Datenpaket ${p} (${ns})`)
}
const all = (type) => [...(objects[type] ?? new Map()).entries()]
const handled = new Set()
const each = (type, fn) => {
  handled.add(type)
  for (const [id, o] of all(type)) fn(id, o)
}

const icons = new Set()
const icon = (res) => {
  if (!res || typeof res !== 'string') return null
  icons.add(res)
  return iconUrl(res)
}
const iconUrl = (res) => 'game/icons/' + res.replace(/^res:\/\/(Assets\/)?/, '').replace(/\.\w+$/, '.webp')

const isDemoLocked = (o) =>
  JSON.stringify(o.Requirements ?? []).includes('DemoLocked') ||
  JSON.stringify(o.Products ?? o.Product ?? o.Provides ?? []).includes('DemoPlaceholderItem')

const short = (id) => String(id).replace(/^MelvorBase:/, '')

// Anforderungen strukturiert: Level, Shop-Kauf, sonst lesbarer Text.
// `skill`/`level` = die höchste Level-Anforderung (für Tabellen).
function requirements(o) {
  const reqs = []
  let skill = null
  let level = 0
  for (const r of o.Requirements ?? []) {
    const d = r.Data ?? {}
    if (r.Type === 'MelvorBase:Level') {
      const s = d.Component?.Entity
      reqs.push({ type: 'level', skill: s, level: d.Level })
      if (d.Level >= level) {
        skill = s
        level = d.Level
      }
    } else if (r.Type === 'MelvorBase:ShopPurchase') {
      const sp = objects.ShopPurchase?.get(d.ShopPurchase)
      reqs.push({ type: 'purchase', purchase: d.ShopPurchase, name: sp?.DisplayName ?? short(d.ShopPurchase) })
    } else if (r.Type === 'MelvorBase:DemoLocked') {
      // eigenes Feld demoLocked
    } else if (r.Type === 'MelvorBase:ToolbeltItemEquipped' && d.Item) {
      reqs.push({ type: 'item', item: d.Item })
    } else {
      const detail = d.Quest ?? d.Item ?? d.Enemy ?? d.Statistic ?? d.Animal ?? null
      reqs.push({ type: 'other', text: short(r.Type) + (detail ? `: ${short(detail)}` : '') })
    }
  }
  return { reqs, skill, level }
}

const qtyList = (list) => (list ?? []).map((i) => ({ item: i.Item, qty: i.Quantity }))
const costList = (list) => (list ?? []).map((c) => ({ currency: c.Currency, qty: c.Quantity }))
const products = (list) => (list ?? []).map((p) => ({ item: p.Item, qty: p.Quantity, chance: p.Chance ?? 1 }))

// Artisan-Rezepte gehören über die Rezeptliste der Skill-Konfiguration zu einem Skill
const recipeSkill = new Map()
for (const [entity, cfg] of Object.entries(entityConfig)) {
  for (const r of cfg.Recipes ?? []) if (!recipeSkill.has(r.Id)) recipeSkill.set(r.Id, entity)
}

const recipes = []
function push(type, id, o, fields) {
  const req = requirements(o)
  recipes.push({
    id: `${type}:${id}`,
    name: o.DisplayName,
    icon: null,
    skill: req.skill,
    level: req.level,
    reqs: req.reqs,
    inputs: [],
    costs: [],
    outputs: [],
    timeMs: 0,
    xp: o.BaseExperience ?? 0,
    demoLocked: isDemoLocked(o),
    ...fields,
  })
  const r = recipes.at(-1)
  // Rezepte ohne eigenes Symbol zeigen ihr Ergebnis
  if (!r.icon && r.outputs[0]) r.icon = icon(objects.Item.get(r.outputs[0].item)?.Icon)
}

// Artisan + Kochen: ein Durchlauf = Intervall × Schritte (ArtisanActionComponent,
// RecipeHealth = max(1, Steps)). XP gibt es je erfolgreichem Durchlauf.
// Kochen: Erfolg = clamp((69 + Level) / (69 + Schwierigkeit)) (CookingActionStats),
// Zutaten gehen auch beim Misserfolg weg.
for (const type of ['ArtisanRecipe', 'CookingRecipe']) {
  each(type, (id, o) => {
    const cooking = type === 'CookingRecipe'
    push(type, id, o, {
      kind: cooking ? 'cooking' : 'artisan',
      icon: icon(o.Icon),
      skill: recipeSkill.get(id) ?? requirements(o).skill ?? (cooking ? 'MelvorBase:Cooking' : null),
      inputs: qtyList(o.Ingredients?.Items),
      costs: costList(o.Ingredients?.Currencies),
      outputs: products(o.Products),
      timeMs: o.BaseInterval * Math.max(1, o.Steps ?? 1),
      ...(cooking ? { success: { kind: 'cooking', difficulty: o.Difficulty ?? 0 } } : {}),
    })
  })
}

// Kräuterkunde: Vorbereiten → Erhitzen → Rühren → Abfüllen nacheinander
// (HerbloreActionComponent.GetIntervalForRecipeState), XP am Ende.
each('HerbloreRecipe', (id, o) => {
  push('HerbloreRecipe', id, o, {
    kind: 'artisan',
    icon: icon(o.Icon),
    skill: 'MelvorBase:Herblore',
    inputs: qtyList(o.Ingredients?.Items),
    costs: costList(o.Ingredients?.Currencies),
    outputs: products(o.Products),
    timeMs: (o.BasePreparingInterval ?? 0) + (o.BaseHeatingInterval ?? 0) + (o.BaseStirringInterval ?? 0) + (o.BaseBottlingInterval ?? 0),
  })
})

// Holzfällen: jeder Schlag ein Intervall, der Baum fällt nach BaseMaxHealth
// Schlägen (WoodcuttingActionComponent) — erst dann gibt es Holz und XP.
each('WoodcuttingRecipe', (id, o) => {
  push('WoodcuttingRecipe', id, o, {
    kind: 'woodcutting',
    icon: icon(o.Media),
    skill: 'MelvorBase:Woodcutting',
    level: o.Level ?? requirements(o).level,
    outputs: [{ item: o.Product.Item, qty: o.Product.Quantity, chance: 1 }],
    timeMs: o.BaseInterval * Math.max(1, o.BaseMaxHealth ?? 1),
  })
})

// Bergbau: je Schlag mit Chance p sofort fertig, sonst Fortschritt += p; bei
// ≥ 0,9999 fertig (MiningActionComponent). Erwartete Schläge = (1 − (1−p)^n) / p.
each('MiningRecipe', (id, o) => {
  const p = o.BaseProductChance ?? 1
  const n = Math.ceil(0.9999 / p - 1e-9)
  const hits = p >= 1 ? 1 : (1 - (1 - p) ** n) / p
  push('MiningRecipe', id, o, {
    kind: 'mining',
    icon: icon(o.Media),
    skill: 'MelvorBase:Mining',
    outputs: [{ item: o.Product.Item, qty: o.Product.Quantity, chance: 1 }],
    timeMs: o.BaseInterval * hits,
  })
})

// Angeln: Intervall gleichverteilt zwischen Min und Max; mit FishChance ein
// Fisch, gewichtet unter RandomProducts, sonst Müll. XP je Wurf.
each('FishingRecipe', (id, o) => {
  const total = (o.RandomProducts ?? []).reduce((s, p) => s + p.Weight, 0) || 1
  const location = objects.FishingLocation?.get(o.Location)
  const first = o.RandomProducts?.[0] && objects.Item.get(o.RandomProducts[0].Item)
  push('FishingRecipe', id, o, {
    kind: 'fishing',
    name: location ? `${o.DisplayName} (${location.DisplayName})` : o.DisplayName,
    icon: icon(first?.Icon ?? o.Icon),
    skill: 'MelvorBase:Fishing',
    outputs: (o.RandomProducts ?? []).map((p) => ({
      item: p.Item,
      qty: (p.MinQuantity + p.MaxQuantity) / 2,
      chance: (o.FishChance ?? 1) * (p.Weight / total),
    })),
    timeMs: ((o.BaseMinInterval ?? 0) + (o.BaseMaxInterval ?? 0)) / 2,
  })
})

// Feuermachen: verbrennt Holz, Nebenprodukte (Asche, Kohle) mit Chance.
each('FiremakingRecipe', (id, o) => {
  push('FiremakingRecipe', id, o, {
    kind: 'firemaking',
    name: `${o.DisplayName} verbrennen`,
    icon: icon(o.Icon),
    skill: 'MelvorBase:Firemaking',
    inputs: qtyList(o.Ingredients?.Items),
    costs: costList(o.Ingredients?.Currencies),
    outputs: products(o.Products),
    timeMs: o.BaseInterval,
    currencyOutputs: o.CurrencyReward
      ? [{ currency: o.CurrencyReward.Currency, qty: o.CurrencyReward.Quantity ?? ((o.CurrencyReward.MinQuantity ?? 0) + (o.CurrencyReward.MaxQuantity ?? 0)) / 2, chance: 1 }]
      : undefined,
  })
})

// Thieving: Erfolg = min(1, (100 + Level) / (100 + Wahrnehmung))
// (ThievingActionStats); Fehlschlag = 2 s Betäubung obendrauf, keine Beute,
// keine XP. Beute bei Erfolg: Gold mit Chance, gewöhnliche/seltene Tabelle.
each('ThievingRecipe', (id, o) => {
  const table = (rows, chance) => {
    const total = (rows ?? []).reduce((s, r) => s + r.Weight, 0) || 1
    return (rows ?? []).map((r) => ({ item: r.Item, qty: (r.MinQuantity + r.MaxQuantity) / 2, chance: chance * (r.Weight / total) }))
  }
  const cr = o.CurrencyReward
  push('ThievingRecipe', id, o, {
    kind: 'thieving',
    icon: icon(o.Media),
    skill: 'MelvorBase:Thieving',
    outputs: [...table(o.CommonDropTable, o.BaseCommonLootChance ?? 0), ...table(o.RareDropTable, o.BaseRareLootChance ?? 0)],
    currencyOutputs: cr ? [{ currency: cr.Currency, qty: (cr.MinQuantity + cr.MaxQuantity) / 2, chance: o.BaseCurrencyLootChance ?? 1 }] : [],
    timeMs: o.BaseInterval,
    success: { kind: 'thieving', perception: o.Perception ?? 0, stunMs: 2000 },
  })
})

// Farming: Wachstum ist Wartezeit, kein aktives Tun. Ertrag je Feld.
each('FarmingRecipe', (id, o) => {
  push('FarmingRecipe', id, o, {
    kind: 'farming',
    icon: icon(o.Icon),
    skill: 'MelvorBase:Farming',
    inputs: qtyList(o.Ingredients?.Items),
    costs: costList(o.Ingredients?.Currencies),
    outputs: [{ item: o.Product.Item, qty: o.Product.Quantity, chance: 1 }],
    timeMs: o.BaseInterval,
    passive: true,
  })
})

each('GrainMillRecipe', (id, o) => {
  push('GrainMillRecipe', id, o, {
    kind: 'mill',
    icon: icon(o.Icon),
    inputs: qtyList(o.Ingredients?.Items),
    costs: costList(o.Ingredients?.Currencies),
    outputs: [{ item: o.Product.Item, qty: o.Product.Quantity, chance: 1 }],
  })
})

// Shop: jeder Kauf ist eine Freischaltung; die, die Items liefern, zusätzlich
// eine Item-Quelle.
const purchases = []
each('ShopPurchase', (id, o) => {
  const req = requirements(o)
  const items = qtyList(o.Provides?.Items)
  purchases.push({
    id,
    name: o.DisplayName,
    icon: icon(o.Icon),
    description: o.Description ?? null,
    category: objects.ShopSubcategory?.get(o.Subcategory)?.DisplayName ?? (o.Subcategory ? short(o.Subcategory) : null),
    costs: costList(o.Costs?.Currencies),
    inputs: qtyList(o.Costs?.Items),
    reqs: req.reqs,
    items,
    buyLimit: o.DefaultBuyLimit || null,
    demoLocked: isDemoLocked(o),
  })
  if (items.length) {
    push('ShopPurchase', id, o, {
      kind: 'shop',
      icon: icon(o.Icon),
      inputs: qtyList(o.Costs?.Items),
      costs: costList(o.Costs?.Currencies),
      outputs: items.map((i) => ({ ...i, chance: 1 })),
      xp: 0,
      purchase: id,
    })
  }
})

each('ItemUpgrade', (id, o) => {
  const item = objects.Item.get(o.UpgradedItem)
  push('ItemUpgrade', id, o, {
    kind: 'upgrade',
    name: item?.DisplayName?.Singular ?? short(id),
    icon: icon(item?.Icon),
    inputs: qtyList(o.Costs?.Items),
    costs: costList(o.Costs?.Currencies),
    outputs: [{ item: o.UpgradedItem, qty: o.QuantityPerUpgrade ?? 1, chance: 1 }],
    xp: 0,
  })
})

// Items
handled.add('Item')
const items = all('Item')
  .filter(([id]) => !id.endsWith(':DemoPlaceholderItem'))
  .map(([id, o]) => ({
    id,
    name: o.DisplayName?.Singular ?? o.DisplayName ?? short(id),
    icon: icon(o.Icon),
    sells: o.SellsFor ? { currency: o.SellsFor.Currency, qty: o.SellsFor.Quantity } : null,
  }))

// Skills: Navigationseinträge tragen Namen und Symbol
const skillIds = new Set(recipes.map((r) => r.skill).filter(Boolean))
for (const [entity, cfg] of Object.entries(entityConfig)) if (cfg.MasteryGuildRanks) skillIds.add(entity)
const nav = new Map(all('SkillNavigationOption').map(([, o]) => [o.Entity, o]))
const skills = [...skillIds].sort().map((id) => {
  const n = nav.get(id)
  const s = short(id)
  const fallback = [`${s}.png`, `${s}_64.png`].find((f) => pck.files.has(`Assets/Icons/${f}.import`))
  return { id, name: n?.DisplayName ?? s, icon: icon(n?.Icon ?? (fallback ? `res://Assets/Icons/${fallback}` : null)) }
})

const currencies = all('Currency').map(([id, o]) => ({ id, name: o.DisplayName, short: o.DisplayNameShort, icon: icon(o.Icon) }))
handled.add('Currency')

// Ein paar Spiel-Symbole für die Oberfläche
for (const name of ['Bank', 'Milestones', 'CompletionLog', 'GuideBook', 'Mastery_Icon', 'CheckeredFlag', 'Ingredient', 'Shop', 'Quests']) {
  if (pck.files.has(`Assets/Icons/${name}.png.import`)) icon(`res://Assets/Icons/${name}.png`)
}

// Was erzeugt Items, wird hier aber nicht gerechnet? (Hinweis fürs Release)
const unhandled = Object.entries(objects)
  .filter(([type, byId]) => !handled.has(type) && [...byId.values()].some((o) => /"(Products?|RandomProducts|DropTable|Loot\w*|Provides)"/.test(JSON.stringify(o))))
  .map(([type, byId]) => `${type} (${byId.size})`)

// ---------------------------------------------------------------------------
// Schreiben

fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(ICON_DIR, { recursive: true })

let written = 0
const missing = []
for (const res of icons) {
  const tex = textureBytes(pck, res)
  if (!tex) {
    missing.push(res)
    continue
  }
  const out = path.join(OUT_DIR, '..', iconUrl(res).replace(/\.webp$/, '.' + tex.ext))
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, tex.bytes)
  written++
}

const plist = pckPath.includes('.app/') ? path.join(pckPath.split('.app/')[0] + '.app', 'Contents/Info.plist') : null
const version =
  plist && fs.existsSync(plist)
    ? fs.readFileSync(plist, 'utf8').match(/CFBundleShortVersionString<\/key>\s*<string>([^<]+)/)?.[1]
    : undefined

const data = {
  meta: {
    packages: packages.map((p) => path.basename(p, '.json')),
    gameVersion: version ?? null,
    godot: pck.godot,
    extractedAt: new Date().toISOString(),
  },
  currencies,
  skills,
  items,
  recipes,
  purchases,
}
fs.writeFileSync(path.join(OUT_DIR, 'data.json'), JSON.stringify(data))

const locked = recipes.filter((r) => r.demoLocked).length
console.log(
  `${items.length} Items, ${recipes.length} Rezepte (${locked} gesperrt), ${purchases.length} Shop-Käufe, ` +
    `${skills.length} Skills, ${written} Icons` +
    (missing.length ? `, ${missing.length} Icons ohne Textur` : ''),
)
if (unhandled.length) console.warn(`⚠︎ Noch nicht gerechnet (erzeugen Items): ${unhandled.join(', ')}`)
