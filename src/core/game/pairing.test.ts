import { describe, expect, it } from 'vitest'
import {
  dealPair,
  eligiblePairs,
  fromChefRanking,
  isCorrect,
  isEligiblePair,
  pairKey,
  pairSeedFor,
  rankingFor,
  type GameItem,
  type PairingConfig,
} from './pairing'

/**
 * §4.2 is marked load-bearing in the spec and these are its tests.
 *
 * The one that matters most is the gap ratio. Everything else here is about
 * keeping the game honest — no repeats within a table, no randomness, and never
 * presenting a chef's opinion as though it were sales data.
 */

const CONFIG: PairingConfig = { gapRatio: 2.0 }

function item(over: Partial<GameItem> & { id: string }): GameItem {
  return {
    name: `Item ${over.id}`,
    category: 'mains',
    photoUrl: null,
    unitsSold: 10,
    chefRank: null,
    active: true,
    ...over,
  }
}

describe('the pairing rule (§4.2)', () => {
  it('refuses a pair the venue cannot defend out loud', () => {
    // 12 against 10 is a coin flip to a guest, and there is a dessert on it.
    const a = item({ id: 'a', unitsSold: 12 })
    const b = item({ id: 'b', unitsSold: 10 })

    expect(isEligiblePair(a, b, CONFIG)).toBe(false)
  })

  it('allows a pair that clears the ratio', () => {
    expect(
      isEligiblePair(item({ id: 'a', unitsSold: 20 }), item({ id: 'b', unitsSold: 10 }), CONFIG)
    ).toBe(true)
  })

  it('treats the ratio as inclusive at exactly the boundary', () => {
    expect(
      isEligiblePair(item({ id: 'a', unitsSold: 20 }), item({ id: 'b', unitsSold: 10 }), {
        gapRatio: 2,
      })
    ).toBe(true)
  })

  it('honours a venue that raises the ratio', () => {
    const a = item({ id: 'a', unitsSold: 20 })
    const b = item({ id: 'b', unitsSold: 10 })

    expect(isEligiblePair(a, b, { gapRatio: 3 })).toBe(false)
  })

  it('refuses a pair where either item has never sold', () => {
    // Infinite ratio, but "which of these two does nobody order" is not a
    // question with a defensible answer.
    const never = item({ id: 'never', unitsSold: 0 })

    expect(isEligiblePair(item({ id: 'a', unitsSold: 40 }), never, CONFIG)).toBe(false)
    expect(isEligiblePair(never, item({ id: 'b', unitsSold: 0 }), CONFIG)).toBe(false)
  })

  it('never pairs an item with itself, or with an inactive item', () => {
    const a = item({ id: 'a', unitsSold: 40 })

    expect(isEligiblePair(a, a, CONFIG)).toBe(false)
    expect(isEligiblePair(a, item({ id: 'b', unitsSold: 10, active: false }), CONFIG)).toBe(false)
  })

  it('every generated pair satisfies the rule', () => {
    // The property, over a menu wide enough to contain plenty of close pairs.
    const menu = Array.from({ length: 25 }, (_, i) => item({ id: `i${i}`, unitsSold: i + 1 }))
    const pairs = eligiblePairs(menu, CONFIG)
    const soldBy = new Map(menu.map((m) => [m.id, m.unitsSold]))

    expect(pairs.length).toBeGreaterThan(0)
    for (const p of pairs) {
      const hi = soldBy.get(p.higherId)!
      const lo = soldBy.get(p.lowerId)!
      expect(hi / lo).toBeGreaterThanOrEqual(CONFIG.gapRatio)
      expect(hi).toBeGreaterThanOrEqual(lo)
    }
  })
})

describe('determinism (§7.1 — no chance, anywhere)', () => {
  const menu = [
    item({ id: 'biryani', unitsSold: 80 }),
    item({ id: 'tiramisu', unitsSold: 6 }),
    item({ id: 'naan', unitsSold: 40 }),
    item({ id: 'kulfi', unitsSold: 3 }),
  ]

  it('deals the same pair for the same seed, every time', () => {
    const seeds = Array.from({ length: 100 }, () => dealPair(menu, CONFIG, [], 'run_1:0'))

    expect(new Set(seeds.map((s) => JSON.stringify(s))).size).toBe(1)
  })

  it('does not depend on the order the menu arrived in', () => {
    const forwards = dealPair(menu, CONFIG, [], 'run_1:0')
    const backwards = dealPair([...menu].reverse(), CONFIG, [], 'run_1:0')

    expect(forwards).toEqual(backwards)
  })

  it('gives different tables different questions', () => {
    const a = dealPair(menu, CONFIG, [], pairSeedFor('run_a', 0))
    const b = dealPair(menu, CONFIG, [], pairSeedFor('run_b', 0))

    // Not guaranteed different for any two seeds, but these two must be, or the
    // seed is not reaching the choice.
    expect(a).not.toEqual(b)
  })

  it('puts the answer on either side depending on the seed', () => {
    const sides = new Set<boolean>()
    for (let i = 0; i < 40; i++) {
      const p = dealPair(menu, CONFIG, [], pairSeedFor('run_x', i))
      if (p) sides.add(p.leftId === p.higherId)
    }

    // If the answer were always on one side the game would be solvable without
    // reading either dish.
    expect(sides.size).toBe(2)
  })
})

