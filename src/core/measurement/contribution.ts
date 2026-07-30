/**
 * Tier-1 benefit maths (PLATFORM.md §9).
 *
 * The operator has to see his own benefit in rupees on night one, before any
 * POS bill export exists. This computes that from the app's own confirmed
 * rows and the venue's own margin config — no POS, no estimate of anything the
 * app did not itself observe.
 *
 * What it is *not*: attach-rate delta. That needs the merchant's till and
 * arrives in wave 2. The number here assumes each add-on was incremental —
 * that the guest would not have ordered it anyway — which is exactly the
 * assumption the control arm exists to test. Directional until tier 2 lands,
 * and the UI has to say so.
 *
 * Pure: no I/O, no clock.
 */

export interface ConfirmedAddOn {
  qty: number
  /** Snapshotted at request time, so a later menu edit cannot rewrite history. */
  pricePaise: number
  foodCostPaise: number
}

export interface ConfirmedAward {
  kind: 'FREE' | 'PERCENT_OFF' | 'FIXED_PRICE'
  /** Value conceded to the guest. */
  valuePaise: number
  /** What it actually cost the venue to hand over. */
  foodCostPaise: number
}

export interface ContributionSummary {
  /** Menu price of everything ordered through the app. */
  addOnGrossPaise: number
  /** What the venue keeps of that, after the food cost of making it. */
  addOnContributionPaise: number
  /** What the prizes cost the venue. */
  prizeCostPaise: number
  /** The headline. Can be negative, and we show it if it is. */
  netContributionPaise: number
  addOnCount: number
  awardCount: number
}

export function summariseContribution(
  addOns: readonly ConfirmedAddOn[],
  awards: readonly ConfirmedAward[]
): ContributionSummary {
  let addOnGrossPaise = 0
  let addOnContributionPaise = 0
  let addOnCount = 0

  for (const a of addOns) {
    const qty = Math.max(0, a.qty)
    addOnGrossPaise += a.pricePaise * qty
    // Contribution, not revenue. Revenue flatters the number and the operator
    // will notice; what he keeps is the thing he can check against his P&L.
    addOnContributionPaise += (a.pricePaise - a.foodCostPaise) * qty
    addOnCount += qty
  }

  let prizeCostPaise = 0
  for (const w of awards) {
    prizeCostPaise += w.foodCostPaise
  }

  return {
    addOnGrossPaise,
    addOnContributionPaise,
    prizeCostPaise,
    netContributionPaise: addOnContributionPaise - prizeCostPaise,
    addOnCount,
    awardCount: awards.length,
  }
}

export interface EngagementSummary {
  tentedTables: number
  scannedTables: number
  roundsStarted: number
  roundsCompleted: number
  /** Percentage, 0–100. Zero tented tables reports 0 rather than dividing. */
  scanRatePct: number
  completionRatePct: number
}

export function summariseEngagement(input: {
  tentedTables: number
  scannedTables: number
  roundsStarted: number
  roundsCompleted: number
}): EngagementSummary {
  const scanRatePct = input.tentedTables > 0 ? (input.scannedTables / input.tentedTables) * 100 : 0
  const completionRatePct =
    input.roundsStarted > 0 ? (input.roundsCompleted / input.roundsStarted) * 100 : 0

  return {
    ...input,
    scanRatePct: Math.round(scanRatePct * 10) / 10,
    completionRatePct: Math.round(completionRatePct * 10) / 10,
  }
}
