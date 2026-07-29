import { describe, expect, it } from 'vitest'
import { decidePrizePool } from './decide-prize-pool'
import { defaultPrizeRules } from './default-rules'
import type { MenuItemInput, PrizeEngineInput, PrizeRuleInput } from './types'

/**
 * These are the compliance invariants from PLATFORM.md §7, not style tests.
 * Each one corresponds to a promise made to the operator or to a legal line.
 */

const MYSTERY_PRICE = 9900

function item(over: Partial<MenuItemInput> & { id: string }): MenuItemInput {
  return {
    name: `Item ${over.id}`,
    category: 'dessert',
    pricePaise: 30000,
    foodCostPaise: 9000,
    marginTier: 'HIGH',
    prepBurden: 'LOW',
    requiresKitchenWork: true,
    isHero: false,
    active: true,
    ...over,
  }
}

function rule(over: Partial<PrizeRuleInput> & { id: string }): PrizeRuleInput {
  return {
    priority: 100,
    label: 'Test rule',
    mechanic: 'KITCHEN_ROUND',
    outcome: 'WIN',
    window: 'ANY',
    kind: 'FREE',
    ...over,
  }
}

function input(over: Partial<PrizeEngineInput> = {}): PrizeEngineInput {
  return {
    menu: [
      item({ id: 'tiramisu' }),
      item({ id: 'gulab-jamun', pricePaise: 18000, foodCostPaise: 5000, marginTier: 'MID' }),
      item({ id: 'biryani', pricePaise: 45000, foodCostPaise: 20000, isHero: true }),
      item({ id: 'kulfi', pricePaise: 12000, foodCostPaise: 4000, requiresKitchenWork: false }),
    ],
    velocity: [
      { itemId: 'tiramisu', unitsSold: 0, daysSinceLastSale: 4 },
      { itemId: 'gulab-jamun', unitsSold: 25 },
      { itemId: 'kulfi', unitsSold: 8 },
    ],
    kitchenLoad: 'GREEN',
    chefVetoes: [],
    depthCaps: { perItemPct: 100, perServicePaise: 500000 },
    mechanic: 'KITCHEN_ROUND',
    outcome: 'WIN',
    prizeRules: defaultPrizeRules(MYSTERY_PRICE),
    concededSoFarPaise: 0,
    serviceClockMinute: 13 * 60,
    peakStartMinute: 19 * 60,
    peakEndMinute: 23 * 60,
    ...over,
  }
}

describe('determinism (PLATFORM.md §7 — outcome is a pure function of input)', () => {
  it('returns byte-identical output across 100 runs', () => {
    const i = input()
    const first = JSON.stringify(decidePrizePool(i))
    for (let n = 0; n < 100; n++) {
      expect(JSON.stringify(decidePrizePool(i))).toBe(first)
    }
  })

  it('does not depend on the order menu rows arrive in', () => {
    const base = input()
    const reversed = input({ menu: [...base.menu].reverse() })
    expect(decidePrizePool(reversed)).toEqual(decidePrizePool(base))
  })

  it('does not depend on the order prize rules arrive in', () => {
    const base = input()
    const reversed = input({ prizeRules: [...base.prizeRules].reverse() })
    expect(decidePrizePool(reversed)).toEqual(decidePrizePool(base))
  })
})