describe('no repeats within a table (§4.2)', () => {
  const menu = [
    item({ id: 'a', unitsSold: 80 }),
    item({ id: 'b', unitsSold: 40 }),
    item({ id: 'c', unitsSold: 10 }),
    item({ id: 'd', unitsSold: 4 }),
  ]

  it('never re-deals a pair the table has already seen', () => {
    const shown: string[] = []
    for (let i = 0; i < 20; i++) {
      const p = dealPair(menu, CONFIG, shown, pairSeedFor('run_1', i))
      if (!p) break
      const key = pairKey(p.higherId, p.lowerId)
      expect(shown).not.toContain(key)
      shown.push(key)
    }

    expect(new Set(shown).size).toBe(shown.length)
  })

  it('runs out rather than relaxing the ratio', () => {
    // The trade §4.2 refuses: keeping a game going by asking a question the
    // server cannot defend.
    const all = eligiblePairs(menu, CONFIG).map((p) => pairKey(p.higherId, p.lowerId))

    expect(dealPair(menu, CONFIG, all, 'run_1:99')).toBeNull()
  })

  it('the key is order-independent', () => {
    expect(pairKey('a', 'b')).toBe(pairKey('b', 'a'))
  })

  it('returns null for a menu with no defensible pair at all', () => {
    const flat = [item({ id: 'a', unitsSold: 10 }), item({ id: 'b', unitsSold: 10 })]

    expect(dealPair(flat, CONFIG, [], 'seed')).toBeNull()
  })
})

describe('ranking basis (§4.2 — never present a guess as data)', () => {
  it('uses sales when the venue has any, and says so', () => {
    const { basis } = rankingFor([item({ id: 'a', unitsSold: 5 }), item({ id: 'b', unitsSold: 1 })])

    expect(basis).toBe('SALES')
  })

  it("falls back to the chef's ranking, and says that instead", () => {
    const menu = [
      item({ id: 'a', unitsSold: 0, chefRank: 1 }),
      item({ id: 'b', unitsSold: 0, chefRank: 5 }),
    ]
    const { basis } = rankingFor(menu)

    expect(basis).toBe('CHEF')
  })

  it('reports the basis on the dealt pair, so the copy can change', () => {
    const menu = [
      item({ id: 'a', unitsSold: 0, chefRank: 1 }),
      item({ id: 'b', unitsSold: 0, chefRank: 6 }),
    ]

    expect(dealPair(menu, CONFIG, [], 'seed')?.basis).toBe('CHEF')
  })

  it("orders by the chef's list, best first", () => {
    const ranked = fromChefRanking([
      item({ id: 'best', chefRank: 1 }),
      item({ id: 'worst', chefRank: 4 }),
    ])
    const best = ranked.find((i) => i.id === 'best')!
    const worst = ranked.find((i) => i.id === 'worst')!

    expect(best.unitsSold).toBeGreaterThan(worst.unitsSold)
  })

  it('drops an item the chef never ranked rather than guessing it', () => {
    const ranked = fromChefRanking([item({ id: 'a', chefRank: 1 }), item({ id: 'unranked' })])

    expect(ranked.find((i) => i.id === 'unranked')!.unitsSold).toBe(0)
  })
})

/**
 * A fresh-venue menu has no explicit chef rank and no sales.  Combined with
 * `assignDefaultChefRanks` from `@/lib/table-run`, the engine must always be
 * able to deal at least one pair.  This is what stops a brand-new venue from
 * landing on the "This game is unavailable" dead-end.
 */
describe('a fresh-venue menu reaches a pair', () => {
  it('dealPair returns a real pair once ranks exist (CHEF basis)', () => {
    // Six dishes spanning three categories — a realistic fresh venue menu.
    const menu = [
      item({ id: 'a', name: 'Butter Chicken', category: 'mains' }),
      item({ id: 'b', name: 'Paneer Tikka', category: 'starters' }),
      item({ id: 'c', name: 'Garlic Naan', category: 'breads' }),
      item({ id: 'd', name: 'Dal Tadka', category: 'mains' }),
      item({ id: 'e', name: 'Sweet Lassi', category: 'drinks' }),
      item({ id: 'f', name: 'Gulab Jamun', category: 'desserts' }),
    ]
    // Assign default ranks from category+name sort — the runtime helper's behaviour.
    const ranked = fromChefRanking(menu)
    const withRanks = ranked.map((m, i) => ({ ...m, chefRank: i + 1 }))
    // Verify fromChefRanking gives unranked items unitsSold: 0 (the basis becomes CHEF).
    expect(ranked.every((m) => m.unitsSold === 0)).toBe(true)
    const pair = dealPair(withRanks, CONFIG, [], 'run-1')
    expect(pair).not.toBeNull()
    expect(pair!.basis).toBe('CHEF')
    expect(pair!.higherId).not.toBe(pair!.lowerId)
  })
})

describe('answering', () => {
  const pair = {
    higherId: 'popular',
    lowerId: 'quiet',
    leftId: 'quiet',
    rightId: 'popular',
    gapRatio: 4,
    basis: 'SALES' as const,
  }

  it('is correct only for the higher seller', () => {
    expect(isCorrect(pair, 'popular')).toBe(true)
    expect(isCorrect(pair, 'quiet')).toBe(false)
  })
})
