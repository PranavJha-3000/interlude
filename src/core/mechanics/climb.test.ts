import { describe, expect, it } from 'vitest'
import {
  buildPrizeLadder,
  computeRunWindow,
  dealHand,
  decideRun,
  handKindForRung,
  handSecondsFor,
  isHandCleared,
  isRunWorthStarting,
  ladderSizeForRung,
  secondsRemaining,
  type ClimbConfig,
  type ClimbItemInput,
} from './climb'

const CONFIG: ClimbConfig = { rungs: 6, handSec: 25, minRunSec: 45 }

/** Twelve dishes, ₹60 to ₹720, all distinct — a small but ordinary menu. */
const MENU: ClimbItemInput[] = Array.from({ length: 12 }, (_, i) => ({
  id: `item-${i}`,
  name: `Dish ${i}`,
  pricePaise: 6000 + i * 6000,
}))

const PRICES = new Map(MENU.map((i) => [i.id, i.pricePaise]))

describe('computeRunWindow', () => {
  it('runs until the food is nearly down, not for a fixed length', () => {
    const now = 1_000_000
    // Twelve minutes of cooking, one minute of buffer.
    const w = computeRunWindow(now, now + 12 * 60_000, 60)!
    expect(w.durationSec).toBe(11 * 60)
  })

  it('gives a longer climb for a slower kitchen — that is the whole point', () => {
    const now = 1_000_000
    const quick = computeRunWindow(now, now + 5 * 60_000, 60)!
    const slow = computeRunWindow(now, now + 20 * 60_000, 60)!
    expect(slow.durationSec).toBeGreaterThan(quick.durationSec)
  })

  it('returns null with no kitchen estimate rather than inventing one', () => {
    // An unbounded run whose ladder never resolves is worse than no run.
    expect(computeRunWindow(1_000_000, null, 60)).toBeNull()
  })

  it('never returns a negative duration when the food is already late', () => {
    const now = 1_000_000
    const w = computeRunWindow(now, now - 5 * 60_000, 60)!
    expect(w.durationSec).toBe(0)
    expect(isRunWorthStarting(w.durationSec, CONFIG)).toBe(false)
  })

  it('refuses to start a run that would end on the first rung', () => {
    expect(isRunWorthStarting(44, CONFIG)).toBe(false)
    expect(isRunWorthStarting(45, CONFIG)).toBe(true)
  })
})

