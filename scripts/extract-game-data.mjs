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
// `base` hält die Rohwerte; src/core/bonuses.ts rechnet daraus mit Boni neu.
// Zum Release: einfach neu laufen lassen. Taucht ein Objekttyp auf, der Items
// erzeugt und hier nicht behandelt wird, steht er am Ende als Warnung da.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseScene, tutorialOf } from './godot-scene.mjs'

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
    ref: id,
    category: o.Category ?? null,
    subcategory: o.Subcategory ?? null,
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
      base: { interval: o.BaseInterval, steps: o.Steps ?? 0 },
      ...(cooking ? { success: { kind: 'cooking', difficulty: o.Difficulty ?? 0 } } : {}),
    })
  })
}

// Kräuterkunde: Vorbereiten → Erhitzen → Rühren → zehnmal Abfüllen
// (HerbloreActionStats.Interval = p + h + s + b × 10), XP am Ende.
each('HerbloreRecipe', (id, o) => {
  push('HerbloreRecipe', id, o, {
    kind: 'artisan',
    icon: icon(o.Icon),
    skill: 'MelvorBase:Herblore',
    inputs: qtyList(o.Ingredients?.Items),
    costs: costList(o.Ingredients?.Currencies),
    outputs: products(o.Products),
    timeMs: (o.BasePreparingInterval ?? 0) + (o.BaseHeatingInterval ?? 0) + (o.BaseStirringInterval ?? 0) + (o.BaseBottlingInterval ?? 0) * 10,
    base: {
      preparing: o.BasePreparingInterval ?? 0,
      heating: o.BaseHeatingInterval ?? 0,
      stirring: o.BaseStirringInterval ?? 0,
      bottling: o.BaseBottlingInterval ?? 0,
    },
  })
})

// Zufallsprodukte je Schlag (Vogelnest, Geode) bzw. je gefälltem Baum
// (Baumsamen) — WoodcuttingActionStats.OnHitItemChances / OnCutItemChances.
// Je Schlag: Erwartung je Durchlauf = Chance × Schläge, `perHit` hält die
// Chance für das Neurechnen mit Boni (andere Schlagzahl).
const perHit = (list, hits) =>
  (list ?? []).map((p) => ({ item: p.Item, qty: p.Quantity, chance: Math.min(1, p.Chance * hits), perHit: p.Chance, extra: true }))
const perRun = (list) => (list ?? []).map((p) => ({ item: p.Item, qty: p.Quantity, chance: p.Chance, extra: true }))

// Holzfällen: jeder Schlag ein Intervall, der Baum fällt nach BaseMaxHealth
// Schlägen (WoodcuttingActionComponent) — erst dann gibt es Holz und XP.
each('WoodcuttingRecipe', (id, o) => {
  const hits = Math.max(1, o.BaseMaxHealth ?? 1)
  push('WoodcuttingRecipe', id, o, {
    kind: 'woodcutting',
    icon: icon(o.Media),
    skill: 'MelvorBase:Woodcutting',
    level: o.Level ?? requirements(o).level,
    outputs: [{ item: o.Product.Item, qty: o.Product.Quantity, chance: 1 }, ...perHit(o.RandomProductsPerHit, hits), ...perRun(o.RandomProductsPerCut)],
    timeMs: o.BaseInterval * Math.max(1, o.BaseMaxHealth ?? 1),
    base: { interval: o.BaseInterval, maxHealth: o.BaseMaxHealth ?? 1 },
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
    outputs: [{ item: o.Product.Item, qty: o.Product.Quantity, chance: 1 }, ...perHit(o.RandomProductsPerHit, hits)],
    timeMs: o.BaseInterval * hits,
    base: { interval: o.BaseInterval, productChance: p },
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
      share: p.Weight / total,
      table: 'fish',
    })),
    timeMs: ((o.BaseMinInterval ?? 0) + (o.BaseMaxInterval ?? 0)) / 2,
    base: { minInterval: o.BaseMinInterval ?? 0, maxInterval: o.BaseMaxInterval ?? 0, fishChance: o.FishChance ?? 1 },
    location: o.Location ?? null,
  })
})

// Feuermachen: verbrennt Holz, Nebenprodukte (Asche, Kohle) mit Chance.
each('FiremakingRecipe', (id, o) => {
  push('FiremakingRecipe', id, o, {
    kind: 'firemaking',
    icon: icon(o.Icon),
    skill: 'MelvorBase:Firemaking',
    inputs: qtyList(o.Ingredients?.Items),
    costs: costList(o.Ingredients?.Currencies),
    outputs: products(o.Products),
    timeMs: o.BaseInterval,
    base: { interval: o.BaseInterval, steps: 1 },
    currencyOutputs: o.CurrencyReward
      ? [{ currency: o.CurrencyReward.Currency, qty: o.CurrencyReward.Quantity ?? ((o.CurrencyReward.MinQuantity ?? 0) + (o.CurrencyReward.MaxQuantity ?? 0)) / 2, chance: 1 }]
      : undefined,
  })
})