describe("the venue's fences are absolute", () => {
  it('never includes a chef-vetoed item', () => {
    const r = decidePrizePool(input({ chefVetoes: ['tiramisu'] }))
    expect(r.entries.map((e) => e.itemId)).not.toContain('tiramisu')
    expect(r.excluded).toContainEqual({ itemId: 'tiramisu', reason: 'Chef vetoed' })
  })

  it('honours a veto even for the item that would otherwise score highest', () => {
    const unvetoed = decidePrizePool(input())
    const top = unvetoed.entries[0]
    expect(top).toBeDefined()
    const r = decidePrizePool(input({ chefVetoes: [top!.itemId] }))
    expect(r.entries.map((e) => e.itemId)).not.toContain(top!.itemId)
  })

  it('never exceeds the per-item depth cap', () => {
    const r = decidePrizePool(input({ depthCaps: { perItemPct: 40, perServicePaise: 500000 } }))
    for (const e of r.entries) expect(e.depthPct).toBeLessThanOrEqual(40)
  })

  it('never concedes more than the service budget has left', () => {
    const r = decidePrizePool(
      input({ depthCaps: { perItemPct: 100, perServicePaise: 20000 }, concededSoFarPaise: 5000 })
    )
    for (const e of r.entries) expect(e.valuePaise).toBeLessThanOrEqual(15000)
  })

  it('never promotes a hero item', () => {
    const r = decidePrizePool(input())
    expect(r.entries.map((e) => e.itemId)).not.toContain('biryani')
    expect(r.excluded).toContainEqual({
      itemId: 'biryani',
      reason: 'Hero item — never discounted',
    })
  })

  it('will not let an operator write a rule that reaches a hero item', () => {
    // The most targeted rule possible: this exact item, free. §12 still wins.
    const r = decidePrizePool(
      input({
        prizeRules: [rule({ id: 'target-hero', priority: 1, menuItemId: 'biryani', kind: 'FREE' })],
      })
    )
    expect(r.entries.map((e) => e.itemId)).not.toContain('biryani')
    expect(r.excluded).toContainEqual({
      itemId: 'biryani',
      reason: 'Hero item — never discounted',
    })
  })

  it('excludes rather than clamps a rule that busts the per-item cap', () => {
    const r = decidePrizePool(
      input({
        menu: [item({ id: 'tiramisu' })],
        velocity: [],
        depthCaps: { perItemPct: 40, perServicePaise: 500000 },
        prizeRules: [rule({ id: 'too-deep', kind: 'FREE' })],
      })
    )
    expect(r.entries).toHaveLength(0)
    expect(r.excluded[0]?.reason).toBe('Over the per-item depth cap (100% > 40%)')
  })
})

describe('kitchen load suppression', () => {
  it('offers no kitchen-work prize while the pass is RED', () => {
    const r = decidePrizePool(input({ kitchenLoad: 'RED' }))
    const kitchenWorkIds = input()
      .menu.filter((m) => m.requiresKitchenWork)
      .map((m) => m.id)
    for (const id of kitchenWorkIds) {
      expect(r.entries.map((e) => e.itemId)).not.toContain(id)
    }
  })

  it('still offers no-kitchen-work items while RED, so the guest is never dead-ended', () => {
    const r = decidePrizePool(input({ kitchenLoad: 'RED' }))
    expect(r.entries.map((e) => e.itemId)).toContain('kulfi')
  })

  it('drops only high-prep items at AMBER', () => {
    const menu = [
      item({ id: 'quick', prepBurden: 'LOW' }),
      item({ id: 'slow', prepBurden: 'HIGH' }),
    ]
    const r = decidePrizePool(input({ menu, velocity: [], kitchenLoad: 'AMBER' }))
    const ids = r.entries.map((e) => e.itemId)
    expect(ids).toContain('quick')
    expect(ids).not.toContain('slow')
  })
})

describe('the audit trail (PLATFORM.md §5 — every decision carries a reason)', () => {
  it('gives every entry a non-empty reason and the rule that produced it', () => {
    const r = decidePrizePool(input())
    expect(r.entries.length).toBeGreaterThan(0)
    for (const e of r.entries) {
      expect(e.reason.trim().length).toBeGreaterThan(0)
      expect(e.ruleId.length).toBeGreaterThan(0)
    }
  })

  it("quotes the operator's own label for the rule that fired", () => {
    const r = decidePrizePool(
      input({
        menu: [item({ id: 'tiramisu' })],
        velocity: [],
        prizeRules: [rule({ id: 'mine', label: 'Tuesday dessert push' })],
      })
    )
    expect(r.entries[0]?.reason).toContain('tuesday dessert push')
  })

  it('gives every exclusion a non-empty reason', () => {
    const r = decidePrizePool(input({ kitchenLoad: 'RED', chefVetoes: ['kulfi'] }))
    expect(r.excluded.length).toBeGreaterThan(0)
    for (const x of r.excluded) expect(x.reason.trim().length).toBeGreaterThan(0)
  })

  it('accounts for every menu item exactly once, as either an entry or an exclusion', () => {
    const i = input()
    const r = decidePrizePool(i)
    const seen = [...r.entries.map((e) => e.itemId), ...r.excluded.map((x) => x.itemId)].sort()
    expect(seen).toEqual(i.menu.map((m) => m.id).sort())
  })
})

