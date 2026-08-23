import { describe, expect, it } from 'vitest'

import { decidePrizePool } from '@/core/prize-engine'
import type {
  DepthCaps,
  MenuItemInput,
  PrizeEngineInput,
  PrizeRuleInput,
} from '@/core/prize-engine/types'

/**
 * The prize engine must serve all three V1 mechanics through the one door.
 *
 * Nothing here is game-specific: the same pure function decides Beat the
 * Kitchen's ladder prize, a Secret Recipe discovery and a Mystery Customer
 * meal, purely because the caller passed a different `mechanic`. That single
 * seam is what stops three reward systems from growing (PLATFORM.md §5).
 */

const depthCaps: DepthCaps = { perItemPct: 100, perServicePaise: 500_000 }

const menu: MenuItemInput[] = [
  {
    id: 'peri-fries',
    name: 'Peri Peri Chicken Fries',
    category: 'SIDES',
    pricePaise: 24_900,
    foodCostPaise: 7_000,
    marginTier: 'HIGH',
    prepBurden: 'LOW',
    requiresKitchenWork: true,
    isHero: false,
    active: true,
  },
  {
    id: 'mango-lassi',
    name: 'Mango Lassi',
    category: 'DRINKS',
    pricePaise: 12_000,
    foodCostPaise: 3_000,
    marginTier: 'HIGH',
    prepBurden: 'LOW',
    requiresKitchenWork: false,
    isHero: false,
    active: true,
  },
]

function input(overrides: Partial<PrizeEngineInput>): PrizeEngineInput {
  return {
    menu,
    velocity: [],
    kitchenLoad: 'GREEN',
    chefVetoes: [],
    depthCaps,
    mechanic: 'BEAT_THE_KITCHEN',
    outcome: 'WIN',
    prizeRules: [],
    rankingWeights: {
      notSelling: 40,
      slowMover: 25,
      fastMoverPenalty: -20,
      stale: 15,
      lowPrepBonus: 10,
      highPrepPenalty: -10,
      slowMoverMaxUnits: 3,
      fastMoverMinUnits: 20,
      staleMinDays: 2,
    },
    concededSoFarPaise: 0,
    serviceClockMinute: 600,
    peakStartMinute: 1140,
    peakEndMinute: 1380,
    ...overrides,
  }
}

function winRule(mechanic: PrizeRuleInput['mechanic']): PrizeRuleInput {
  return {
    id: `seed-${mechanic}`,
    priority: 100,
    label: `${mechanic} on the house`,
    mechanic,
    outcome: 'WIN',
    window: 'ANY',
    kind: 'FREE',
  }
}

describe('prize engine serves every V1 mechanic through one function', () => {
  const mechanics = ['BEAT_THE_KITCHEN', 'SECRET_RECIPE', 'MYSTERY_CUSTOMER'] as const

  for (const mechanic of mechanics) {
    it(`awards a WIN pool for ${mechanic}`, () => {
      const result = decidePrizePool(input({ mechanic, prizeRules: [winRule(mechanic)] }))
      expect(result.entries.length).toBeGreaterThan(0)
      // Every entry carries an explanation — the operator audits by reading,
      // never by trusting (§5).
      for (const entry of result.entries) {
        expect(entry.reason.length).toBeGreaterThan(0)
      }
    })

    it(`gives ${mechanic} nothing when the venue deleted its rules`, () => {
      const result = decidePrizePool(input({ mechanic, prizeRules: [] }))
      expect(result.entries).toHaveLength(0)
      expect(result.excluded.length).toBeGreaterThan(0)
    })
  }

  it('does not leak one mechanic’s rule into another', () => {
    const btkOnly = decidePrizePool(
      input({ mechanic: 'SECRET_RECIPE', prizeRules: [winRule('BEAT_THE_KITCHEN')] })
    )
    expect(btkOnly.entries).toHaveLength(0)

    const secretOnly = decidePrizePool(
      input({ mechanic: 'BEAT_THE_KITCHEN', prizeRules: [winRule('SECRET_RECIPE')] })
    )
    expect(secretOnly.entries).toHaveLength(0)
  })

  it('is deterministic across mechanics — same input, same pool, twice', () => {
    const rules = mechanics.map(winRule)
    for (const mechanic of mechanics) {
      const a = decidePrizePool(input({ mechanic, prizeRules: rules }))
      const b = decidePrizePool(input({ mechanic, prizeRules: rules }))
      expect(a).toEqual(b)
    }
  })

  it('keeps kitchen fences intact for the new mechanics — RED blocks work', () => {
    const result = decidePrizePool(
      input({
        mechanic: 'SECRET_RECIPE',
        outcome: 'WIN',
        kitchenLoad: 'RED',
        prizeRules: [winRule('SECRET_RECIPE')],
      })
    )
    // Peri Peri fries need the pass; the lassi does not.
    const ids = result.entries.map((e) => e.itemId)
    expect(ids).not.toContain('peri-fries')
    expect(ids).toContain('mango-lassi')
  })
})
