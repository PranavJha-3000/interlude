import { describe, expect, it } from 'vitest'
import { decidePrizePool } from './decide-prize-pool'
import type { MenuItemInput, PrizeEngineInput } from './types'

/**
 * These are the compliance invariants from PLATFORM.md §7, not style tests.
 * Each one corresponds to a promise made to the operator or to a legal line.
 */

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
    concededSoFarPaise: 0,
    serviceClockMinute: 13 * 60,
    peakStartMinute: 19 * 60,
    peakEndMinute: 23 * 60,
    mysteryPlatePricePaise: 9900,
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
  it('gives every entry a non-empty reason', () => {
    const r = decidePrizePool(input())
    expect(r.entries.length).toBeGreaterThan(0)
    for (const e of r.entries) expect(e.reason.trim().length).toBeGreaterThan(0)
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

describe('the mystery plate is a product, never a draw (PLATFORM.md §7)', () => {
  it('always issues it as a fixed-price award', () => {
    const r = decidePrizePool(input({ mechanic: 'MYSTERY_PLATE' }))
    expect(r.entries.length).toBeGreaterThan(0)
    for (const e of r.entries) expect(e.kind).toBe('FIXED_PRICE')
  })

  it('refuses items the fixed price would not actually discount', () => {
    const menu = [item({ id: 'cheap', pricePaise: 8000, foodCostPaise: 2000 })]
    const r = decidePrizePool(input({ menu, velocity: [], mechanic: 'MYSTERY_PLATE' }))
    expect(r.entries).toHaveLength(0)
    expect(r.excluded[0]?.reason).toBe('Mystery-plate price is not below the menu price')
  })
})

describe('peak behaviour concedes less', () => {
  it('gives a low-margin item away free off-peak but at half price at peak', () => {
    const menu = [item({ id: 'thin', marginTier: 'LOW', pricePaise: 20000, foodCostPaise: 15000 })]
    const offPeak = decidePrizePool(input({ menu, velocity: [], serviceClockMinute: 15 * 60 }))
    const atPeak = decidePrizePool(input({ menu, velocity: [], serviceClockMinute: 20 * 60 }))
    expect(offPeak.entries[0]?.kind).toBe('FREE')
    expect(atPeak.entries[0]?.kind).toBe('HALF_PRICE')
  })
})
