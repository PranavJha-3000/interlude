import { describe, expect, it } from 'vitest'
import type { GameItem } from '@/core/game/pairing'
import { assignDefaultChefRanks, rankingReadiness } from './games-ranking'

/**
 * assignDefaultChefRanks and rankingReadiness — the two pure helpers that together
 * make Beat the Kitchen playable on a fresh venue without any operator action:
 * rankingReadiness tells the dashboard what state the menu is in, and
 * assignDefaultChefRanks fills the gap at runtime so dealPair can always find pairs.
 */

function item(over: Partial<GameItem> & { id: string }): GameItem {
  return {
    name: over.name ?? `Item ${over.id}`,
    category: over.category ?? 'mains',
    photoUrl: null,
    unitsSold: 0,
    chefRank: null,
    active: true,
    ...over,
  }
}

describe('assignDefaultChefRanks', () => {
  it('preserves a full explicit chef list untouched', () => {
    const menu = [item({ id: 'a', chefRank: 1 }), item({ id: 'b', chefRank: 3 })]
    const result = assignDefaultChefRanks(menu)
    expect(result[0]!.chefRank).toBe(1)
    expect(result[1]!.chefRank).toBe(3)
  })

  it('no-ops when any item has trailingSales > 0', () => {
    const menu = [
      item({ id: 'a', unitsSold: 5 }),
      item({ id: 'b', unitsSold: 0 }),
    ]
    const result = assignDefaultChefRanks(menu)
    // Should preserve the original objects with unitsSold intact
    expect(result[0]!.unitsSold).toBe(5)
  })

  it('fills unranked items after the highest explicit rank when the list is partial', () => {
    const menu = [
      item({ id: 'a', chefRank: 2, name: 'A', category: 'mains' }),
      // These two were left blank by the operator.
      item({ id: 'b', chefRank: null, name: 'B', category: 'mains' }),
      item({ id: 'c', chefRank: null, name: 'C', category: 'starters' }),
    ]
    const result = assignDefaultChefRanks(menu)
    // The explicit rank stays; the blanks are numbered after the max (2).
    expect(result.find((i) => i.id === 'a')!.chefRank).toBe(2)
    expect(result.find((i) => i.id === 'b')!.chefRank).toBe(3)
    expect(result.find((i) => i.id === 'c')!.chefRank).toBe(4)
  })

  it('a single-item partial list still fills so the dish is not dropped', () => {
    // One dish has an explicit rank, the other is blank — without the fill the
    // blank dish would never pair and the game would dead-end.
    const menu = [
      item({ id: 'a', chefRank: 1, name: 'A', category: 'mains' }),
      item({ id: 'b', chefRank: null, name: 'B', category: 'mains' }),
    ]
    const result = assignDefaultChefRanks(menu)
    expect(result.find((i) => i.id === 'b')!.chefRank).toBe(2)
    // Both active dishes have a rank — pairing can proceed.
    expect(result.every((i) => i.chefRank !== null)).toBe(true)
  })

  it('assigns 1..N by category+name order when no ranking data exists', () => {
    const menu = [
      item({ id: 'c', name: 'Paneer Tikka', category: 'starters' }),
      item({ id: 'b', name: 'Butter Chicken', category: 'mains' }),
      item({ id: 'd', name: 'Dal Tadka', category: 'mains' }),
      item({ id: 'a', name: 'Garlic Naan', category: 'breads' }),
    ]
    const result = assignDefaultChefRanks(menu)
    // Sorted: breads(1), mains(2,3), starters(4) by category+name
    expect(result.map((i) => `${i.category}:${i.chefRank}`)).toEqual([
      'breads:1',
      'mains:2',
      'mains:3',
      'starters:4',
    ])
  })

  it('is deterministic — same input, same output', () => {
    const menu = [
      item({ id: 'z', name: 'Z', category: 'desserts' }),
      item({ id: 'a', name: 'A', category: 'mains' }),
    ]
    const a = assignDefaultChefRanks(menu)
    const b = assignDefaultChefRanks([...menu])
    expect(a).toEqual(b)
  })

  it('does not mutate the input array', () => {
    const menu = [item({ id: 'x', name: 'X', category: 'drinks' })]
    const result = assignDefaultChefRanks(menu)
    expect(menu[0]!.chefRank).toBe(null)
    expect(result[0]!.chefRank).toBe(1)
  })

  it('handles a single-item menu', () => {
    const menu = [item({ id: 'solo', name: 'Special', category: 'mains' })]
    const result = assignDefaultChefRanks(menu)
    expect(result).toHaveLength(1)
    expect(result[0]!.chefRank).toBe(1)
  })
})

describe('rankingReadiness', () => {
  it('TOO_FEW when fewer than 2 active items', () => {
    const items = [{ active: true, trailingSales: 0, chefRank: null }]
    expect(rankingReadiness(items)).toEqual({ kind: 'TOO_FEW' })
  })

  it('SALES when any item has trailingSales > 0', () => {
    const items = [
      { active: true, trailingSales: 5, chefRank: null },
      { active: true, trailingSales: 0, chefRank: null },
    ]
    expect(rankingReadiness(items)).toEqual({ kind: 'SALES' })
  })

  it('CHEF when at least one item has an explicit chefRank (even without sales)', () => {
    const items = [
      { active: true, trailingSales: 0, chefRank: 2 },
      { active: true, trailingSales: 0, chefRank: null },
    ]
    expect(rankingReadiness(items)).toEqual({ kind: 'CHEF' })
  })

  it('DEFAULT when items have neither sales nor explicit ranks', () => {
    const items = [
      { active: true, trailingSales: 0, chefRank: null },
      { active: true, trailingSales: 0, chefRank: null },
    ]
    expect(rankingReadiness(items)).toEqual({ kind: 'DEFAULT' })
  })

  it('ignores inactive items', () => {
    const items = [
      { active: false, trailingSales: 0, chefRank: null },
      { active: false, trailingSales: 0, chefRank: null },
      { active: true, trailingSales: 0, chefRank: null },
      { active: true, trailingSales: 0, chefRank: null },
    ]
    expect(rankingReadiness(items)).toEqual({ kind: 'DEFAULT' })
  })
})