describe('what the engine is for', () => {
  it('ranks the item that is not selling above the one that already sells well', () => {
    const r = decidePrizePool(input())
    const ids = r.entries.map((e) => e.itemId)
    expect(ids.indexOf('tiramisu')).toBeLessThan(ids.indexOf('gulab-jamun'))
  })

  it('excludes an item that costs more to make than it sells for', () => {
    const menu = [item({ id: 'loss-leader', pricePaise: 10000, foodCostPaise: 12000 })]
    const r = decidePrizePool(input({ menu, velocity: [] }))
    expect(r.entries).toHaveLength(0)
    expect(r.excluded[0]?.reason).toBe('Food cost meets or exceeds price')
  })
})

describe('the venue sets the prizes (PLATFORM.md §10 — config, not constants)', () => {
  it('offers nothing at all when the venue has written no rules', () => {
    const r = decidePrizePool(input({ prizeRules: [] }))
    expect(r.entries).toHaveLength(0)
    for (const x of r.excluded) {
      if (x.itemId === 'tiramisu') expect(x.reason).toBe('No prize rule covers this item')
    }
  })

  it('applies an arbitrary discount percentage the operator chose', () => {
    const r = decidePrizePool(
      input({
        menu: [item({ id: 'tiramisu', pricePaise: 30000, foodCostPaise: 9000 })],
        velocity: [],
        prizeRules: [rule({ id: 'thirty', kind: 'PERCENT_OFF', percentOff: 30 })],
      })
    )
    const e = r.entries[0]
    expect(e?.kind).toBe('PERCENT_OFF')
    expect(e?.percentOff).toBe(30)
    expect(e?.valuePaise).toBe(9000) // 30% of ₹300
    expect(e?.depthPct).toBe(30)
    // The venue still collects ₹210, which covers the ₹90 of ingredients.
    expect(e?.costPaise).toBe(0)
  })

  it('lets a rule target one named item ahead of the venue-wide default', () => {
    const r = decidePrizePool(
      input({
        prizeRules: [
          rule({
            id: 'kulfi-only',
            priority: 1,
            menuItemId: 'kulfi',
            kind: 'PERCENT_OFF',
            percentOff: 20,
          }),
          rule({ id: 'everything-else', priority: 100, kind: 'FREE' }),
        ],
      })
    )
    const byId = new Map(r.entries.map((e) => [e.itemId, e]))
    expect(byId.get('kulfi')?.kind).toBe('PERCENT_OFF')
    expect(byId.get('kulfi')?.percentOff).toBe(20)
    expect(byId.get('tiramisu')?.kind).toBe('FREE')
  })

  it('lets a rule target a whole category', () => {
    const menu = [
      item({ id: 'kulfi', category: 'dessert' }),
      item({ id: 'lassi', category: 'drinks' }),
    ]
    const r = decidePrizePool(
      input({
        menu,
        velocity: [],
        prizeRules: [
          rule({
            id: 'drinks',
            priority: 1,
            category: 'drinks',
            kind: 'PERCENT_OFF',
            percentOff: 25,
          }),
          rule({ id: 'rest', priority: 100, kind: 'FREE' }),
        ],
      })
    )
    const byId = new Map(r.entries.map((e) => [e.itemId, e]))
    expect(byId.get('lassi')?.percentOff).toBe(25)
    expect(byId.get('kulfi')?.kind).toBe('FREE')
  })

  it('gives a losing guest the consolation rule, not the winning one', () => {
    const win = decidePrizePool(input({ outcome: 'WIN', menu: [item({ id: 'x' })], velocity: [] }))
    const lose = decidePrizePool(
      input({ outcome: 'LOSE', menu: [item({ id: 'x' })], velocity: [] })
    )
    expect(win.entries[0]?.kind).toBe('FREE')
    expect(lose.entries[0]?.kind).toBe('PERCENT_OFF')
    // A loss still ends in real value — that is the point of the rule existing.
    expect(lose.entries[0]?.valuePaise).toBeGreaterThan(0)
  })

  it('excludes an item rather than throwing when a rule is malformed', () => {
    const r = decidePrizePool(
      input({
        menu: [item({ id: 'tiramisu' })],
        velocity: [],
        prizeRules: [rule({ id: 'broken', label: 'Typo', kind: 'PERCENT_OFF', percentOff: 500 })],
      })
    )
    expect(r.entries).toHaveLength(0)
    expect(r.excluded[0]?.reason).toBe('Prize rule "Typo" has an invalid discount percentage')
  })

  it('ignores rules written for the other mechanic', () => {
    const r = decidePrizePool(
      input({
        menu: [item({ id: 'tiramisu' })],
        velocity: [],
        mechanic: 'KITCHEN_ROUND',
        prizeRules: [rule({ id: 'wrong-mechanic', mechanic: 'MYSTERY_PLATE', kind: 'FREE' })],
      })
    )
    expect(r.entries).toHaveLength(0)
    expect(r.excluded[0]?.reason).toBe('No prize rule covers this item')
  })
})