// Thieving: Erfolg = min(1, (100 + Level) / (100 + Wahrnehmung))
// (ThievingActionStats); Fehlschlag = 2 s Betäubung obendrauf, keine Beute,
// keine XP. Beute bei Erfolg: Gold mit Chance, gewöhnliche/seltene Tabelle.
each('ThievingRecipe', (id, o) => {
  const table = (rows, chance, name) => {
    const total = (rows ?? []).reduce((s, r) => s + r.Weight, 0) || 1
    return (rows ?? []).map((r) => ({
      item: r.Item,
      qty: (r.MinQuantity + r.MaxQuantity) / 2,
      chance: chance * (r.Weight / total),
      share: r.Weight / total,
      table: name,
    }))
  }
  const cr = o.CurrencyReward
  push('ThievingRecipe', id, o, {
    kind: 'thieving',
    icon: icon(o.Media),
    skill: 'MelvorBase:Thieving',
    outputs: [...table(o.CommonDropTable, o.BaseCommonLootChance ?? 0, 'common'), ...table(o.RareDropTable, o.BaseRareLootChance ?? 0, 'rare')],
    currencyOutputs: cr ? [{ currency: cr.Currency, qty: (cr.MinQuantity + cr.MaxQuantity) / 2, chance: o.BaseCurrencyLootChance ?? 1 }] : [],
    timeMs: o.BaseInterval,
    success: { kind: 'thieving', perception: o.Perception ?? 0, stunMs: 2000 },
    base: {
      interval: o.BaseInterval,
      perception: o.Perception ?? 0,
      currencyChance: o.BaseCurrencyLootChance ?? 1,
      commonChance: o.BaseCommonLootChance ?? 0,
      rareChance: o.BaseRareLootChance ?? 0,
    },
    recipeType: o.RecipeType ?? null,
  })
})

