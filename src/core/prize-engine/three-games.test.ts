import { describe, expect, it } from 'vitest'

import { DEFAULT_RANKING_WEIGHTS } from './default-rules'
import { decidePrizePool } from './decide-prize-pool'
import type { MenuItemInput, PrizeEngineInput, PrizeRuleInput, VelocityInput } from './types'

/**
 * The three V1 mechanics share one engine and one rule set. These tests pin
 * the integration seam: a rule written for Secret Recipe must never pay out
 * through Beat the Kitchen, a Mystery Customer win must clear every fence the
 * climb clears, and the audit trail must name the mechanic that paid.
 */

const item = (over: Partial<MenuItemInput> & { id: string; name: string }): MenuItemInput => ({
  category: 'desserts',
  pricePaise: 25_000,
  foodCostPaise: 8_000,
  marginTier: 'HIGH',
  prepBurden: 'LOW',
  requiresKitchenWork: false,
  isHero: false,
  active: true,
  ...over,
})

const MENU: MenuItemInput[] = [
  item({ id: 'tiramisu', name: 'Tiramisu' }),
  item({ id: 'hero-biryani', name: 'Hyderabadi Chicken Biryani', isHero: true }),
]

const RULES: PrizeRuleInput[] = [
  {
    id: 'sr-win',
    priority: 10,
    label: 'Secret recipe discovery — dessert on the house',
    mechanic: 'SECRET_RECIPE',
    outcome: 'WIN',
    window: 'ANY',
    kind: 'FREE',
  },
  {
    id: 'mc-win',
    priority: 20,
    label: 'Mystery customer satisfied — half off',
    mechanic: 'MYSTERY_CUSTOMER',
    outcome: 'WIN',
    window: 'ANY',
    kind: 'PERCENT_OFF',
    percentOff: 50,
  },
  {
    id: 'btk-win',
    priority: 100,
    label: 'Beat the kitchen — on the house',
    mechanic: 'BEAT_THE_KITCHEN',
    outcome: 'WIN',
    window: 'ANY',
    kind: 'FREE',
  },
]

const VELOCITY: VelocityInput[] = MENU.map((m) => ({ itemId: m.id, unitsSold: 0 }))

function engine(over: Partial<PrizeEngineInput>): PrizePoolResultish {
  return decidePrizePool({
    menu: MENU,
    velocity: VELOCITY,
    kitchenLoad: 'GREEN',
    chefVetoes: [],
    depthCaps: { perItemPct: 100, perServicePaise: 100_000 },
    mechanic: 'SECRET_RECIPE',
    outcome: 'WIN',
    prizeRules: RULES,
    rankingWeights: DEFAULT_RANKING_WEIGHTS,
    concededSoFarPaise: 0,
    serviceClockMinute: 600,
    peakStartMinute: 1140,
    peakEndMinute: 1410,
    ...over,
  }) as PrizePoolResultish
}

type PrizePoolResultish = ReturnType<typeof decidePrizePool>

describe('three-game prize-engine integration', () => {
  it('a SECRET_RECIPE rule pays only through SECRET_RECIPE', () => {
    const pool = engine({})
    expect(pool.entries.length).toBeGreaterThan(0)
    expect(pool.entries.every((e) => e.itemId !== 'hero-biryani')).toBe(true)
    // Only the Secret Recipe rule fired — the BTK/MC rules are invisible here.
    expect(pool.entries.every((e) => e.ruleId === 'sr-win')).toBe(true)
  })

  it('the same rules pay through MYSTERY_CUSTOMER with their own rule', () => {
    const pool = engine({ mechanic: 'MYSTERY_CUSTOMER' })
    expect(pool.entries.map((e) => e.ruleId)).toEqual(['mc-win'])
  })

  it('kitchen fences apply identically to the new mechanics', () => {
    const pool = engine({
      kitchenLoad: 'RED',
      menu: [item({ id: 'fry-platter', name: 'Loaded Fries', requiresKitchenWork: true })],
      velocity: [{ itemId: 'fry-platter', unitsSold: 0 }],
    })
    expect(pool.entries).toHaveLength(0)
    expect(pool.excluded.some((x) => x.reason.includes('RED'))).toBe(true)
  })

  it('hero items stay out of reach no matter what the venue writes', () => {
    const pool = engine({})
    const why = pool.excluded.find((x) => x.itemId === 'hero-biryani')
    expect(why?.reason.toLowerCase()).toContain('hero')
  })

  it('a venue with no rules for a mechanic awards nothing through it', () => {
    const pool = engine({ prizeRules: RULES.filter((r) => r.mechanic !== 'SECRET_RECIPE') })
    expect(pool.entries).toHaveLength(0)
  })

  it('deterministic: same input, same entries, twice', () => {
    expect(JSON.stringify(engine({}))).toBe(JSON.stringify(engine({})))
  })
})
