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
  | { type: 'gained'; item: Id; qty: number; skill: Id | null; stat?: Id }
  | { type: 'killed'; enemy: Id; qty: number; stat?: Id }
  | { type: 'trapped'; animal: Id; name: string; qty: number; stat?: Id }
  /** So viel Gold durch Verkäufe eingenommen */
  | { type: 'sold'; qty: number; stat?: Id; currency?: Id }

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
  | 'combat'

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
  /** Kampf: Monster, Haltung, Dunkelheit des Gebiets (Dauer wird simuliert) */
  combat?: { enemy: Id; stance: string; darkness: number }
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
  equipment?: {
    type: string
    stats: NamedValue[]
    power: NamedValue[]
    protection: NamedValue[]
    reqs: Req[]
    mods: Mod[]
    /** belegt zusätzlich diese Plätze (Zweihänder, Bogen → Offhand) */
    occupies?: string[]
    /** Spezialangriffe der Waffe */
    attacks?: { attack: string; chance: number }[]
    /** Munition dieses Typs (Pfeile …) */
    ammoType?: string
    stack?: boolean
  }
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
  combat: CombatTables
  /** Was das Completion-Log zählt */
  completion: { items: Id[]; enemies: Id[] }
  /** Shop wie im Spiel: Kategorien → Unterkategorien → Käufe */
  shop: { id: Id; name: string; icon: string | null; subcategories: { id: Id; name: string; icon: string | null; purchases: Id[] }[] }[]
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
  /** Kampfkraft/Schutz für den Schadenstyp Normal */
  power: number
  protection: number
  stances: { stance: string; weight: number }[]
  attacks: { attack: string; chance: number }[]
  passives: string[]
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
  /** Dunkelheit: −5 % Treffer und Ausweichen je Punkt (bis 20) */
  darkness: number
}

export interface LevelRatio {
  skill: Id
  ratio: number
}

export interface CombatStyle {
  id: string
  name: string
  icon: string | null
  accuracy: LevelRatio[]
  evasion: LevelRatio[]
  level: LevelRatio[]
  maxHit: { kind: 'strength'; stat: string; levels: LevelRatio[] } | { kind: 'damage'; stat: string; bonus: string; levels: LevelRatio[] }
  spells: boolean
}

export interface AttackStance {
  id: string
  name: string
  icon: string | null
  style: string
  accuracyStat: string
  evasionStat: string
  xp: { skill: Id; perDamage: number }[]
  /** unsichtbare Level-Boni (Block: +3 Defence) */
  levels: { skill: Id; value: number }[]
}

export interface AttackDamage {
  who: 'attacker' | 'defender'
  type: string
  Percent?: number
  Damage?: number
  Minimum?: number
  Maximum?: number
}

export interface AttackDef {
  name: string
  avoidable: boolean
  hits: { count: number; interval: number; damage: AttackDamage[] }[]
}

export interface MagicSpell {
  id: string
  name: string
  icon: string | null
  book: string
  element: string
  maxHit: number
  runes: ItemQty[]
  reqs: Req[]
  demoLocked: boolean
  attack: string | null
}

export interface CombatTables {
  spawnMs: number
  /** Plätze mit ihrer Lage im Ausrüstungsraster des Spiels */
  slots: { id: string; name: string; fits: string; x: number; y: number }[]
  styles: CombatStyle[]
  stances: AttackStance[]
  weaponTypes: Record<string, string[]>
  attacks: Record<string, AttackDef>
  spells: MagicSpell[]
  triangle: { player: string; enemy: string; maxHit: number; resistance: number }[]
  elements: { player: string; enemy: string; maxHit: number }[]
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
  /** Kampf: Ausrüstung je Platz (Item-Id), Haltung je Waffentyp, Essen, Zauber */
  combat?: CombatLoadout
  /** Ausrüstung laut Spielstand; `combat` weicht davon ab, solange `combatManual` gilt */
  combatSave?: CombatLoadout
  /** Selbst gewählt — das Einlesen des Spielstands lässt `combat` dann stehen */
  combatManual?: boolean
  /** Lebenszeit-Statistiken aus dem Spielstand: Statistik → (Item/Monster/Währung → Zähler) */
  stats?: Record<Id, Record<Id, number>>
  /** Bank-Reiter wie im Spiel */
  bankTabs?: { name: string; items: { item: Id; qty: number }[] }[]
  /** Freigeschaltete Skills/Bereiche, von Hand oder vom Planer gesetzt;
   *  fehlt ein Eintrag, wird er aus dem Stand geschätzt (isUnlocked) */
  unlocked?: Record<Id, boolean>
  /** Woher der Stand kommt */
  source?: { character: string; savedAt: string | null; importedAt: string; version: number }
}

export interface CombatLoadout {
  /** Platz (Helmet, Weapon, …) → Item; Munition/Wurfwaffen mit Menge */
  gear: Record<string, Id>
  qty?: Record<string, number>
  /** Waffentyp → gewählte Haltung (ohne Eintrag: die erste des Typs) */
  stances: Record<string, string>
  food: Id | null
  spell: string | null
  hp?: number | null
}

export interface ItemGoal {
  item: Id
  qty: number
}
