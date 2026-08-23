import { describe, expect, it } from 'vitest'
import { explainNegative, minutesInState, tierFor, totalLedger, type LedgerRow } from './ledger'

/**
 * §6.4 and §9.4. The tier rule and the negative-night explanation are the two
 * that carry a promise to the operator rather than a calculation.
 */

const row = (over: Partial<LedgerRow> = {}): LedgerRow => ({
  atMs: 0,
  tableLabel: '1',
  result: 'Rung 2',
  prizeName: 'Tiramisu',
  prizeCostPaise: 8600,
  extraSpendPaise: 21300,
  netPaise: 12700,
  ...over,
})

describe('the ledger totals', () => {
  it('adds up each column and counts the rows', () => {
    const t = totalLedger([row(), row({ netPaise: -8600, extraSpendPaise: 0 })])

    expect(t.rows).toBe(2)
    expect(t.prizeCostPaise).toBe(17200)
    expect(t.extraSpendPaise).toBe(21300)
    expect(t.netPaise).toBe(4100)
  })

  it('totals an empty night to zero rather than to nothing', () => {
    expect(totalLedger([])).toEqual({
      prizeCostPaise: 0,
      extraSpendPaise: 0,
      netPaise: 0,
      rows: 0,
    })
  })
})

describe('which tier owns the headline (§6.4)', () => {
  it('leads with the app estimate until a bill lands', () => {
    expect(tierFor(0)).toBe('APP_ESTIMATE')
  })

  it('hands the headline over on the very first bill', () => {
    // One is enough. Continuing to lead with the estimate once a real figure
    // exists would be choosing the flattering number.
    expect(tierFor(1)).toBe('POS_BACKED')
    expect(tierFor(500)).toBe('POS_BACKED')
  })
})

describe('explaining a negative night (§9.4)', () => {
  const base = {
    netContributionPaise: -5000,
    minutesAtRed: 0,
    minutesKilled: 0,
    prizeCostPaise: 8000,
    addOnContributionPaise: 3000,
  }

  it('says nothing at all about a positive night', () => {
    // Explaining a good night unprompted is how a dashboard starts
    // editorialising at the operator.
    expect(explainNegative({ ...base, netContributionPaise: 100 })).toBeNull()
    expect(explainNegative({ ...base, netContributionPaise: 0 })).toBeNull()
  })

  it('blames the kill switch first, because it is the most specific cause', () => {
    const e = explainNegative({ ...base, minutesKilled: 40, minutesAtRed: 90 })

    expect(e?.reason).toContain('40 minutes')
    expect(e?.reason).toContain('switched off')
  })

  it('names a red kitchen when that is what happened', () => {
    const e = explainNegative({ ...base, minutesAtRed: 120 })

    expect(e?.reason).toContain('120 minutes')
    expect(e?.reason).toContain('red')
  })

  it('names the real cause when prizes went out and nothing came back', () => {
    const e = explainNegative({ ...base, addOnContributionPaise: 0 })

    expect(e?.reason).toContain('nothing was added')
  })

  it('always gives some reason for a negative night', () => {
    // A negative number with no explanation reads as a bug, and a pilot gets
    // cancelled by someone who thinks the software is broken.
    const e = explainNegative(base)

    expect(e).not.toBeNull()
    expect(e!.reason.trim().length).toBeGreaterThan(0)
  })
})

describe('minutes in a state, from append-only rows', () => {
  const END = 100 * 60_000

  it('runs each state until the next change', () => {
    const changes = [
      { state: 'GREEN' as const, atMs: 0 },
      { state: 'RED' as const, atMs: 10 * 60_000 },
      { state: 'GREEN' as const, atMs: 30 * 60_000 },
    ]

    expect(minutesInState(changes, 'RED', END)).toBe(20)
    expect(minutesInState(changes, 'GREEN', END)).toBe(80)
  })

  it('runs the last state to the end of the service', () => {
    expect(minutesInState([{ state: 'RED' as const, atMs: 90 * 60_000 }], 'RED', END)).toBe(10)
  })

  it('does not care what order the rows arrived in', () => {
    const shuffled = [
      { state: 'GREEN' as const, atMs: 30 * 60_000 },
      { state: 'RED' as const, atMs: 10 * 60_000 },
      { state: 'GREEN' as const, atMs: 0 },
    ]

    expect(minutesInState(shuffled, 'RED', END)).toBe(20)
  })

  it('is zero for a state never entered', () => {
    expect(minutesInState([{ state: 'GREEN' as const, atMs: 0 }], 'RED', END)).toBe(0)
    expect(minutesInState([], 'RED', END)).toBe(0)
  })

  it('never goes negative on a row recorded after the service ended', () => {
    expect(minutesInState([{ state: 'RED' as const, atMs: END + 60_000 }], 'RED', END)).toBe(0)
  })
})