describe('the mystery plate is a product, never a draw (PLATFORM.md §7)', () => {
  it('always issues it as a fixed-price award', () => {
    const r = decidePrizePool(input({ mechanic: 'MYSTERY_PLATE' }))
    expect(r.entries.length).toBeGreaterThan(0)
    for (const e of r.entries) {
      expect(e.kind).toBe('FIXED_PRICE')
      expect(e.fixedPricePaise).toBe(MYSTERY_PRICE)
    }
  })

  it('refuses items the fixed price would not actually discount', () => {
    const menu = [item({ id: 'cheap', pricePaise: 8000, foodCostPaise: 2000 })]
    const r = decidePrizePool(input({ menu, velocity: [], mechanic: 'MYSTERY_PLATE' }))
    expect(r.entries).toHaveLength(0)
    expect(r.excluded[0]?.reason).toBe('Fixed price is not below the menu price')
  })
})

describe('peak behaviour concedes less', () => {
  it('gives a low-margin item away free off-peak but discounts it at peak', () => {
    const menu = [item({ id: 'thin', marginTier: 'LOW', pricePaise: 20000, foodCostPaise: 15000 })]
    const offPeak = decidePrizePool(input({ menu, velocity: [], serviceClockMinute: 15 * 60 }))
    const atPeak = decidePrizePool(input({ menu, velocity: [], serviceClockMinute: 20 * 60 }))
    expect(offPeak.entries[0]?.kind).toBe('FREE')
    expect(atPeak.entries[0]?.kind).toBe('PERCENT_OFF')
    expect(atPeak.entries[0]?.percentOff).toBe(50)
  })

  it('honours an OFF_PEAK-only rule', () => {
    const menu = [item({ id: 'x' })]
    const rules = [
      rule({ id: 'quiet-hours', priority: 1, window: 'OFF_PEAK', kind: 'FREE' }),
      rule({ id: 'otherwise', priority: 100, kind: 'PERCENT_OFF', percentOff: 10 }),
    ]
    const quiet = decidePrizePool(
      input({ menu, velocity: [], prizeRules: rules, serviceClockMinute: 15 * 60 })
    )
    const busy = decidePrizePool(
      input({ menu, velocity: [], prizeRules: rules, serviceClockMinute: 20 * 60 })
    )
    expect(quiet.entries[0]?.kind).toBe('FREE')
    expect(busy.entries[0]?.percentOff).toBe(10)
  })
})
