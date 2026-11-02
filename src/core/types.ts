// Form von public/game/data.json (scripts/extract-game-data.mjs)

export type Id = string

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
}

export interface CurrencyOutput extends CurrencyQty {
  chance: number
}

export type Req =
  | { type: 'level'; skill: Id; level: number }
  | { type: 'purchase'; purchase: Id; name: string }
  | { type: 'item'; item: Id }
  | { type: 'other'; text: string }

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

export type Success =
  | { kind: 'cooking'; difficulty: number }
  | { kind: 'thieving'; perception: number; stunMs: number }

export interface Recipe {
  id: Id
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

export interface Item {
  id: Id
  name: string
  icon: string | null
  sells: CurrencyQty | null
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

export interface GameData {
  meta: { packages: string[]; gameVersion: string | null; godot: string; extractedAt: string }
  currencies: Currency[]
  skills: Skill[]
  items: Item[]
  recipes: Recipe[]
  purchases: Purchase[]
}

export interface Profile {
  levels: Record<Id, number>
  inventory: Record<Id, number>
  currencies: Record<Id, number>
  /** Gekaufte Freischaltungen (Shop) */
  owned: Record<Id, number>
  /** Farming-Felder, die gleichzeitig wachsen */
  farmingPlots?: number
}

export interface ItemGoal {
  item: Id
  qty: number
}