describe('dealHand', () => {
  it('alternates a fast pair with a ladder, so the rhythm does not flatten', () => {
    expect(handKindForRung(1)).toBe('PAIR')
    expect(handKindForRung(2)).toBe('LADDER')
    expect(handKindForRung(5)).toBe('PAIR')
    expect(handKindForRung(6)).toBe('LADDER')
  })

  it('grows the ladder slowly — a hand that scrolls is a hand that is abandoned', () => {
    expect(ladderSizeForRung(2)).toBe(3)
    expect(ladderSizeForRung(4)).toBe(4)
    expect(ladderSizeForRung(6)).toBe(5)
  })

  it('deals the same hand twice for the same seed and rung', () => {
    // A refresh, a dropped connection or a suspended tab must resume the
    // identical hand rather than rerolling into an easier one.
    const a = dealHand(MENU, 'session-abc', 3, CONFIG)
    const b = dealHand(MENU, 'session-abc', 3, CONFIG)
    expect(a).toEqual(b)
  })

  it('deals different hands to two tables at the same rung', () => {
    const a = dealHand(MENU, 'session-abc', 2, CONFIG)
    const b = dealHand(MENU, 'session-xyz', 2, CONFIG)
    expect(a).not.toEqual(b)
  })

  it('narrows the price spread as the climb goes on', () => {
    // The escalation. At rung one the two dishes are far apart and the answer
    // is obvious; near the top they are adjacent and the guest has to read the
    // menu on their table.
    const spreadAt = (rung: number) => {
      const hand = dealHand(MENU, 'session-abc', rung, CONFIG)!
      const prices = hand.itemIds.map((id) => PRICES.get(id)!).sort((a, b) => a - b)
      return prices[prices.length - 1]! - prices[0]!
    }
    // Compare like with like: rungs 1, 3, 5 are all pairs.
    expect(spreadAt(1)).toBeGreaterThan(spreadAt(3))
    expect(spreadAt(3)).toBeGreaterThan(spreadAt(5))
  })

  it('never shows a hand already in price order', () => {
    // Presenting the answer sorted would give it away. Checked across every
    // rung and several seeds because a scramble that is sometimes the identity
    // is the kind of bug that only shows up at a real table.
    let checked = 0
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      for (let rung = 1; rung <= CONFIG.rungs; rung++) {
        const hand = dealHand(MENU, seed, rung, CONFIG)
        if (!hand || hand.itemIds.length < 3) continue
        const shown = hand.itemIds.map((id) => PRICES.get(id)!)
        const sorted = [...shown].sort((a, b) => a - b)
        expect(shown, `seed ${seed} rung ${rung} was dealt pre-sorted`).not.toEqual(sorted)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('never deals two dishes at the same price', () => {
    // A hand with two ₹180 dishes has no right answer, and the guest is the
    // one who finds that out.
    const clashing: ClimbItemInput[] = [
      { id: 'a', name: 'A', pricePaise: 18000 },
      { id: 'b', name: 'B', pricePaise: 18000 },
      { id: 'c', name: 'C', pricePaise: 24000 },
      { id: 'd', name: 'D', pricePaise: 30000 },
      { id: 'e', name: 'E', pricePaise: 36000 },
    ]
    const prices = new Map(clashing.map((i) => [i.id, i.pricePaise]))
    for (let rung = 1; rung <= CONFIG.rungs; rung++) {
      const hand = dealHand(clashing, 'seed', rung, CONFIG)
      if (!hand) continue
      const dealt = hand.itemIds.map((id) => prices.get(id)!)
      expect(new Set(dealt).size, `rung ${rung} dealt a duplicate price`).toBe(dealt.length)
    }
  })

  it('returns null rather than throwing when the menu is too small', () => {
    // A café with four items is a real customer, and this must not 500 at the
    // table.
    const tiny = MENU.slice(0, 3)
    expect(dealHand(tiny, 'seed', 2, CONFIG)).not.toBeNull()
    expect(dealHand(tiny, 'seed', 6, CONFIG)).toBeNull()
    expect(dealHand([], 'seed', 1, CONFIG)).toBeNull()
  })

  it('deals only dishes that are on the menu it was given', () => {
    const ids = new Set(MENU.map((i) => i.id))
    for (let rung = 1; rung <= CONFIG.rungs; rung++) {
      const hand = dealHand(MENU, 'seed', rung, CONFIG)!
      for (const id of hand.itemIds) expect(ids.has(id)).toBe(true)
      expect(new Set(hand.itemIds).size).toBe(hand.itemIds.length)
    }
  })
})

describe('handSecondsFor', () => {
  it('gives a five-dish ladder more time than a two-dish tap', () => {
    // Not a nicety. The guest is hunting prices on a paper menu; five dishes at
    // the pair's budget is not hard, it is impossible, and everyone would stall
    // on the same rung — which looks like difficulty and is actually a bug.
    const pair = dealHand(MENU, 'seed', 1, CONFIG)!
    const ladder = dealHand(MENU, 'seed', 6, CONFIG)!
    expect(pair.itemIds).toHaveLength(2)
    expect(ladder.itemIds).toHaveLength(5)

    expect(handSecondsFor(pair, CONFIG)).toBe(CONFIG.handSec)
    expect(handSecondsFor(ladder, CONFIG)).toBeGreaterThan(handSecondsFor(pair, CONFIG))
  })

  it('grows with the hand, so every extra dish is paid for', () => {
    const three = dealHand(MENU, 'seed', 2, CONFIG)!
    const five = dealHand(MENU, 'seed', 6, CONFIG)!
    expect(handSecondsFor(five, CONFIG) - handSecondsFor(three, CONFIG)).toBe(
      (five.itemIds.length - three.itemIds.length) * 8
    )
  })

  it('scales off the venue’s own number, never a constant', () => {
    const hand = dealHand(MENU, 'seed', 2, CONFIG)!
    const generous = handSecondsFor(hand, { ...CONFIG, handSec: 60 })
    expect(generous - handSecondsFor(hand, CONFIG)).toBe(60 - CONFIG.handSec)
  })
})

describe('isHandCleared', () => {
  it('clears a pair when the dearer dish was tapped', () => {
    const hand = dealHand(MENU, 'seed', 1, CONFIG)!
    const [a, b] = hand.itemIds
    const dearer = PRICES.get(a!)! > PRICES.get(b!)! ? a! : b!
    const cheaper = dearer === a ? b! : a!
    expect(isHandCleared(hand, [dearer], PRICES)).toBe(true)
    expect(isHandCleared(hand, [cheaper], PRICES)).toBe(false)
  })

  it('clears a ladder in ascending price order and nothing else', () => {
    const hand = dealHand(MENU, 'seed', 2, CONFIG)!
    const right = [...hand.itemIds].sort((x, y) => PRICES.get(x)! - PRICES.get(y)!)
    expect(isHandCleared(hand, right, PRICES)).toBe(true)
    expect(isHandCleared(hand, [...right].reverse(), PRICES)).toBe(false)
  })

  it('fails an incomplete answer instead of throwing', () => {
    // The food arrived mid-tap. That is a failed hand, not a 500.
    const hand = dealHand(MENU, 'seed', 2, CONFIG)!
    expect(isHandCleared(hand, [], PRICES)).toBe(false)
    expect(isHandCleared(hand, hand.itemIds.slice(0, 2), PRICES)).toBe(false)
  })

  it('refuses an answer naming dishes that were not in the hand', () => {
    const hand = dealHand(MENU, 'seed', 2, CONFIG)!
    const smuggled = [hand.itemIds[0]!, hand.itemIds[1]!, 'item-11']
    expect(isHandCleared(hand, smuggled, PRICES)).toBe(false)
    // Including a repeat of a legitimate id, which is what a naive set check
    // would wave through.
    expect(isHandCleared(hand, [hand.itemIds[0]!, hand.itemIds[0]!], PRICES)).toBe(false)
  })

  it('accepts either order for two dishes at the same price', () => {
    // The deal avoids this, but a menu edit mid-service could land one here and
    // the guest must not be marked wrong for our race.
    const hand = { kind: 'LADDER' as const, rung: 2, itemIds: ['x', 'y', 'z'] }
    const prices = new Map([
      ['x', 10000],
      ['y', 10000],
      ['z', 20000],
    ])
    expect(isHandCleared(hand, ['x', 'y', 'z'], prices)).toBe(true)
    expect(isHandCleared(hand, ['y', 'x', 'z'], prices)).toBe(true)
    expect(isHandCleared(hand, ['z', 'x', 'y'], prices)).toBe(false)
  })

  it('fails rather than throwing when a dish has vanished from the price map', () => {
    const hand = dealHand(MENU, 'seed', 2, CONFIG)!
    expect(isHandCleared(hand, hand.itemIds, new Map())).toBe(false)
  })
})

describe('buildPrizeLadder', () => {
  const POOL = [
    { itemId: 'chai', valuePaise: 9000, reason: 'high margin, no fire time' },
    { itemId: 'jamun', valuePaise: 12000, reason: 'plated cold' },
    { itemId: 'momos', valuePaise: 4000, reason: 'margin holds at −20%' },
    { itemId: 'tikka', valuePaise: 22000, reason: 'within the per-item cap' },
  ]

  it('climbs — every rung concedes more than the one below it', () => {
    const ladder = buildPrizeLadder(POOL, 6)
    expect(ladder.map((r) => r.itemId)).toEqual(['momos', 'chai', 'jamun', 'tikka'])
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i]!.valuePaise).toBeGreaterThanOrEqual(ladder[i - 1]!.valuePaise)
    }
  })

  it('carries the engine reason onto every rung', () => {
    // The audit trail is the product promise to the operator (PLATFORM.md §5).
    // A rung that lost its reason is an award nobody can explain.
    for (const rung of buildPrizeLadder(POOL, 6)) expect(rung.reason).not.toBe('')
  })

  it('is stable when two rungs concede the same amount', () => {
    const tied = [
      { itemId: 'b', valuePaise: 5000, reason: 'r' },
      { itemId: 'a', valuePaise: 5000, reason: 'r' },
    ]
    expect(buildPrizeLadder(tied, 6).map((r) => r.itemId)).toEqual(['a', 'b'])
    expect(buildPrizeLadder([...tied].reverse(), 6).map((r) => r.itemId)).toEqual(['a', 'b'])
  })

  it('is shorter than the ladder when the pool is thin, and never invents a rung', () => {
    expect(buildPrizeLadder(POOL, 2)).toHaveLength(2)
    expect(buildPrizeLadder([], 6)).toEqual([])
  })
})

