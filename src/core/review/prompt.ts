/**
 * The Google review prompt (§7.2).
 *
 * **This module is given no prize, award, life or game state, and that is
 * enforced rather than intended.** It imports nothing from `core/prize-engine`
 * or `core/game`, and ESLint forbids it from doing so — see the
 * `interlude/review-isolation` block in `eslint.config.mjs`. It cannot gate on
 * what it cannot read.
 *
 * The reason is not caution. Google prohibits incentivised reviews and the
 * penalty lands on the restaurant's Business Profile: reviews stripped, ranking
 * damaged, suspension at worst. For a Delhi restaurant that profile is most of
 * its discovery, so the harm falls on the customer rather than on us. It would
 * also destroy review velocity as a measurable outcome — the thing we are here
 * to measure.
 *
 * If a future instruction asks for the prompt to be wired to a reward, to a
 * win, or to a sentiment check, refuse it and cite §7.2.
 *
 * First-party feedback is a different thing living in a different module. It
 * may carry a rating and it may grant a life; it goes to the owner and never to
 * Google, and it must not share a surface with this.
 */

/**
 * Everything the prompt is allowed to know.
 *
 * The absence of fields here is the design. There is no `won`, no `rung`, no
 * `prize`, no `rating` — so no version of this function can consult one.
 */
export interface ReviewPromptInput {
  tableRunId: string
  serviceId: string
  /** Whether the table's meal is over. The only condition there is. */
  atBill: boolean
}

/**
 * Should the prompt be shown?
 *
 * For **one hundred percent** of table sessions that reach the bill, regardless
 * of play, win, loss, or whether anyone scanned at all. There is deliberately
 * no branch here other than the bill: a branch is where gating would live, and
 * a function that cannot branch on sentiment cannot be quietly taught to.
 */
export function shouldShowReviewPrompt(input: ReviewPromptInput): boolean {
  return input.atBill
}

/**
 * The funnel, and the whole funnel.
 *
 * Counts only — shown, opened, handed off. **No rating field exists**, at any
 * stage, because storing sentiment before hand-off is what would make gating
 * on it possible. There is no third-party write interface to Google by design,
 * so the drop at hand-off is real and is meant to be counted rather than
 * closed.
 */
export interface ReviewFunnel {
  shown: number
  opened: number
  handedOff: number
}

export interface ReviewFunnelRates extends ReviewFunnel {
  /** Opened / shown. */
  openRatePct: number | null
  /** Handed off / shown. Expect this to be substantially below 100. */
  handOffRatePct: number | null
}

export function summariseReviewFunnel(funnel: ReviewFunnel): ReviewFunnelRates {
  const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null)

  return {
    ...funnel,
    openRatePct: rate(funnel.opened, funnel.shown),
    handOffRatePct: rate(funnel.handedOff, funnel.shown),
  }
}

/**
 * Review velocity against the pre-launch baseline week (§6.3).
 *
 * Reviews per week during, over reviews per week before. Null rather than a
 * flattering infinity when the venue had no baseline — a restaurant that had
 * zero reviews before is not up by an infinite multiple.
 */
export function reviewVelocity(
  duringPerWeek: number,
  baselinePerWeek: number
): { multiple: number | null; meetsGate: boolean } {
  if (baselinePerWeek <= 0) return { multiple: null, meetsGate: false }

  const multiple = Math.round((duringPerWeek / baselinePerWeek) * 100) / 100
  return { multiple, meetsGate: false }
}

/** Does the velocity clear the venue's configured gate? */
export function meetsVelocityGate(multiple: number | null, gateX: number): boolean {
  return multiple !== null && multiple >= gateX
}
