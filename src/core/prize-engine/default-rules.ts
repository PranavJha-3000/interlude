import type { PrizeRuleInput } from './types'

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
export function defaultPrizeRules(mysteryPlatePricePaise: number): PrizeRuleInput[] {
  return [
    {
      id: 'default-win-low-margin-peak',
      priority: 10,
      label: 'Low margin at peak — half off rather than free',
      mechanic: 'KITCHEN_ROUND',
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
      mechanic: 'KITCHEN_ROUND',
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
      mechanic: 'KITCHEN_ROUND',
      outcome: 'LOSE',
      window: 'ANY',
      kind: 'PERCENT_OFF',
      percentOff: 50,
    },
    {
      id: 'default-mystery-win',
      priority: 100,
      label: "Mystery plate — the kitchen's choice at a fixed price",
      mechanic: 'MYSTERY_PLATE',
      outcome: 'WIN',
      window: 'ANY',
      kind: 'FIXED_PRICE',
      fixedPricePaise: mysteryPlatePricePaise,
    },
    {
      id: 'default-mystery-lose',
      priority: 100,
      label: "Mystery plate — the kitchen's choice at a fixed price",
      mechanic: 'MYSTERY_PLATE',
      outcome: 'LOSE',
      window: 'ANY',
      kind: 'FIXED_PRICE',
      fixedPricePaise: mysteryPlatePricePaise,
    },
  ]
}
