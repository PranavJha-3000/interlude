import { describe, expect, it } from 'vitest'
import { decidePrizePool } from './decide-prize-pool'
import { DEFAULT_RANKING_WEIGHTS, defaultPrizeRules } from './default-rules'
import type { LoadLevel, MenuItemInput, Outcome, PrizeEngineInput, PrizeRuleInput } from './types'

/**
 * The §5 invariants, as property tests over generated menus rather than as
 * hand-picked examples (§12).
 *
 * An example test proves the engine handled the case someone thought of. These
 * generate a few hundred menus, veto sets, load states and cap settings, and
 * assert the invariant held across all of them — which is the difference
 * between "we tested the veto" and "a vetoed item cannot get out".
 *
 * The generator is a seeded LCG rather than `Math.random`, for two reasons:
 * `Math.random` is banned by lint in this directory, and a failing property
 * test that cannot be re-run with the same input is a bug report nobody can
 * act on. Every case here is reproducible from its seed.
 */

/** Numerical Recipes LCG. Deterministic, seeded, and not a security RNG. */
function generator(seed: number) {
  let state = seed >>> 0
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
  return {
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!,
    bool: (trueChance = 0.5) => next() < trueChance,
  }
}

const LOADS: LoadLevel[] = ['GREEN', 'AMBER', 'RED']
const OUTCOMES: Outcome[] = ['WIN', 'LOSE']

function generateMenu(rng: ReturnType<typeof generator>, size: number): MenuItemInput[] {
  return Array.from({ length: size }, (_, i) => {
    const pricePaise = rng.int(5000, 60000)
    return {
      id: `item_${i}`,
      name: `Item ${i}`,
      category: rng.pick(['starters', 'mains', 'desserts', 'beverages']),
      pricePaise,
      // Sometimes above price, so the "costs more than it sells for" branch
      // is genuinely exercised rather than being unreachable.
      foodCostPaise: rng.int(1000, Math.round(pricePaise * 1.2)),
      marginTier: rng.pick(['HIGH', 'MID', 'LOW'] as const),
      prepBurden: rng.pick(['LOW', 'MEDIUM', 'HIGH'] as const),
      requiresKitchenWork: rng.bool(0.7),
      isHero: rng.bool(0.15),
      active: rng.bool(0.9),
    }
  })
}

interface Case {
  input: PrizeEngineInput
  seed: number
}

/** One generated scenario, entirely determined by its seed. */
function generateCase(seed: number): Case {
  const rng = generator(seed)
  const menu = generateMenu(rng, rng.int(1, 25))
  const vetoCount = rng.int(0, menu.length)
  const chefVetoes = menu.slice(0, vetoCount).map((m) => m.id)

  const rules: PrizeRuleInput[] = rng.bool(0.85) ? defaultPrizeRules(rng.int(1000, 20000)) : []

  return {
    seed,
    input: {
      menu,
      velocity: menu.map((m) => ({
        itemId: m.id,
        unitsSold: rng.int(0, 40),
        daysSinceLastSale: rng.bool() ? rng.int(0, 14) : undefined,
      })),
      kitchenLoad: rng.pick(LOADS),
      chefVetoes,
      depthCaps: {
        perItemPct: rng.int(0, 100),
        perServicePaise: rng.int(0, 800000),
      },
      mechanic: 'BEAT_THE_KITCHEN',
      outcome: rng.pick(OUTCOMES),
      prizeRules: rules,
      rankingWeights: DEFAULT_RANKING_WEIGHTS,
      concededSoFarPaise: rng.int(0, 400000),
      serviceClockMinute: rng.int(0, 1439),
      peakStartMinute: 19 * 60,
      peakEndMinute: 23 * 60,
    },
  }
}

const CASES = Array.from({ length: 400 }, (_, i) => generateCase(i + 1))

/** Report the seed on failure, so any counterexample is reproducible. */
function forEachCase(assert: (c: Case) => void) {
  for (const c of CASES) {
    try {
      assert(c)
    } catch (error) {
      throw new Error(`Property failed for seed ${c.seed}: ${(error as Error).message}`)
    }
  }
}

