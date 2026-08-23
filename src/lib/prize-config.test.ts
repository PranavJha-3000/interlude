import { describe, expect, it } from 'vitest'
import { DEFAULT_RANKING_WEIGHTS } from '@/core/prize-engine'
import { parseRankingWeights } from './prize-config'

/**
 * The column is edited by a human in a back-office form, so every assertion
 * here is really the same one: a bad value costs that one field, never the
 * venue's whole tuning and never the guest surface.
 */

describe('parseRankingWeights', () => {
  it('reads a well-formed row', () => {
    const row = { ...DEFAULT_RANKING_WEIGHTS, notSelling: 99, slowMoverMaxUnits: 7 }

    expect(parseRankingWeights(row)).toEqual(row)
  })

  it('honours a zero, rather than treating it as missing', () => {
    // A venue that wants slow movers to get no lift at all is making a real
    // choice. Falsy-checking this field would quietly overrule them.
    expect(parseRankingWeights({ ...DEFAULT_RANKING_WEIGHTS, notSelling: 0 }).notSelling).toBe(0)
  })

  it('honours a negative weight', () => {
    expect(parseRankingWeights({ ...DEFAULT_RANKING_WEIGHTS, lowPrepBonus: -5 }).lowPrepBonus).toBe(
      -5
    )
  })

  it('falls back per field, keeping the rest of the venue’s tuning', () => {
    const result = parseRankingWeights({
      ...DEFAULT_RANKING_WEIGHTS,
      notSelling: 99,
      slowMover: 'quite a lot',
    })

    expect(result.notSelling).toBe(99)
    expect(result.slowMover).toBe(DEFAULT_RANKING_WEIGHTS.slowMover)
  })

  it('fills in a field the row has never had', () => {
    // The column predates a weight added later. The venue keeps everything it
    // set, and the new field arrives at its seed.
    const withoutOne: Record<string, number> = { ...DEFAULT_RANKING_WEIGHTS }
    delete withoutOne.staleMinDays

    expect(parseRankingWeights(withoutOne).staleMinDays).toBe(DEFAULT_RANKING_WEIGHTS.staleMinDays)
  })

  it('rejects non-finite numbers', () => {
    const result = parseRankingWeights({ notSelling: Number.NaN, slowMover: Infinity })

    expect(result.notSelling).toBe(DEFAULT_RANKING_WEIGHTS.notSelling)
    expect(result.slowMover).toBe(DEFAULT_RANKING_WEIGHTS.slowMover)
  })

  it('falls back wholesale for a row that is not an object', () => {
    for (const raw of [null, undefined, 4, 'weights', [1, 2, 3]]) {
      expect(parseRankingWeights(raw)).toEqual(DEFAULT_RANKING_WEIGHTS)
    }
  })

  it('ignores keys the engine does not know about', () => {
    const result = parseRankingWeights({ ...DEFAULT_RANKING_WEIGHTS, favouriteColour: 7 })

    expect(result).toEqual(DEFAULT_RANKING_WEIGHTS)
    expect('favouriteColour' in result).toBe(false)
  })

  it('never returns the shared default object, so a caller cannot mutate the seed', () => {
    // Both branches, because the wholesale fallback is the easy one to miss:
    // handing back the module-level seed would let one venue's request change
    // the starting ranking for every other venue in the process.
    for (const raw of [{}, null, 'nonsense']) {
      const result = parseRankingWeights(raw)

      expect(result).toEqual(DEFAULT_RANKING_WEIGHTS)
      expect(result).not.toBe(DEFAULT_RANKING_WEIGHTS)
    }
  })
})
