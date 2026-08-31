import type { PrizeEntry } from './types'

/**
 * The returning-guest reward (§10 loyalty), as two pure decisions.
 *
 * **Neither of these chooses what the prize is.** `decidePrizePool` does that,
 * and by the time these run it has already applied the hero rule, the chef's
 * vetoes, the kitchen load, the per-item and per-service depth caps and the
 * venue's own prize rules. What is left here is only: is a reward due, and
 * which of the already-fenced entries fits the loyalty ceiling.
 *
 * That is the whole reason loyalty does not get its own prize path. A second
 * chooser is how one of them forgets a fence, and the one that forgets is the
 * one nobody reads.
 */

export interface LoyaltyRewardInput {
  /** Straight off `decidePrizePool` — already fenced, ranked and reasoned. */
  entries: readonly PrizeEntry[]
  /** Which visit this is, for the audit string. */
  visitNumber: number
  /** `VenueConfig.loyaltyRewardMaxValuePaise`. Composes with the depth caps. */
  maxValuePaise: number
}

export type LoyaltyRewardResult =
  { chosen: PrizeEntry; reason: string } | { chosen: null; reason: string }

/** Local, as `core/measurement/weekly-report.ts` does it — `core/` does not
 *  reach into `lib/` for a formatter. */
function rupees(paise: number): string {
  return `₹${Math.abs(Math.round(paise / 100)).toLocaleString('en-IN')}`
}

/** "1st", "2nd", "3rd", "4th" — including the 11-13 exception people hear. */
function ordinal(n: number): string {
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

/**
 * Is a reward due?
 *
 * Takes **visits since the last rewarded visit**, deliberately, rather than the
 * lifetime visit number. The obvious `visitNumber % required` is wrong in a way
 * that only shows up after an operator edits their config: lowering the
 * threshold from 8 to 3 would retroactively make every guest with three or more
 * lifetime visits due that evening, and hand out a round of free desserts
 * nobody earned. Counting since the last reward means a config change affects
 * only the *next* threshold, which is the behaviour a server can explain out
 * loud.
 *
 * `required <= 0` means the venue has switched it off, not that every visit
 * wins. The generous reading of a typo costs the venue its menu.
 */
export function loyaltyRewardDue(visitsSinceLastReward: number, required: number): boolean {
  if (required <= 0) return false
  return visitsSinceLastReward >= required
}

/**
 * Which already-fenced entry to give.
 *
 * The highest-scoring one the ceiling can afford — not the cheapest. The engine
 * ranked the pool by what this venue actually wants to move; the ceiling only
 * removes what it cannot pay for.
 *
 * When nothing fits it returns a **refusal carrying a reason**, and does not
 * fall through to a fallback. A loyalty reward the venue cannot afford is a
 * legible refusal on `/dash/prizes`; the fallback exists for `claimPrize`,
 * where a guest has *earned a rung* and §5 forbids telling them there is
 * nothing.
 */
export function chooseLoyaltyReward(input: LoyaltyRewardInput): LoyaltyRewardResult {
  const { entries, visitNumber, maxValuePaise } = input
  const visit = `${ordinal(visitNumber)} visit`

  if (entries.length === 0) {
    return {
      chosen: null,
      reason: `Nothing in tonight's pool to give — ${visit}, but every item is behind a fence`,
    }
  }

  // `entries` arrives sorted by score, so the first affordable one is the
  // highest-scoring affordable one.
  const affordable = entries.find((e) => e.valuePaise <= maxValuePaise)

  if (!affordable) {
    return {
      chosen: null,
      reason: `Every item in tonight's pool is over the ${rupees(maxValuePaise)} loyalty ceiling — ${visit}`,
    }
  }

  return {
    chosen: affordable,
    reason: `${affordable.reason} — ${visit}, within the ${rupees(maxValuePaise)} loyalty ceiling`,
  }
}