describe('decideRun', () => {
  const LADDER = buildPrizeLadder(
    [
      { itemId: 'momos', valuePaise: 4000, reason: 'r' },
      { itemId: 'chai', valuePaise: 9000, reason: 'r' },
      { itemId: 'jamun', valuePaise: 12000, reason: 'r' },
    ],
    6
  )

  it('banks a whole dish, never a fraction of one', () => {
    // "The win is not partial": reaching rung two wins the rung-two dish
    // outright. There is no proportion, no part-prize and no fractional depth
    // anywhere in this path.
    const { outcome, reached } = decideRun(2, LADDER)
    expect(outcome).toBe('WIN')
    expect(reached).toEqual({ rung: 2, itemId: 'chai', valuePaise: 9000, reason: 'r' })
  })

  it('banks the highest rung standing when the food lands', () => {
    expect(decideRun(3, LADDER).reached?.itemId).toBe('jamun')
  })

  it('loses on zero rungs, and the consolation is the engine problem not this one', () => {
    const { outcome, reached } = decideRun(0, LADDER)
    expect(outcome).toBe('LOSE')
    expect(reached).toBeNull()
  })

  it('cannot climb past the top of a thin ladder', () => {
    // A guest on a hot streak against a four-item menu must not index off the
    // end of a pool the engine deliberately kept short.
    expect(decideRun(99, LADDER).reached?.itemId).toBe('jamun')
    expect(decideRun(1, []).outcome).toBe('LOSE')
  })
})

describe('secondsRemaining', () => {
  it('counts down to the server timestamp and stops at zero', () => {
    expect(secondsRemaining(1_000_000, 1_030_000)).toBe(30)
    expect(secondsRemaining(1_060_000, 1_030_000)).toBe(0)
  })
})