// Farming: Wachstum ist Wartezeit, kein aktives Tun. Ertrag je Feld, gemindert
// um Krankheit + Schädlinge über dem Schutz (FarmingActionStats.Product):
// Menge × (1 − (max(0, Schädlinge − Schutz) + max(0, Krankheit − Schutz)) / 100).
each('FarmingRecipe', (id, o) => {
  const cat = objects.FarmingCategory?.get(o.Category)
  const disease = cat?.AttractsDisease ? (o.DiseaseValueAdjuster ?? 0) + (cat.DiseaseValueAdjuster ?? 0) : 0
  const pest = cat?.AttractsPests ? (o.PestValueAdjuster ?? 0) + (cat.PestValueAdjuster ?? 0) : 0
  const adjust = 1 - (Math.max(0, pest) + Math.max(0, disease)) / 100
  push('FarmingRecipe', id, o, {
    kind: 'farming',
    icon: icon(o.Icon),
    skill: 'MelvorBase:Farming',
    inputs: qtyList(o.Ingredients?.Items),
    costs: costList(o.Ingredients?.Currencies),
    outputs: [{ item: o.Product.Item, qty: Math.max(1, Math.trunc(o.Product.Quantity * adjust)), chance: 1 }],
    timeMs: o.BaseInterval,
    passive: true,
    base: { interval: o.BaseInterval, productQty: o.Product.Quantity, disease, pest },
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
// eine Item-Quelle. Im Spiel steht nur im Shop, was seine Shop-Liste nennt —
// der Rest (Cowhide, Grain Starter Pack, alte Äxte …) ist nicht zu kaufen und
// gilt hier als gesperrt, ohne Item-Quelle.
const listedPurchases = new Set((entityConfig['MelvorBase:Shop']?.Purchases ?? []).map((p) => p.Id))
const purchases = []
each('ShopPurchase', (id, o) => {
  const req = requirements(o)
  const items = qtyList(o.Provides?.Items)
  const unlisted = !listedPurchases.has(id)
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
    demoLocked: isDemoLocked(o) || unlisted,
    ...(unlisted ? { unlisted: true } : {}),
  })
  if (items.length && !unlisted) {
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

// Boni: Shop-Käufe, Werkzeuge im Werkzeuggürtel, Gilden-Ränge. Nur, was
// Skilling betrifft und immer gilt (ohne Bedingung/Fremdkontext — die sind
// Kampf-Situationen). Globale Gruppen fließen im Spiel in die Werte jedes
// Skills ein (ModifiableStat-Gruppen „GlobalPercentActionInterval" …).
const SKILL_STATS = new Set([
  'ArtisanAction', 'CookingAction', 'WoodcuttingAction', 'MiningAction', 'FishingAction',
  'ThievingAction', 'FiremakingAction', 'HerbloreAction', 'FarmingAction', 'Experience',
])
const GLOBAL_STATS = new Set(['GlobalPercentActionInterval', 'GlobalFlatActionInterval', 'GlobalPercentXpGained'])
function bonusMods(bonuses) {
  const out = []
  for (const g of bonuses?.Global ?? []) {
    if (GLOBAL_STATS.has(g.StatGroup) && !g.Condition) out.push({ stats: 'Global', stat: g.StatGroup, value: g.Value })
  }
  for (const c of bonuses?.Component ?? []) {
    const type = short(c.Stat?.StatsType ?? '')
    if (!SKILL_STATS.has(type) || c.Condition || c.FromContext || c.Scaling) continue
    const lc = c.LocalContext ?? {}
    const m = { stats: type, stat: c.Stat.Name, value: c.Value }
    if (lc.Component?.Entity) m.entity = lc.Component.Entity
    for (const k of ['Recipe', 'Category', 'Subcategory', 'Location', 'Item', 'RecipeType']) if (lc[k]) m[k.toLowerCase()] = lc[k]
    out.push(m)
  }
  return out
}
const bonusSources = []
for (const [id, o] of all('ShopPurchase')) {
  const mods = bonusMods(o.Provides?.Bonuses)
  if (mods.length) bonusSources.push({ id, kind: 'purchase', name: o.DisplayName, icon: icon(o.Icon), mods })
}
for (const [id, o] of all('Item')) {
  const tool = o.Capabilities?.['MelvorBase:Toolbelt']
  const mods = bonusMods(tool?.Bonuses)
  if (mods.length) {
    bonusSources.push({ id, kind: 'item', name: o.DisplayName?.Singular ?? short(id), icon: icon(o.Icon), slot: tool.FitsInSlot ?? null, mods })
  }
}
handled.add('MasteryGuildBonus')
for (const [id, o] of all('MasteryGuildBonus')) {
  const req = (o.Requirements ?? []).find((q) => q.Type === 'MelvorBase:MasteryGuildRank')
  const mods = bonusMods(o.Rewards?.Bonuses)
  if (req && mods.length) {
    bonusSources.push({ id, kind: 'guild', name: o.DisplayName, icon: null, skill: req.Data.Component.Entity, rank: req.Data.Rank, mods })
  }
}
// Item-Details für die Detailseite: Beschreibung, Bank-Reiter, Ausrüstung,
// Waffe, Nahrung, Truhe, Vergraben, Werkzeug/Köder/Kompost/Falle
const ratingList = (list) =>
  (list ?? []).map((x) => {
    const key = Object.keys(x).find((k) => k !== 'Value' && typeof x[k] === 'string')
    return { name: short(x[key] ?? key ?? '?'), value: x.Value ?? x.Quantity ?? 0 }
  })
const itemById = new Map(items.map((i) => [i.id, i]))
for (const [id, o] of all('Item')) {
  const it = itemById.get(id)
  if (!it) continue
  const c = o.Capabilities ?? {}
  if (o.Description) it.description = o.Description
  const tags = (o.BankTags ?? []).map((t) => ({ tag: t.BankTag, product: !!t.IsProduct, ingredient: !!t.IsIngredient }))
  if (tags.length) it.bankTags = tags
  const eq = c['MelvorBase:Equipment']
  if (eq) {
    it.equipment = {
      type: short(eq.Type ?? ''),
      stats: ratingList(eq.Stats?.Stats),
      power: ratingList(eq.Stats?.PowerRatings),
      protection: ratingList(eq.Stats?.ProtectionRatings),
      reqs: requirements({ Requirements: eq.Requirements }).reqs,
      mods: bonusMods(eq.Bonuses),
      // Für die Kampf-Simulation: belegte Nebenplätze, Spezialangriffe, Munition
      ...(eq.OccupiesSlots?.length ? { occupies: eq.OccupiesSlots.map(short) } : {}),
      ...(eq.Attacks?.length ? { attacks: eq.Attacks.map((a) => ({ attack: short(a.Attack), chance: a.Chance })) } : {}),
      ...(eq.AmmoType ? { ammoType: short(eq.AmmoType) } : {}),
      ...(eq.CanEquipQuantity ? { stack: true } : {}),
    }
  }
  const wp = c['MelvorBase:Weapon']
  if (wp) it.weapon = { type: short(wp.Type ?? ''), damage: short(wp.DamageType ?? ''), elements: (wp.Elements ?? []).map(short), ammo: wp.RequiredAmmoType ? short(wp.RequiredAmmoType) : null }
  if (c['MelvorBase:Food']) it.food = { healing: c['MelvorBase:Food'].BaseHealing ?? 0 }
  if (c['MelvorBase:Bury']?.CurrencyGain) it.bury = { currency: c['MelvorBase:Bury'].CurrencyGain.Currency, qty: c['MelvorBase:Bury'].CurrencyGain.Quantity }
  if (c['MelvorBase:HuntingTrap']) it.trap = { type: short(c['MelvorBase:HuntingTrap'].TrapType ?? '') }
  const tool = c['MelvorBase:Toolbelt']
  if (tool) it.toolbelt = { slot: short(tool.FitsInSlot ?? ''), mods: bonusMods(tool.Bonuses), reqs: requirements({ Requirements: tool.Requirements }).reqs }
  if (c['MelvorBase:FishingBait']) it.bait = { mods: bonusMods(c['MelvorBase:FishingBait'].Bonuses) }
  if (c['MelvorBase:Compost']) it.compost = { mods: bonusMods({ Component: c['MelvorBase:Compost'].CompostModifierTemplate }) }
  const op = c['MelvorBase:Openable']
  if (op) {
    const total = (op.DropTable ?? []).reduce((n, d) => n + d.Weight, 0) || 1
    it.openable = {
      always: qtyList(op.AlwaysDrops),
      drops: (op.DropTable ?? []).map((d) => ({ item: d.Item, min: d.MinQuantity, max: d.MaxQuantity, chance: d.Weight / total })),
    }
  }
}

// Quellen, die der Planer (noch) nicht rechnet — für die Detailseite:
// Monster-Beute, Hunting, Ranching, Truhen
const infoSources = []
const tableShare = (rows) => {
  const total = (rows ?? []).reduce((n, r) => n + (r.Weight ?? 0), 0) || 1
  return (rows ?? []).map((r) => ({ ...r, share: (r.Weight ?? 0) / total }))
}
handled.add('Enemy')
for (const [id, e] of all('Enemy')) {
  if (JSON.stringify(e.Drops ?? {}).includes('DemoPlaceholder')) continue
  const name = typeof e.DisplayName === 'string' ? e.DisplayName : e.DisplayName?.Singular ?? short(id)
  for (const f of e.Drops?.FixedItems ?? []) infoSources.push({ item: f.Item, via: 'enemy', from: id, name, min: f.MinQuantity, max: f.MaxQuantity, chance: 1 })
  for (const t of e.Drops?.ItemTables ?? []) {
    for (const r of tableShare(t.Table)) infoSources.push({ item: r.Item, via: 'enemy', from: id, name, min: r.MinQuantity, max: r.MaxQuantity, chance: (t.Chance ?? 1) * r.share })
  }
}
handled.add('HuntingAnimal')
for (const [id, a] of all('HuntingAnimal')) {
  const name = typeof a.DisplayName === 'string' ? a.DisplayName : a.DisplayName?.Singular ?? short(id)
  const lv = requirements(a).level
  for (const p of a.Products ?? []) infoSources.push({ item: p.Item, via: 'hunting', name, icon: icon(a.Icon), min: p.Quantity, max: p.Quantity, chance: p.Chance ?? 1, level: lv })
  for (const p of a.SurveyingProducts ?? []) infoSources.push({ item: p.Item, via: 'survey', name, icon: icon(a.Icon), min: p.Quantity, max: p.Quantity, chance: p.Chance ?? 1, level: lv })
}
handled.add('RanchingAnimal')
for (const [id, a] of all('RanchingAnimal')) {
  const name = typeof a.DisplayName === 'string' ? a.DisplayName : a.DisplayName?.Singular ?? short(id)
  for (const p of a.Products ?? []) {
    infoSources.push({ item: p.Item, via: 'ranching', name, icon: icon(a.Icon), min: p.Quantity, max: p.Quantity, chance: 1, level: requirements(a).level, intervalMs: a.ProductInterval ?? null })
  }
}
// Behälter (Vogelnest, Geode …) öffnen: ein Item rein, die festen Beigaben
// und ein gewichteter Griff in die Tabelle raus, ohne Zeit — als echte Quelle
for (const it of items) {
  if (!it.openable) continue
  push('Open', it.id.replace(/^MelvorBase:/, ''), { DisplayName: it.name }, {
    kind: 'open',
    icon: it.icon,
    skill: null,
    inputs: [{ item: it.id, qty: 1 }],
    outputs: [
      ...it.openable.always.map((d) => ({ item: d.item, qty: d.qty, chance: 1 })),
      ...it.openable.drops.map((d) => ({ item: d.item, qty: (d.min + d.max) / 2, chance: d.chance, share: d.chance })),
    ],
    timeMs: 0,
  })
}

// Monster, Kampfgebiete und Dungeons — für Suche und Detailseiten
const displayName = (o, id) => (typeof o.DisplayName === 'string' ? o.DisplayName : o.DisplayName?.Singular ?? short(id))
const realIcon = (res) => (res && !String(res).includes('missing_artwork') ? icon(res) : null)
const enemies = []
for (const [id, e] of all('Enemy')) {
  if (JSON.stringify(e).includes('DemoPlaceholder')) continue
  const gold = (e.Drops?.FixedCurrencies ?? []).find((c) => c.Currency === 'MelvorBase:GoldPieces')
  enemies.push({
    id,
    name: displayName(e, id),
    icon: realIcon(e.Sprite),
    levels: Object.fromEntries((e.Levels ?? []).map((l) => [l.Key, l.Value])),
    stats: ratingList(e.Stats?.Stats),
    damageType: e.DamageType ? short(e.DamageType) : null,
    element: e.Element ? short(e.Element) : null,
    gold: gold ? { min: gold.MinQuantity, max: gold.MaxQuantity } : null,
    reqs: requirements(e).reqs,
    power: e.Stats?.PowerRatings?.find((r) => r.DamageType === 'MelvorBase:Normal')?.Value ?? 1,
    protection: e.Stats?.ProtectionRatings?.find((r) => r.DamageType === 'MelvorBase:Normal')?.Value ?? 0,
    stances: (e.Stances ?? []).map((s) => ({ stance: short(s.Stance), weight: s.Weight ?? 1 })),
    attacks: (e.Attacks ?? []).map((a) => ({ attack: short(a.Attack), chance: a.Chance })),
    passives: (e.Passives ?? []).map((p) => objects.CombatPassive?.get(p)?.DisplayName ?? short(p)),
  })
}
const areas = []
handled.add('Dungeon')
for (const [type, kind] of [['CombatArea', 'area'], ['Dungeon', 'dungeon']]) {
  for (const [id, a] of all(type)) {
    const ids = []
    for (const x of a.Enemies ?? []) {
      if (typeof x === 'string') ids.push(x)
      else for (const w of x.Enemies ?? []) if (w.Enemy && !ids.includes(w.Enemy)) ids.push(w.Enemy)
    }
    areas.push({
      id,
      kind,
      name: displayName(a, id),
      icon: realIcon(a.Icon),
      category: objects.CombatAreaCategory?.get(a.Category)?.DisplayName ?? (a.Category ? short(a.Category) : null),
      difficulty: a.Difficulty ? short(a.Difficulty) : null,
      enemies: ids,
      reqs: requirements({ Requirements: a.UnlockRequirements }).reqs,
      rewards: qtyList(a.Rewards?.Items ?? (Array.isArray(a.Rewards) ? a.Rewards : [])),
      darkness: a.Darkness ?? 0,
    })
  }
}
icon('res://Assets/Icons/Combat.png')

// Kampf-Tabellen für die Simulation (Formeln: src/core/combat.ts). Ids ohne
// Namensraum, Skills mit — wie überall.
const levelRatios = (list) => (list ?? []).map((r) => ({ skill: r.Level, ratio: r.Ratio }))
const combatCfg = entityConfig['MelvorBase:Combat'] ?? {}
const cfgIds = (key) => (combatCfg[key] ?? []).map((x) => x.Id)
const damagePart = (d) => {
  const f = d.Formula ?? {}
  return { who: d.Character === 'Defender' ? 'defender' : 'attacker', type: short(f.Type ?? ''), ...(f.Data ?? {}) }
}
for (const t of ['CombatStyle', 'AttackStance', 'WeaponType', 'Attack', 'MagicSpell', 'SpellBook', 'CombatTriangleBonus', 'ElementalBonus', 'EquipmentSlot', 'CombatPassive'])
  handled.add(t)
const combat = {
  spawnMs: 3000,
  slots: cfgIds('EquipmentSlots').map((id) => {
    const s = objects.EquipmentSlot?.get(id)
    return { id: short(id), name: s?.DisplayName ?? short(id), fits: short(s?.FitsType ?? ''), x: s?.GridPosition?.X ?? 0, y: s?.GridPosition?.Y ?? 0 }
  }),
  styles: all('CombatStyle').map(([id, s]) => ({
    id: short(id),
    name: s.DisplayName,
    icon: icon(s.Icon),
    accuracy: levelRatios(s.AccuracyRatingLevels),
    evasion: levelRatios(s.EvasionLevels),
    level: levelRatios(s.CombatLevelRatios),
    maxHit:
      short(s.MaxHitFormula?.Type ?? '') === 'DamageBonus'
        ? { kind: 'damage', stat: short(s.MaxHitFormula.Data.MaxHitStat), bonus: short(s.MaxHitFormula.Data.DamageBonusStat), levels: levelRatios(s.MaxHitFormula.Data.Levels) }
        : { kind: 'strength', stat: short(s.MaxHitFormula?.Data?.StrengthBonusStat ?? ''), levels: levelRatios(s.MaxHitFormula?.Data?.Levels) },
    spells: !!s.UsesSpells,
  })),
  stances: all('AttackStance').map(([id, s]) => ({
    id: short(id),
    name: s.DisplayName,
    icon: icon(s.Icon),
    style: short(s.CombatStyle),
    accuracyStat: short(s.AccuracyStat),
    evasionStat: short(s.EvasionStat),
    xp: (s.ExperienceGain ?? []).map((g) => ({ skill: g.Component.Entity, perDamage: g.ExperiencePerDamage })),
    // Unsichtbare Level-Boni (Block, Long Range, Focused: +3 Defence)
    levels: (s.Bonuses?.Component ?? [])
      .filter((m) => m.Stat?.Name === 'FlatCombatLevel' && m.LocalContext?.CombatLevel)
      .map((m) => ({ skill: m.LocalContext.CombatLevel, value: m.Value })),
  })),
  weaponTypes: Object.fromEntries(all('WeaponType').map(([id, w]) => [short(id), (w.Stances ?? []).map(short)])),
  attacks: Object.fromEntries(
    all('Attack').map(([id, a]) => [
      short(id),
      {
        name: a.DisplayName,
        avoidable: a.IsAvoidable !== false,
        hits: (a.Hits ?? []).map((h) => ({ count: h.Count ?? 1, interval: h.Interval ?? 0, damage: (h.Damage ?? []).map(damagePart) })),
      },
    ]),
  ),
  spells: all('MagicSpell').map(([id, s]) => ({
    id: short(id),
    name: s.DisplayName,
    icon: icon(s.Icon),
    book: objects.SpellBook?.get(s.Book)?.DisplayName ?? short(s.Book ?? ''),
    element: short(s.Element ?? 'Neutral'),
    maxHit: (s.Stats?.Stats ?? []).find((x) => x.Stat === 'MelvorBase:SpellMaxHit')?.Value ?? 0,
    runes: qtyList(s.RuneCosts),
    reqs: requirements({ Requirements: s.UnlockRequirements }).reqs,
    demoLocked: isDemoLocked({ Requirements: s.UnlockRequirements }),
    attack: s.AttackOverride ? short(s.AttackOverride) : null,
  })),
  triangle: all('CombatTriangleBonus').map(([, b]) => {
    const v = (name) => (b.Bonuses?.Component ?? []).find((m) => m.Stat?.Name === name)?.Value ?? 0
    return { player: short(b.PlayerStyle), enemy: short(b.EnemyStyle), maxHit: v('MaxHitCombatTriangle'), resistance: v('ResistanceCombatTriangle') }
  }),
  elements: all('ElementalBonus').map(([, b]) => ({
    player: short(b.PlayerElement),
    enemy: short(b.EnemyElement),
    maxHit: (b.Bonuses?.Component ?? []).find((m) => m.Stat?.Name === 'PercentMaxHit')?.Value ?? 0,
  })),
}

// Lesbare Namen der Eingrenzungen (Kategorie, Fanggebiet, Rezept …)
const scopeIds = new Set(bonusSources.flatMap((b) => b.mods.flatMap((m) => [m.recipe, m.category, m.subcategory, m.location, m.recipetype, m.item]).filter(Boolean)))
const names = {}
for (const [type, byId] of Object.entries(objects)) {
  for (const [id, o] of byId) {
    if (!scopeIds.has(id) || names[id]) continue
    const n = typeof o.DisplayName === 'string' ? o.DisplayName : o.DisplayName?.Singular
    if (n) names[id] = n
  }
}

const guildRanks = {}
for (const [entity, cfg] of Object.entries(entityConfig)) {
  const ranks = (cfg.MasteryGuildRanks ?? [])
    .map((r) => ({ id: r.Id, rank: objects.MasteryGuildRank?.get(r.Id) }))
    .filter((r) => r.rank)
    .map((r) => ({ id: r.id, name: r.rank.DisplayName, percent: r.rank.PointPercentRequired ?? 0 }))
    .sort((a, b) => a.percent - b.percent)
  if (ranks.length > 1) guildRanks[entity] = ranks
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
// Symbole der Oberfläche, die keine Spieldaten nennen (Kopf-Knöpfe, Einheiten)
for (const n of ['Statistics_64', 'Settings_64', 'codex', 'Edit', 'Mastery_Icon', 'GuideBook', 'Quests', 'QuestStepIcon', 'TimeInterval_48', 'doublingicon_48', 'XP_Icon_48', 'Slayer', 'Prayer', 'Agility', 'Astrology', 'Herblore', 'Ranching', 'Hunting'])
  icon(`res://Assets/Icons/${n}.png`)
icon('res://Assets/Items/Lemon.png')

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

// Freischaltungen: Skills, Kampf, Shop und Bank sind gesperrt, bis die
// Bedingungen ihres Navigationseintrags erfüllt sind (SkillNavigationOption
// usw., Requirements) — Level, aber auch Lebenszeit-Statistiken wie „20 Raw
// Shrimp geangelt" oder „1 Golbin besiegt". Jedes Rezept des Skills (und jeder
// Shop-Kauf, jedes Bank-Upgrade) bekommt die Freischaltung als Anforderung.
function unlockReqs(list) {
  const reqs = []
  let demoLocked = false
  for (const r of list ?? []) {
    const d = r.Data ?? {}
    const t = short(r.Type)
    if (t === 'DemoLocked') demoLocked = true
    else if (t === 'Level') reqs.push({ type: 'level', skill: d.Component.Entity, level: d.Level })
    else if (t === 'ItemStatistic') {
      // „<Skill>ItemGained" zählt nur, was der Skill gebracht hat; „BankItemFound" jede Quelle
      const m = /^MelvorBase:(\w+)ItemGained$/.exec(d.Statistic)
      reqs.push({ type: 'gained', item: d.Item, qty: d.Value, skill: m ? `MelvorBase:${m[1]}` : null, stat: d.Statistic })
    } else if (t === 'EnemyStatistic') reqs.push({ type: 'killed', enemy: d.Enemy, qty: d.Value, stat: d.Statistic })
    else if (t === 'HuntingAnimalStatistic')
      reqs.push({ type: 'trapped', animal: d.Animal, name: objects.HuntingAnimal?.get(d.Animal)?.DisplayName ?? short(d.Animal), qty: d.Value, stat: d.Statistic })
    else if (t === 'CurrencyStatistic' && /FromSale$/.test(d.Statistic)) reqs.push({ type: 'sold', qty: d.Value, stat: d.Statistic, currency: d.Currency })
    else reqs.push({ type: 'other', text: short(r.Type) })
  }
  return { reqs, demoLocked }
}
const features = []
for (const [type, entity] of [
  ['SkillNavigationOption', null],
  ['CombatNavigationOption', 'MelvorBase:Combat'],
  ['ShopNavigationOption', 'MelvorBase:Shop'],
  ['BankNavigationOption', 'MelvorBase:Bank'],
  ['QuestsNavigationOption', 'MelvorBase:Quests'],
]) {
  handled.add(type)
  for (const [, o] of all(type)) {
    const { reqs, demoLocked } = unlockReqs(o.Requirements)
    features.push({ id: entity ?? o.Entity, name: o.DisplayName, icon: icon(o.Icon), reqs, demoLocked })
  }
}
const featureById = new Map(features.map((f) => [f.id, f]))
const unlockReq = (id) => {
  const f = featureById.get(id)
  return f && (f.reqs.length || f.demoLocked) ? { type: 'unlock', feature: f.id, name: f.name, reqs: f.reqs, ...(f.demoLocked ? { demoLocked: true } : {}) } : null
}
for (const r of recipes) {
  const feature = r.kind === 'shop' ? 'MelvorBase:Shop' : r.kind === 'upgrade' || r.kind === 'open' ? 'MelvorBase:Bank' : r.skill
  const q = feature ? unlockReq(feature) : null
  if (q) r.reqs = [q, ...r.reqs]
}
const shopUnlock = unlockReq('MelvorBase:Shop')
if (shopUnlock) for (const p of purchases) p.reqs = [shopUnlock, ...p.reqs]

// Completion-Log: die Items in der Reihenfolge des Spiels, Monster ohne IgnoreCompletion
const itemIds = new Set(items.map((i) => i.id))
const enemyIds = new Set(enemies.map((e) => e.id))
const completion = {
  items: (entityConfig['MelvorBase:CompletionLog']?.ItemCompletionOrder ?? []).map((x) => x.Id).filter((id) => itemIds.has(id)),
  enemies: all('Enemy')
    .filter(([id, e]) => !e.IgnoreCompletion && enemyIds.has(id))
    .map(([id]) => id),
}

// Shop wie im Spiel: Kategorien → Unterkategorien → Käufe, in der Reihenfolge der Konfiguration
handled.add('ShopCategory')
handled.add('ShopSubcategory')
const shopCfg = entityConfig['MelvorBase:Shop'] ?? {}
const purchaseIds = new Set(purchases.map((p) => p.id))
const subOrder = (shopCfg.Subcategories ?? []).map((x) => x.Id)
const purchaseOrder = new Map((shopCfg.Purchases ?? []).map((x, i) => [x.Id, i]))
const shop = (shopCfg.Categories ?? []).map((c) => {
  const cat = objects.ShopCategory?.get(c.Id)
  return {
    id: c.Id,
    name: cat?.DisplayName ?? short(c.Id),
    icon: icon(cat?.Icon),
    subcategories: subOrder
      .filter((id) => objects.ShopSubcategory?.get(id)?.Category === c.Id)
      .map((id) => {
        const sub = objects.ShopSubcategory.get(id)
        return {
          id,
          name: sub.DisplayName,
          icon: icon(sub.Icon),
          purchases: all('ShopPurchase')
            .filter(([pid, p]) => p.Subcategory === id && purchaseIds.has(pid))
            .sort((a, b) => (purchaseOrder.get(a[0]) ?? 1e9) - (purchaseOrder.get(b[0]) ?? 1e9))
            .map(([pid]) => pid),
        }
      })
      .filter((s) => s.purchases.length),
  }
}).filter((c) => c.subcategories.length)

const plist = pckPath.includes('.app/') ? path.join(pckPath.split('.app/')[0] + '.app', 'Contents/Info.plist') : null
const version =
  plist && fs.existsSync(plist)
    ? fs.readFileSync(plist, 'utf8').match(/CFBundleShortVersionString<\/key>\s*<string>([^<]+)/)?.[1]
    : undefined

// ---------------------------------------------------------------------------
// Mastery Guild, Quests, Statistiken, Tutorials

// Ein Ziel (Goal/ConditionGoal/TriggerGoal) kompakt: Art, Höchststand und die
// schlichten Felder (Rezept, Item, Monster, Tier, Level …)
const goalOf = (g) => {
  if (!g) return null
  const d = g.Data ?? {}
  const out = { type: short(g.Type), max: d.MaxProgress ?? 1 }
  if (d.Component?.Entity) out.entity = d.Component.Entity
  for (const [k, v] of Object.entries(d)) {
    if (['Component', 'Conditions', 'IsOr', 'MaxProgress'].includes(k)) continue
    if (v == null || typeof v === 'object') continue
    out[k[0].toLowerCase() + k.slice(1)] = v
  }
  return out
}
const placeholderText = (t) => !t || /custom description for a custom task/i.test(t)
const byPriority = (list) => (list ?? []).map((x, i) => ({ ...x, i })).sort((a, b) => (a.Priority ?? 0) - (b.Priority ?? 0) || a.i - b.i)

handled.add('MasteryGuildTask')
handled.add('MasteryGuildCategory')
handled.add('MasteryGuildRank')
const mastery = {}
for (const [entity, cfg] of Object.entries(entityConfig)) {
  if (!cfg.MasteryGuildRanks) continue
  const ranks = byPriority(cfg.MasteryGuildRanks)
    .map((r) => [r.Id, objects.MasteryGuildRank?.get(r.Id)])
    .filter(([, o]) => o)
    .map(([id, o]) => ({ id, name: o.DisplayName, percent: o.PointPercentRequired ?? 0 }))
    .sort((a, b) => a.percent - b.percent)
  const categories = byPriority(cfg.MasteryGuildCategories)
    .map((c) => [c.Id, objects.MasteryGuildCategory?.get(c.Id)])
    .filter(([, o]) => o)
    .map(([id, o]) => ({ id, name: o.DisplayName, points: o.BasePoints ?? 0, demoLocked: isDemoLocked(o) }))
  const tasks = byPriority(cfg.MasteryGuildTasks)
    .map((t) => [t.Id, objects.MasteryGuildTask?.get(t.Id)])
    .filter(([, o]) => o)
    .map(([id, o]) => ({
      id,
      category: o.Category,
      text: placeholderText(o.CustomDescription) ? null : o.CustomDescription,
      ...(o.Goal ? { goal: goalOf(o.Goal) } : {}),
      ...(o.ConditionGoal ? { condition: goalOf(o.ConditionGoal) } : {}),
      ...(o.TriggerGoal ? { trigger: goalOf(o.TriggerGoal) } : {}),
    }))
  const bonuses = byPriority(cfg.MasteryGuildBonuses).map((b) => b.Id)
  mastery[entity] = { ranks, categories, tasks, bonuses }
}

handled.add('Quest')
handled.add('QuestCategory')
handled.add('NPC')
const questCfg = entityConfig['MelvorBase:Quests'] ?? {}
const dialogue = (list) => (list ?? []).map((d) => ({ npc: d.Npc, text: d.DialogueText }))
const quests = byPriority(questCfg.Quests)
  .map((q) => [q.Id, objects.Quest?.get(q.Id)])
  .filter(([, o]) => o)
  .map(([id, o]) => ({
    id,
    name: o.DisplayName,
    description: o.Description ?? '',
    category: o.Category ?? null,
    steps: (o.Steps ?? []).map((st) => ({
      id: st.Id,
      description: st.Description ?? '',
      completed: st.CompletedDescription ?? '',
      dialogue: dialogue(st.Dialogue),
      tasks: (st.TasksInOrder ?? []).map((tk) => ({
        id: tk.Id,
        goals: (tk.Goals ?? []).map(goalOf),
        items: qtyList(tk.Costs?.Items),
        currencies: costList(tk.Costs?.Currencies),
      })),
    })),
    completion: dialogue(o.CompletionDialogue),
    rewards: { items: qtyList(o.Rewards?.Items), currencies: costList(o.Rewards?.Currency ?? o.Rewards?.Currencies) },
    // Vorgänger (QuestComplete) getrennt, der Rest als normale Anforderungen
    after: (o.Requirements ?? []).filter((r) => r.Type === 'MelvorBase:QuestComplete').map((r) => r.Data.Quest),
    reqs: requirements({ Requirements: (o.Requirements ?? []).filter((r) => r.Type !== 'MelvorBase:QuestComplete') }).reqs,
    ...(o.IgnoreCompletion ? { ignoreCompletion: true } : {}),
  }))
const questCategories = byPriority(questCfg.Categories)
  .map((c) => [c.Id, objects.QuestCategory?.get(c.Id)])
  .filter(([, o]) => o)
  .map(([id, o]) => ({ id, name: o.DisplayName, subtitle: o.Subtitle ?? null, icon: realIcon(o.Icon) }))
const npcs = Object.fromEntries(
  byPriority(questCfg.NPCs)
    .map((n) => [n.Id, objects.NPC?.get(n.Id)])
    .filter(([, o]) => o)
    .map(([id, o]) => [id, { name: o.DisplayName, icon: realIcon(o.Icon), type: o.NPCType ?? null }]),
)
for (const [id, o] of all('NPC')) if (!npcs[id]) npcs[id] = { name: o.DisplayName, icon: realIcon(o.Icon), type: o.NPCType ?? null }

// Namen aller Dinge, auf die Mastery- und Quest-Ziele zeigen (Rezepte,
// Unterkategorien, Orte, Tiere, Effekte …), für lesbare Aufgaben
const goalRefs = new Set()
const collectRefs = (g) => {
  for (const v of Object.values(g ?? {})) if (typeof v === 'string' && v.startsWith('MelvorBase:')) goalRefs.add(v)
}
for (const m of Object.values(mastery)) for (const t of m.tasks) [t.goal, t.condition, t.trigger].forEach(collectRefs)
for (const q of quests) for (const st of q.steps) for (const tk of st.tasks) tk.goals.forEach(collectRefs)
for (const id of goalRefs) {
  if (names[id]) continue
  for (const map of Object.values(objects)) {
    const o = map.get(id)
    if (!o) continue
    const n = typeof o.DisplayName === 'string' ? o.DisplayName : o.DisplayName?.Singular
    if (n) {
      names[id] = n
      break
    }
  }
}

// Statistiken je Einheit: welche Listen (Werte, Währungen, Items, Monster …) in
// welcher Reihenfolge — Bedeutung und Format kennt src/core/statDefs.ts
const statistics = {}
for (const [entity, cfg] of Object.entries(entityConfig)) {
  const lists = {}
  for (const [key, list] of Object.entries(cfg)) {
    if (/Statistics$/.test(key) && Array.isArray(list) && list.length) lists[key] = byPriority(list).map((x) => x.Id)
  }
  if (Object.keys(lists).length) statistics[entity] = lists
}
// Namen der Einheiten ohne Skill-Navigation (Bank, Shop, Charakter …)
const entityNames = {}
for (const type of ['SkillNavigationOption', 'CombatNavigationOption', 'ShopNavigationOption', 'BankNavigationOption', 'QuestsNavigationOption', 'SimpleNavigationOption']) {
  for (const [id, o] of all(type)) entityNames[o.Entity ?? o.Page ?? id] = o.DisplayName
}

// Tutorials („Guide“): Godot-Szenen res://Tutorials/<skill>_tutorial.tscn
const tutorials = {}
for (const file of pck.files.keys()) {
  const m = file.match(/-([a-z]+)_tutorial\.scn$/)
  if (!m) continue
  const name = m[1]
  const entity = [...Object.keys(entityConfig)].find((e) => short(e).toLowerCase() === name)
  if (!entity) continue
  try {
    const tree = parseScene(pck.file(file))
    const tut = tutorialOf(tree)
    if (tut.sections.length) tutorials[entity] = tut
  } catch (err) {
    console.warn(`⚠︎ Tutorial ${name}: ${err.message}`)
  }
}

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
  bonusSources,
  guildRanks,
  names,
  infoSources,
  enemies,
  areas,
  features,
  combat,
  completion,
  shop,
  mastery,
  quests,
  questCategories,
  npcs,
  statistics,
  entityNames,
  tutorials,
}
fs.writeFileSync(path.join(OUT_DIR, 'data.json'), JSON.stringify(data))

const locked = recipes.filter((r) => r.demoLocked).length
console.log(
  `${items.length} Items, ${recipes.length} Rezepte (${locked} gesperrt), ${purchases.length} Shop-Käufe, ` +
    `${bonusSources.length} Bonus-Quellen, ` +
    `${skills.length} Skills, ${written} Icons` +
    (missing.length ? `, ${missing.length} Icons ohne Textur` : ''),
)
if (unhandled.length) console.warn(`⚠︎ Noch nicht gerechnet (erzeugen Items): ${unhandled.join(', ')}`)
