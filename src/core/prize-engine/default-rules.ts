import type { PrizeRuleInput, RankingWeights } from './types'

/**
 * The ranking a venue starts with, on the same terms as the rules below: a
 * **seed, not a constant**. Written into `VenueConfig.rankingWeights` at venue
 * creation and editable from `/dash/prizes`; nothing reads this file at
 * runtime.
 *
 * These numbers used to be literals inside `scoreItem`, which meant the one
 * judgement the operator most needs to own — *what do I most want to shift
 * tonight?* — was the only one they could not reach. The values are unchanged,
 * so no venue's pool reorders on the way in.
 */
export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  notSelling: 40,
  slowMover: 25,
  fastMoverPenalty: -20,
  stale: 15,
  lowPrepBonus: 10,
  highPrepPenalty: -10,

  slowMoverMaxUnits: 3,
  fastMoverMinUnits: 20,
  staleMinDays: 2,
}

/**
 * The policy a venue starts with, before the operator touches anything.
 *
 * These are a **seed, not a constant** (PLATFORM.md §10). They are written into
 * `PrizeRule` rows at venue creation and are editable from `/dash/prizes`
 * immediately afterwards. Nothing in the engine reads this file at runtime —
 * if a venue deletes every rule, it offers no prizes, and that is a legitimate
 * (if unwise) thing for an operator to choose.
 *
 * The shape encodes one opinion worth keeping: **concede less at peak.** A
 * table at 8pm on Saturday was coming anyway; a table at 4pm on Tuesday is the
 * one worth buying.
 */
export function defaultPrizeRules(): PrizeRuleInput[] {
  return [
    {
      id: 'default-win-low-margin-peak',
      priority: 10,
      label: 'Low margin at peak — half off rather than free',
      mechanic: 'BEAT_THE_KITCHEN',
      outcome: 'WIN',
      marginTier: 'LOW',
      window: 'PEAK',
      kind: 'PERCENT_OFF',
      percentOff: 50,
    },
    {
      id: 'default-win',
      priority: 100,
      label: 'Beat the kitchen — on the house',
      mechanic: 'BEAT_THE_KITCHEN',
      outcome: 'WIN',
      window: 'ANY',
      kind: 'FREE',
    },
    {
      // A loss must still be worth something. This rule is why the outcome
      // screen never dead-ends, so deleting it is a bigger decision than it
      // looks from the config screen.
      id: 'default-lose',
      priority: 100,
      label: 'Close one — half off',
      mechanic: 'BEAT_THE_KITCHEN',
      outcome: 'LOSE',
      window: 'ANY',
      kind: 'PERCENT_OFF',
      percentOff: 50,
    },
  ]
}
