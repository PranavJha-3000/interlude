/**
 * Types for the prize engine. Everything the engine needs is an argument —
 * no I/O, no database, no clock, no randomness (PLATFORM.md §5).
 */

export type MarginTier = 'HIGH' | 'MID' | 'LOW'
export type PrepBurden = 'LOW' | 'MEDIUM' | 'HIGH'
export type LoadLevel = 'GREEN' | 'AMBER' | 'RED'
export type Mechanic = 'BEAT_THE_KITCHEN' | 'KITCHEN_ROUND' | 'MYSTERY_PLATE'
export type Outcome = 'WIN' | 'LOSE'

/**
 * What the guest gets.
 *
 * `PERCENT_OFF` carries its own percentage rather than being a fixed set of
 * discount sizes, because the discount depth is the venue's decision and
 * PLATFORM.md §10 forbids baking one of their numbers into the code. The old
 * `HALF_PRICE` kind was exactly that — a hardcoded 50 — and is gone.
 */
export type AwardKind = 'FREE' | 'PERCENT_OFF' | 'FIXED_PRICE'

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

/** When a rule applies, relative to the venue's own peak window. */
export type RuleWindow = 'ANY' | 'PEAK' | 'OFF_PEAK'

/**
 * A prize rule — the restaurant's own policy, expressed as data.
 *
 * The engine used to decide the award kind itself: free, or half price for a
 * low-margin item at peak. That was our opinion hardcoded into their P&L. A
 * rule list moves the decision to the operator, where it belongs, and keeps the
 * engine pure: rules come in as an argument like everything else.
 *
 * Matching is **first match wins, by ascending `priority`.** Every condition
 * left undefined means "any", so a single rule with no conditions is a valid
 * and complete policy. An item that matches no rule is excluded with a reason,
 * never silently given away.
 */
export interface PrizeRuleInput {
  id: string
  /** Ascending. The first matching rule decides, so specific rules sort first. */
  priority: number
  /** Operator-written, and it appears verbatim in the audit trail. */
  label: string

  mechanic: Mechanic
  /** WIN rules set the prize; LOSE rules set the consolation. */
  outcome: Outcome

  // --- Conditions. Undefined means "any". ---------------------------------
  marginTier?: MarginTier
  category?: string
  menuItemId?: string
  window: RuleWindow

  // --- What it awards -----------------------------------------------------
  kind: AwardKind
  /** Required for PERCENT_OFF. 1–100. */
  percentOff?: number
  /** Required for FIXED_PRICE. What the guest pays, in paise. */
  fixedPricePaise?: number
}

/**
 * How this venue ranks its own pool.
 *
 * The engine decides *what may be offered*; these decide *what to offer
 * first*. They were literals in `scoreItem` — "+40 for not selling", "3 units
 * is a slow mover" — which made the most commercially load-bearing judgement in
 * the product the one thing an operator could not touch (PLATFORM.md §10).
 *
 * Both halves are venue judgements and both are here. A dessert bar where three
 * units is a good night and a 300-cover canteen where it is a dead item need
 * different thresholds, not just different weights.
 *
 * Every field is a score adjustment except the three `…Units`/`…Days` ones,
 * which are the thresholds those adjustments trigger on.
 */
export interface RankingWeights {
  /** Nothing sold in the window at all. The tiramisu-since-Tuesday case. */
  notSelling: number
  /** Sold, but barely — at or under `slowMoverMaxUnits`. */
  slowMover: number
  /** Moving well already, at or above `fastMoverMinUnits`. Normally negative. */
  fastMoverPenalty: number
  /** Applied once when the last sale is `staleMinDays` or more ago. */
  stale: number
  /** Cheap to plate, so promoting it costs the kitchen little. */
  lowPrepBonus: number
  /** Expensive to plate. Normally negative. */
  highPrepPenalty: number

  slowMoverMaxUnits: number
  fastMoverMinUnits: number
  staleMinDays: number
}

export interface PrizeEngineInput {
  menu: MenuItemInput[]
  velocity: VelocityInput[]
  kitchenLoad: LoadLevel
  /** Item ids the chef has vetoed. Absolute — never overridden. */
  chefVetoes: string[]
  depthCaps: DepthCaps
  mechanic: Mechanic
  /**
   * Whether this pool is for a guest who won or one who lost. Both end in real
   * value; the consolation is a shallower rule, never a dead end.
   */
  outcome: Outcome
  /** The venue's own policy. Empty means no prize can be offered at all. */
  prizeRules: PrizeRuleInput[]
  /** The venue's own ranking. Passed in — the engine reads no config. */
  rankingWeights: RankingWeights
  /** Value already conceded this service, so the cap is a running total. */
  concededSoFarPaise: number
  /** Minutes from midnight, venue local time. Passed in — the engine has no clock. */
  serviceClockMinute: number
  peakStartMinute: number
  peakEndMinute: number
}

export interface PrizeEntry {
  itemId: string
  mechanic: Mechanic
  kind: AwardKind
  /** Set when `kind` is PERCENT_OFF, so the guest screen can say "40% off". */
  percentOff?: number
  /** Set when `kind` is FIXED_PRICE — what the guest pays. */
  fixedPricePaise?: number
  /** Value conceded to the guest if this entry is awarded. */
  valuePaise: number
  /** What it actually costs the venue. */
  costPaise: number
  /** Depth as a percentage of the item's menu price, 0–100. */
  depthPct: number
  /** Which rule decided this. The operator can trace it back and edit it. */
  ruleId: string
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
