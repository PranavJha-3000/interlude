/**
 * The owner's ledger and the two tiers (§6.4, §9.4).
 *
 * Pure. The dashboard reads rows out of this and renders them; it does no
 * arithmetic of its own, so what the operator sees and what the Monday email
 * says cannot drift apart.
 *
 * **The two tiers are never merged and never averaged.** The app estimate is
 * live from the first table and is honest about being an estimate. The
 * POS-backed figure takes the headline the moment the first bill export lands.
 * Averaging them would produce a number with no defensible meaning at all —
 * and the whole pitch to the operator is that the numbers are defensible.
 */

export type Tier = 'APP_ESTIMATE' | 'POS_BACKED'

export interface LedgerRow {
  atMs: number
  tableLabel: string
  /** What the table did — "Rung 3", "No prize". */
  result: string
  prizeName: string | null
  prizeCostPaise: number
  /** Add-on contribution attributable to this table. */
  extraSpendPaise: number
  netPaise: number
}

export interface LedgerTotals {
  prizeCostPaise: number
  extraSpendPaise: number
  netPaise: number
  rows: number
}

export function totalLedger(rows: readonly LedgerRow[]): LedgerTotals {
  return rows.reduce<LedgerTotals>(
    (t, r) => ({
      prizeCostPaise: t.prizeCostPaise + r.prizeCostPaise,
      extraSpendPaise: t.extraSpendPaise + r.extraSpendPaise,
      netPaise: t.netPaise + r.netPaise,
      rows: t.rows + 1,
    }),
    { prizeCostPaise: 0, extraSpendPaise: 0, netPaise: 0, rows: 0 }
  )
}

/**
 * Which tier owns the headline.
 *
 * One bill is enough. The moment a real export exists for a service, the
 * estimate stops being the best available answer and continuing to lead with it
 * would be a choice to show the flattering number.
 */
export function tierFor(importedBillCount: number): Tier {
  return importedBillCount > 0 ? 'POS_BACKED' : 'APP_ESTIMATE'
}

/**
 * Why a night went negative (§9.4).
 *
 * A negative night is a trade the operator made, not an error, and the screen
 * has to say which trade. Silence here reads as a bug and gets the pilot
 * cancelled by someone who thinks the software is broken.
 *
 * Returns null when the night is positive — there is nothing to explain, and
 * explaining a good night unprompted is how a dashboard starts editorialising.
 */
export function explainNegative(input: {
  netContributionPaise: number
  minutesAtRed: number
  minutesKilled: number
  prizeCostPaise: number
  addOnContributionPaise: number
}): { reason: string } | null {
  if (input.netContributionPaise >= 0) return null

  if (input.minutesKilled > 0) {
    return {
      reason: `Prizes were switched off for ${input.minutesKilled} minutes, so awards already given still cost their food while no new spend came in behind them.`,
    }
  }

  if (input.minutesAtRed > 0) {
    return {
      reason: `The kitchen ran red for ${input.minutesAtRed} minutes, so the high-margin prizes were off and the pool leaned on discounts.`,
    }
  }

  if (input.addOnContributionPaise === 0) {
    return {
      reason:
        'Prizes were claimed but nothing was added to an order, so there is no extra spend to set against their cost.',
    }
  }

  return {
    reason: 'The prizes claimed tonight cost more than the extra spend they brought in.',
  }
}

/**
 * Minutes a service spent in a given state, from its append-only rows.
 *
 * Each row is a change; a state runs until the next one, or until the service
 * ends. Written this way because `KitchenLoad` is append-only for exactly this
 * reason — "when did the kitchen go red, and for how long" is part of
 * explaining the night's numbers afterwards.
 */
export function minutesInState<T extends string>(
  changes: readonly { state: T; atMs: number }[],
  match: T,
  serviceEndMs: number
): number {
  const ordered = [...changes].sort((a, b) => a.atMs - b.atMs)
  let total = 0

  for (let i = 0; i < ordered.length; i++) {
    const current = ordered[i]!
    if (current.state !== match) continue
    const until = ordered[i + 1]?.atMs ?? serviceEndMs
    total += Math.max(0, until - current.atMs)
  }

  return Math.round(total / 60_000)
}
