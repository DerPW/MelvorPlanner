// Form von public/game/data.json (scripts/extract-game-data.mjs)

export type Id = string

/** Meldung als Schlüssel + Werte — die Oberfläche übersetzt (src/i18n) */
export interface Msg {
  key: string
  params?: Record<string, string | number | Msg>
}

export interface ItemQty {
  item: Id
  qty: number
}

export interface CurrencyQty {
  currency: Id
  qty: number
}

export interface Output extends ItemQty {
  /** Erwartungswert-Faktor je Durchlauf (1 = sicher) */
  chance: number
  /** Anteil innerhalb einer gewichteten Tabelle (Angeln, Thieving-Beute) */
  share?: number
  table?: 'fish' | 'common' | 'rare'
  /** Zufallsprodukt neben dem eigentlichen (Vogelnest, Samen, Geode) —
   *  Mengen-Boni gelten nicht dafür */
  extra?: boolean
  /** Chance je Schlag; `chance` ist dann die Erwartung je Durchlauf */
  perHit?: number
}

export interface CurrencyOutput extends CurrencyQty {
  chance: number
}

export type Req =
  | { type: 'level'; skill: Id; level: number }
  | { type: 'purchase'; purchase: Id; name: string }
  | { type: 'item'; item: Id }
  | { type: 'other'; text: string }
  /** Skill oder Bereich (Kampf, Shop, Bank) muss freigeschaltet sein — samt
   *  dessen Bedingungen, damit sich der Stand ohne Index auswerten lässt */
  | { type: 'unlock'; feature: Id; name: string; reqs: Req[]; demoLocked?: boolean }
  // Freischalt-Bedingungen aus den Lebenszeit-Statistiken des Spiels
  /** So viele Stück gewonnen — über diesen Skill, ohne Skill aus jeder Quelle */
  | { type: 'gained'; item: Id; qty: number; skill: Id | null }
  | { type: 'killed'; enemy: Id; qty: number }
  | { type: 'trapped'; animal: Id; name: string; qty: number }
  /** So viel Gold durch Verkäufe eingenommen */
  | { type: 'sold'; qty: number }

export type RecipeKind =
  | 'artisan'
  | 'cooking'
  | 'woodcutting'
  | 'mining'
  | 'fishing'
  | 'firemaking'
  | 'thieving'
  | 'farming'
  | 'mill'
  | 'shop'
  | 'upgrade'
  | 'open'

export type Success =
  | { kind: 'cooking'; difficulty: number; proficiency?: number }
  | { kind: 'thieving'; perception: number; stunMs: number; stealthFlat?: number; stealthPct?: number; stunAvoid?: number }

export interface Recipe {
  id: Id
  /** Id des Rezepts im Spiel (für Boni, die auf ein Rezept zielen) */
  ref: Id
  category: Id | null
  subcategory: Id | null
  location?: Id | null
  recipeType?: Id | null
  /** Rohwerte fürs Neuberechnen mit Boni (src/core/bonuses.ts) */
  base?: Record<string, number>
  kind: RecipeKind
  name: string
  icon: string | null
  /** Skill der höchsten Level-Anforderung bzw. des Rezepts */
  skill: Id | null
  level: number
  reqs: Req[]
  inputs: ItemQty[]
  costs: CurrencyQty[]
  outputs: Output[]
  currencyOutputs?: CurrencyOutput[]
  /** Grundzeit je Durchlauf in ms, ohne Boni */
  timeMs: number
  /** Farming: Wartezeit statt aktiver Zeit */
  passive?: boolean
  xp: number
  success?: Success
  /** Shop-Rezept: der Kauf dahinter */
  purchase?: Id
  demoLocked: boolean
}

export interface Purchase {
  id: Id
  name: string
  icon: string | null
  description: string | null
  category: string | null
  costs: CurrencyQty[]
  inputs: ItemQty[]
  reqs: Req[]
  items: ItemQty[]
  buyLimit: number | null
  demoLocked: boolean
}

export interface NamedValue {
  name: string
  value: number
}

