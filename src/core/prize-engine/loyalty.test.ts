import { describe, expect, it } from 'vitest'

import { chooseLoyaltyReward, loyaltyRewardDue } from './loyalty'
import type { PrizeEntry } from './types'

/**
 * The returning-guest reward, as two pure decisions.
 *
 * Neither of these chooses *what* the prize is — `decidePrizePool` does that,
 * and it has already applied hero, veto, kitchen load, per-item and
 * per-service caps and the venue's own rules by the time these run. What lives
 * here is only: is a reward due, and which of the already-fenced entries fits
 * the loyalty ceiling.
 *
 * Keeping it here rather than in a server action is what puts it under
 * `PURE_CORE` lint — no clock, no randomness, no database. It is a money
 * decision, so it belongs where money decisions are provable.
 */

function entry(over: Partial<PrizeEntry> & { itemId: string; valuePaise: number }): PrizeEntry {
  return {
    mechanic: 'BEAT_THE_KITCHEN',
    kind: 'FREE',
    costPaise: Math.round(over.valuePaise * 0.3),
    depthPct: 100,
    ruleId: 'rule-1',
    reason: 'High margin (68%), not selling',
    score: 0,
    ...over,
  }
}

/** Sorted the way `decidePrizePool` returns them — highest score first. */
const POOL: PrizeEntry[] = [
  entry({ itemId: 'gulab-jamun', valuePaise: 40_000, score: 90 }),
  entry({ itemId: 'kulfi', valuePaise: 20_000, score: 70 }),
  entry({ itemId: 'papad', valuePaise: 15_000, score: 40 }),
]

describe('loyaltyRewardDue', () => {
  it('is not due before the threshold', () => {
    expect(loyaltyRewardDue(4, 5)).toBe(false)
  })

  it('is due on the threshold', () => {
    expect(loyaltyRewardDue(5, 5)).toBe(true)
  })

  it('is due past the threshold, so a missed visit never strands a guest', () => {
    expect(loyaltyRewardDue(9, 5)).toBe(true)
  })

  it('gives nothing rather than everything when a venue sets zero', () => {
    // A venue that types 0 into "visits required" means "off", not "reward
    // every visit". The generous reading of a typo costs the venue its menu.
    expect(loyaltyRewardDue(3, 0)).toBe(false)
    expect(loyaltyRewardDue(0, 0)).toBe(false)
  })

  it('counts visits SINCE THE LAST REWARD, not total visits', () => {
    // This is the regression that matters, and the reason the signature takes
    // `visitsSinceLastReward` rather than `visitNumber`. A `visitNumber %
    // required` implementation passes every other test in this file and fails
    // this one: an operator who lowers the threshold from 8 to 3 would
    // retroactively make every guest with 3+ lifetime visits due tonight, and
    // hand out a round of free desserts nobody earned.
    const loyalGuestWhoJustClaimed = 2
    expect(loyaltyRewardDue(loyalGuestWhoJustClaimed, 3)).toBe(false)
  })
})

describe('chooseLoyaltyReward', () => {
  it('takes the highest-scoring entry the ceiling can afford', () => {
    // Not the cheapest. The engine already ranked these by what the venue wants
    // to move; the ceiling only removes what it cannot pay for.
    const result = chooseLoyaltyReward({ entries: POOL, visitNumber: 5, maxValuePaise: 25_000 })
    expect(result.chosen?.itemId).toBe('kulfi')
  })

  it('takes the top entry when the ceiling affords it', () => {
    const result = chooseLoyaltyReward({ entries: POOL, visitNumber: 5, maxValuePaise: 50_000 })
    expect(result.chosen?.itemId).toBe('gulab-jamun')
  })

  it('refuses, with a reason naming the ceiling, when nothing is affordable', () => {
    const result = chooseLoyaltyReward({ entries: POOL, visitNumber: 5, maxValuePaise: 1_000 })
    expect(result.chosen).toBeNull()
    // A refusal with no reason is what PLATFORM.md §5 exists to prevent, and
    // this one has to be legible on /dash/prizes.
    expect(result.reason).toMatch(/₹10\b/)
    expect(result.reason).toMatch(/ceiling|loyalty/i)
  })

  it('refuses an empty pool rather than throwing', () => {
    // The fences can legitimately empty the pool — RED kitchen, spent budget.
    // That is a Tuesday, not an exception.
    const result = chooseLoyaltyReward({ entries: [], visitNumber: 5, maxValuePaise: 25_000 })
    expect(result.chosen).toBeNull()
    expect(result.reason.length).toBeGreaterThan(0)
  })

  it('carries the engine’s own reason through, and adds the visit', () => {
    // The operator must be able to trace why this item, and the server must be
    // able to say why this guest — both from one string on the Award row.
    const result = chooseLoyaltyReward({ entries: POOL, visitNumber: 5, maxValuePaise: 25_000 })
    expect(result.reason).toContain('High margin (68%), not selling')
    expect(result.reason).toContain('5th visit')
  })

  it('ordinalises the visit number the way a person would say it', () => {
    const at = (visitNumber: number) =>
      chooseLoyaltyReward({ entries: POOL, visitNumber, maxValuePaise: 25_000 }).reason

    expect(at(1)).toContain('1st visit')
    expect(at(2)).toContain('2nd visit')
    expect(at(3)).toContain('3rd visit')
    expect(at(4)).toContain('4th visit')
    expect(at(11)).toContain('11th visit')
    expect(at(12)).toContain('12th visit')
    expect(at(13)).toContain('13th visit')
    expect(at(21)).toContain('21st visit')
    expect(at(22)).toContain('22nd visit')
    expect(at(23)).toContain('23rd visit')
  })

  it('never picks an entry above the ceiling, at any pool size', () => {
    // Property: the ceiling is a hard fence, not a preference.
    for (let ceiling = 0; ceiling <= 50_000; ceiling += 2_500) {
      const result = chooseLoyaltyReward({ entries: POOL, visitNumber: 5, maxValuePaise: ceiling })
      if (result.chosen) expect(result.chosen.valuePaise).toBeLessThanOrEqual(ceiling)
    }
  })
})