describe('§5 invariants, over 400 generated menus', () => {
  it('no chef-vetoed item ever enters the pool', () => {
    forEachCase(({ input }) => {
      const vetoed = new Set(input.chefVetoes)
      const result = decidePrizePool(input)

      for (const entry of result.entries) expect(vetoed.has(entry.itemId)).toBe(false)
    })
  })

  it('a veto is absolute — it beats every other consideration', () => {
    // Vetoing the entire menu must empty the pool, whatever the rules say.
    forEachCase(({ input }) => {
      const result = decidePrizePool({ ...input, chefVetoes: input.menu.map((m) => m.id) })

      expect(result.entries).toHaveLength(0)
    })
  })

  it('no item exceeds its depth cap', () => {
    forEachCase(({ input }) => {
      const result = decidePrizePool(input)

      for (const entry of result.entries) {
        expect(entry.depthPct).toBeLessThanOrEqual(input.depthCaps.perItemPct)
      }
    })
  })

  it('cumulative concession never exceeds the per-service cap', () => {
    forEachCase(({ input }) => {
      const result = decidePrizePool(input)
      const budgetLeft = input.depthCaps.perServicePaise - input.concededSoFarPaise

      // Any single entry must be affordable against what is left. The engine
      // offers a pool, one of which is taken — so the invariant is per entry,
      // not on their sum.
      for (const entry of result.entries) {
        expect(entry.valuePaise).toBeLessThanOrEqual(Math.max(0, budgetLeft))
      }
    })
  })

  it('nothing requiring kitchen work enters while the load is RED', () => {
    forEachCase(({ input }) => {
      const result = decidePrizePool({ ...input, kitchenLoad: 'RED' })
      const byId = new Map(input.menu.map((m) => [m.id, m]))

      for (const entry of result.entries) {
        expect(byId.get(entry.itemId)!.requiresKitchenWork).toBe(false)
      }
    })
  })

  it('under AMBER, no high-effort kitchen item enters', () => {
    forEachCase(({ input }) => {
      const result = decidePrizePool({ ...input, kitchenLoad: 'AMBER' })
      const byId = new Map(input.menu.map((m) => [m.id, m]))

      for (const entry of result.entries) {
        const item = byId.get(entry.itemId)!
        expect(item.requiresKitchenWork && item.prepBurden === 'HIGH').toBe(false)
      }
    })
  })

  it('a hero item is never discounted, at any load or cap', () => {
    forEachCase(({ input }) => {
      const byId = new Map(input.menu.map((m) => [m.id, m]))

      for (const load of LOADS) {
        for (const entry of decidePrizePool({ ...input, kitchenLoad: load }).entries) {
          expect(byId.get(entry.itemId)!.isHero).toBe(false)
        }
      }
    })
  })

  it('output is a pure function of the inputs', () => {
    forEachCase(({ input }) => {
      const once = JSON.stringify(decidePrizePool(input))
      const twice = JSON.stringify(decidePrizePool(input))

      expect(twice).toBe(once)
    })
  })

  it('does not depend on the order the menu arrived in', () => {
    forEachCase(({ input }) => {
      const forwards = decidePrizePool(input)
      const backwards = decidePrizePool({ ...input, menu: [...input.menu].reverse() })

      expect(backwards).toEqual(forwards)
    })
  })

  it('every entry and every exclusion carries a non-empty reason', () => {
    forEachCase(({ input }) => {
      const result = decidePrizePool(input)

      for (const entry of result.entries) expect(entry.reason.trim().length).toBeGreaterThan(0)
      for (const excluded of result.excluded) {
        expect(excluded.reason.trim().length).toBeGreaterThan(0)
      }
    })
  })

  it('accounts for every menu item exactly once, as an entry or an exclusion', () => {
    // The audit trail's completeness property. An item that is neither is an
    // item the operator cannot ask about.
    forEachCase(({ input }) => {
      const result = decidePrizePool(input)
      const seen = [...result.entries.map((e) => e.itemId), ...result.excluded.map((e) => e.itemId)]

      expect(seen.length).toBe(input.menu.length)
      expect(new Set(seen).size).toBe(input.menu.length)
    })
  })

  it('never concedes more than an item is worth', () => {
    forEachCase(({ input }) => {
      const byId = new Map(input.menu.map((m) => [m.id, m]))

      for (const entry of decidePrizePool(input).entries) {
        expect(entry.valuePaise).toBeLessThanOrEqual(byId.get(entry.itemId)!.pricePaise)
        expect(entry.valuePaise).toBeGreaterThanOrEqual(0)
      }
    })
  })

  it('keeps money in whole paise', () => {
    forEachCase(({ input }) => {
      for (const entry of decidePrizePool(input).entries) {
        expect(Number.isInteger(entry.valuePaise)).toBe(true)
        expect(Number.isInteger(entry.costPaise)).toBe(true)
      }
    })
  })

  it('offers nothing at all when the venue has no rules', () => {
    // A venue that deletes every rule offers no prizes. Legitimate, if unwise —
    // and it must not silently fall back to an opinion of ours.
    forEachCase(({ input }) => {
      expect(decidePrizePool({ ...input, prizeRules: [] }).entries).toHaveLength(0)
    })
  })
})
