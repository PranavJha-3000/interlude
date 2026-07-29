/**
 * Types for the prize engine. Everything the engine needs is an argument —
 * no I/O, no database, no clock, no randomness (PLATFORM.md §5).
 */

export type MarginTier = 'HIGH' | 'MID' | 'LOW'
export type PrepBurden = 'LOW' | 'MEDIUM' | 'HIGH'
export type LoadLevel = 'GREEN' | 'AMBER' | 'RED'
export type Mechanic = 'KITCHEN_ROUND' | 'MYSTERY_PLATE'
export type AwardKind = 'FREE' | 'HALF_PRICE' | 'FIXED_PRICE'

export interface MenuItemInput {
  id: string
  name: string
  category: string
  pricePaise: number
  foodCostPaise: number
  marginTier: MarginTier
  prepBurden: PrepBurden
  /** Awarding this makes the kitchen do work. Suppressed when load is RED. */
  requiresKitchenWork: boolean
  /** Hero items are never discounted (PLATFORM.md §12). */
  isHero: boolean
  active: boolean
}

export interface VelocityInput {
  itemId: string
  /** Units sold in the trailing window. */
  unitsSold: number
  /** Days since the last sale. Absent means never sold in the window. */
  daysSinceLastSale?: number
}

export interface DepthCaps {
  /** Ceiling on how much of an item's price may be conceded, 0–100. */
  perItemPct: number
  /** Ceiling on total value conceded across the whole service. */
  perServicePaise: number
}

export interface PrizeEngineInput {
  menu: MenuItemInput[]
  velocity: VelocityInput[]
  kitchenLoad: LoadLevel
  /** Item ids the chef has vetoed. Absolute — never overridden. */
  chefVetoes: string[]
  depthCaps: DepthCaps
  mechanic: Mechanic
  /** Value already conceded this service, so the cap is a running total. */
  concededSoFarPaise: number
  /** Minutes from midnight, venue local time. Passed in — the engine has no clock. */
  serviceClockMinute: number
  peakStartMinute: number
  peakEndMinute: number
  /** Fixed price for the mystery plate. Never a draw — a product. */
  mysteryPlatePricePaise: number
}

export interface PrizeEntry {
  itemId: string
  mechanic: Mechanic
  kind: AwardKind
  /** Value conceded to the guest if this entry is awarded. */
  valuePaise: number
  /** What it actually costs the venue. */
  costPaise: number
  /** Depth as a percentage of the item's menu price, 0–100. */
  depthPct: number
  /** Never empty. The operator's audit trail (PLATFORM.md §5). */
  reason: string
  /** Higher sorts first. Deterministic, derived only from the inputs. */
  score: number
}

export interface PrizeExclusion {
  itemId: string
  /** Never empty. Every exclusion is explainable to the operator. */
  reason: string
}

export interface PrizePoolResult {
  entries: PrizeEntry[]
  excluded: PrizeExclusion[]
}
