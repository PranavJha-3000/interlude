import { describe, expect, it } from 'vitest'
import { estimateReadyAtMs, type PrepMinutes } from './prep-estimate'

/**
 * The estimate this produces is the only thing standing between a guest and a
 * run that is still going while they eat. Everything here is really one
 * assertion said several ways: **guess early, never late.**
 */

const MINUTES = 60_000

const PREP: PrepMinutes = {
  starters: 8,
  mains: 18,
  breads: 6,
  sides: 5,
  desserts: 4,
  beverages: 3,
}

const FIRED = 1_700_000_000_000
const DEFAULT_MINUTES = 12

describe('estimateReadyAtMs', () => {
  it('sizes the estimate to the first plate that lands, not the last', () => {
    // The whole fix. Starters land at 8 minutes; a run sized to the mains at 18
    // would still be running with the food on the table.
    const at = estimateReadyAtMs(FIRED, ['starters', 'mains'], PREP, DEFAULT_MINUTES)

    expect(at).toBe(FIRED + 8 * MINUTES)
    expect(at).toBeLessThan(FIRED + 18 * MINUTES)
  })

  it('does not care what order the courses were given in', () => {
    const a = estimateReadyAtMs(FIRED, ['mains', 'breads', 'starters'], PREP, DEFAULT_MINUTES)
    const b = estimateReadyAtMs(FIRED, ['starters', 'breads', 'mains'], PREP, DEFAULT_MINUTES)

    expect(a).toBe(b)
    expect(a).toBe(FIRED + 6 * MINUTES)
  })

  it('falls back to the venue default when no courses are named', () => {
    // One tap on Fire order, which is the common case on a busy floor.
    expect(estimateReadyAtMs(FIRED, [], PREP, DEFAULT_MINUTES)).toBe(
      FIRED + DEFAULT_MINUTES * MINUTES
    )
  })

  it('ignores a course the venue has not configured', () => {
    expect(estimateReadyAtMs(FIRED, ['mains', 'sushi'], PREP, DEFAULT_MINUTES)).toBe(
      FIRED + 18 * MINUTES
    )
  })

  it('falls back to the default when every named course is unconfigured', () => {
    // Not zero, and not "as fast as possible" — an unknown course tells us
    // nothing, so we are back to the venue's own typical answer.
    expect(estimateReadyAtMs(FIRED, ['sushi', 'ramen'], PREP, DEFAULT_MINUTES)).toBe(
      FIRED + DEFAULT_MINUTES * MINUTES
    )
  })

  it('treats a zero or negative configured minute as unconfigured', () => {
    // A venue that types 0 into the prep-time field is not promising instant
    // food. Honouring it literally would end every run before it began.
    const odd: PrepMinutes = { ...PREP, soups: 0, salads: -5 }

    expect(estimateReadyAtMs(FIRED, ['soups', 'salads'], odd, DEFAULT_MINUTES)).toBe(
      FIRED + DEFAULT_MINUTES * MINUTES
    )
    expect(estimateReadyAtMs(FIRED, ['soups', 'mains'], odd, DEFAULT_MINUTES)).toBe(
      FIRED + 18 * MINUTES
    )
  })

  it('ignores a non-finite configured minute', () => {
    const broken = { starters: Number.NaN, mains: Number.POSITIVE_INFINITY } as PrepMinutes

    expect(estimateReadyAtMs(FIRED, ['starters', 'mains'], broken, DEFAULT_MINUTES)).toBe(
      FIRED + DEFAULT_MINUTES * MINUTES
    )
  })

  it('never returns a time before the order was fired', () => {
    for (const fallback of [0, -30]) {
      expect(estimateReadyAtMs(FIRED, [], {}, fallback)).toBeGreaterThanOrEqual(FIRED)
    }
  })

  it('returns the fire time itself when nothing usable is configured', () => {
    // Degrades to "no estimate worth having". `isRunWorthStarting` then refuses
    // the run rather than this inventing a number nobody measured.
    expect(estimateReadyAtMs(FIRED, [], {}, 0)).toBe(FIRED)
  })

  it('rounds a fractional minute to whole milliseconds', () => {
    const at = estimateReadyAtMs(FIRED, ['starters'], { starters: 7.5 }, DEFAULT_MINUTES)

    expect(at).toBe(FIRED + 450_000)
    expect(Number.isInteger(at)).toBe(true)
  })

  it('is deterministic', () => {
    const runs = Array.from({ length: 50 }, () =>
      estimateReadyAtMs(FIRED, ['starters', 'mains'], PREP, DEFAULT_MINUTES)
    )

    expect(new Set(runs).size).toBe(1)
  })
})