export interface Item {
  id: Id
  name: string
  icon: string | null
  sells: CurrencyQty | null
  description?: string
  /** Bank-Reiter: Skills, die das Item herstellen bzw. verbrauchen */
  bankTags?: { tag: Id; product: boolean; ingredient: boolean }[]
  equipment?: { type: string; stats: NamedValue[]; power: NamedValue[]; protection: NamedValue[]; reqs: Req[]; mods: Mod[] }
  weapon?: { type: string; damage: string; elements: string[]; ammo: string | null }
  food?: { healing: number }
  bury?: CurrencyQty
  trap?: { type: string }
  toolbelt?: { slot: string; mods: Mod[]; reqs: Req[] }
  bait?: { mods: Mod[] }
  compost?: { mods: Mod[] }
  openable?: { always: ItemQty[]; drops: { item: Id; min: number; max: number; chance: number }[] }
}

/** Quelle, die der Planer nicht rechnet — nur für die Detailseite */
export interface InfoSource {
  item: Id
  via: 'enemy' | 'hunting' | 'survey' | 'ranching' | 'chest'
  /** Monster: seine Id */
  from?: Id
  name: string
  icon?: string | null
  /** Truhe: ihr Item */
  chest?: Id
  min: number
  max: number
  chance: number
  level?: number
  intervalMs?: number | null
}

export interface Skill {
  id: Id
  name: string
  icon: string | null
}

export interface Currency {
  id: Id
  name: string
  short: string
  icon: string | null
}

/** Ein Bonus aus den Spieldaten; Eingrenzung über Skill/Rezept/Kategorie … */
export interface Mod {
  /** Stat-Klasse ohne Namensraum (MiningAction, Experience) oder „Global" */
  stats: string
  stat: string
  value: number
  entity?: Id
  recipe?: Id
  category?: Id
  subcategory?: Id
  location?: Id
  item?: Id
  recipetype?: Id
}

export interface BonusSource {
  id: Id
  kind: 'purchase' | 'item' | 'guild'
  name: string
  icon: string | null
  /** Werkzeug: Platz im Werkzeuggürtel */
  slot?: Id | null
  /** Gilde: Skill und nötiger Rang */
  skill?: Id
  rank?: Id
  mods: Mod[]
}

export interface GuildRank {
  id: Id
  name: string
  percent: number
}

/** Ein Skill oder Bereich, der erst freigeschaltet werden muss */
export interface Feature {
  id: Id
  name: string
  icon: string | null
  reqs: Req[]
  demoLocked: boolean
}

export interface GameData {
  meta: { packages: string[]; gameVersion: string | null; godot: string; extractedAt: string }
  currencies: Currency[]
  skills: Skill[]
  items: Item[]
  recipes: Recipe[]
  purchases: Purchase[]
  bonusSources: BonusSource[]
  /** Skill → Gilden-Ränge, aufsteigend */
  guildRanks: Record<Id, GuildRank[]>
  /** Lesbare Namen der Eingrenzungen von Boni */
  names: Record<Id, string>
  infoSources: InfoSource[]
  enemies: Enemy[]
  areas: Area[]
  features: Feature[]
}

export interface Enemy {
  id: Id
  name: string
  icon: string | null
  /** Kampf-Skill → Level */
  levels: Record<Id, number>
  stats: NamedValue[]
  damageType: string | null
  element: string | null
  gold: { min: number; max: number } | null
  reqs: Req[]
}

export interface Area {
  id: Id
  kind: 'area' | 'dungeon'
  name: string
  icon: string | null
  category: string | null
  difficulty: string | null
  enemies: Id[]
  reqs: Req[]
  rewards: ItemQty[]
}

export interface Profile {
  levels: Record<Id, number>
  inventory: Record<Id, number>
  currencies: Record<Id, number>
  /** Gekaufte Freischaltungen (Shop) */
  owned: Record<Id, number>
  /** Farming-Felder, die gleichzeitig wachsen */
  farmingPlots?: number
  /** Genaue XP je Skill (aus dem Spielstand); sonst gilt der Level-Anfang */
  xp?: Record<Id, number>
  /** Ausgerüstete Werkzeuge (Werkzeuggürtel) */
  equipped?: Id[]
  /** Höchstes Level dieser Spielversion (Demo 60) */
  levelCap?: number
  /** Gilden-Rang je Skill (Index in guildRanks, 0 = Anfang) */
  guildRanks?: Record<Id, number>
  /** Freigeschaltete Skills/Bereiche, von Hand oder vom Planer gesetzt;
   *  fehlt ein Eintrag, wird er aus dem Stand geschätzt (isUnlocked) */
  unlocked?: Record<Id, boolean>
  /** Woher der Stand kommt */
  source?: { character: string; savedAt: string | null; importedAt: string; version: number }
}

export interface ItemGoal {
  item: Id
  qty: number
}
