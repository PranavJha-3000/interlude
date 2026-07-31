import { describe, expect, it } from 'vitest'
import {
  baselineForWeekday,
  compareToBaseline,
  computeMetrics,
  computeSpend,
  type MetricEvent,
} from './metrics'

/**
 * §6.3, and the distinction §6.1 calls critical: the unit of play is the table,
 * not the phone.
 *
 * Most of these tests are really one assertion — that four phones at one table
 * are one run — asked in the places where getting it wrong would produce a
 * plausible number rather than an obviously broken one.
 */

let clock = 0
function ev(
  type: string,
  tableRunId: string | null,
  deviceSessionId: string | null = null,
  detail?: Record<string, unknown>
): MetricEvent {
  return { type, tableRunId, deviceSessionId, at: clock++, detail }
}

describe('the unit of play is the table (§6.1)', () => {
  it('counts one run however many phones scanned at it', () => {
    // The failure this prevents: four devices at one table reading as four
    // scans, which quadruples scan rate and quarters completion rate at once.
    const events = [
      ev('SESSION_OPEN', 'run_1', 'dev_1'),
      ev('SESSION_OPEN', 'run_1', 'dev_2'),
      ev('SESSION_OPEN', 'run_1', 'dev_3'),
      ev('SESSION_OPEN', 'run_1', 'dev_4'),
    ]
    const m = computeMetrics(events, 10)

    expect(m.runsOpened).toBe(1)
    expect(m.devices).toBe(4)
    expect(m.scanRatePct).toBe(10)
  })

  it('measures the inheritance mechanic with the one figure that counts devices', () => {
    const events = [
      ev('SESSION_OPEN', 'run_1', 'dev_1'),
      ev('SESSION_OPEN', 'run_1', 'dev_2'),
      ev('SESSION_OPEN', 'run_2', 'dev_3'),
    ]

    expect(computeMetrics(events, 2).devicesPerRun).toBe(1.5)
  })

  it('does not double-count a run that emits the same event twice', () => {
    const events = [ev('RUN_START', 'run_1', 'dev_1'), ev('RUN_START', 'run_1', 'dev_2')]

    expect(computeMetrics(events, 1).runsStarted).toBe(1)
  })
})

describe('scan and completion rate', () => {
  it('divides runs opened by tables tented', () => {
    const events = [ev('SESSION_OPEN', 'run_1'), ev('SESSION_OPEN', 'run_2')]

    expect(computeMetrics(events, 8).scanRatePct).toBe(25)
  })

  it('divides runs reaching a rung by runs started', () => {
    const events = [ev('RUN_START', 'run_1'), ev('RUN_START', 'run_2'), ev('RUNG_REACHED', 'run_1')]

    expect(computeMetrics(events, 2).completionRatePct).toBe(50)
  })

  it('returns null rather than zero when nothing was tented', () => {
    // A service with no denominator has no rate. Zero would read as a
    // catastrophic night rather than as an absent measurement.
    expect(computeMetrics([], 0).scanRatePct).toBeNull()
    expect(computeMetrics([]).completionRatePct).toBeNull()
  })

  it('falls back to counting TENT_PRESENT when no count is passed', () => {
    const events = [ev('TENT_PRESENT', 'run_1'), ev('TENT_PRESENT', 'run_2')]

    expect(computeMetrics(events).tablesTented).toBe(2)
  })
})

describe('run endings are split by cause (§6.2)', () => {
  it('separates food arriving from abandonment', () => {
    // The one that matters. Folding these together makes completion rate look
    // broken on exactly the nights the product worked.
    const events = [
      ev('RUN_END', 'run_1', null, { reason: 'FOOD_ARRIVED' }),
      ev('RUN_END', 'run_2', null, { reason: 'ABANDONED' }),
      ev('RUN_END', 'run_3', null, { reason: 'WRONG_ANSWER' }),
      ev('RUN_END', 'run_4', null, { reason: 'TIMEOUT' }),
    ]
    const { runEnds } = computeMetrics(events, 4)

    expect(runEnds.foodArrived).toBe(1)
    expect(runEnds.abandoned).toBe(1)
    expect(runEnds.wrongAnswer).toBe(1)
    expect(runEnds.timeout).toBe(1)
  })

  it('treats an end with no recorded reason as abandonment', () => {
    // What a closed tab produces. Nothing gets to give it a tidier label.
    const { runEnds } = computeMetrics([ev('RUN_END', 'run_1')], 1)

    expect(runEnds.abandoned).toBe(1)
  })
})

describe('add-on conversion', () => {
  it('counts confirmations, not requests', () => {
    // The life is granted on staff confirmation (§4.4), and so is the metric —
    // a request nobody honoured is not a sale.
    const events = [
      ev('SESSION_OPEN', 'run_1'),
      ev('SESSION_OPEN', 'run_2'),
      ev('ADDON_REQUESTED', 'run_1'),
      ev('ADDON_REQUESTED', 'run_2'),
      ev('ADDON_CONFIRMED', 'run_1'),
    ]
    const m = computeMetrics(events, 2)

    expect(m.addOnsRequested).toBe(2)
    expect(m.addOnsConfirmed).toBe(1)
    expect(m.addOnConversionPct).toBe(50)
  })
})

describe('spend (§3 — per cover is primary)', () => {
  it('divides by covers, not by bills', () => {
    const bills = [
      { tableId: 't1', totalPaise: 120000, covers: 4, attached: true },
      { tableId: 't2', totalPaise: 60000, covers: 2, attached: false },
    ]
    const s = computeSpend(bills)

    expect(s.covers).toBe(6)
    expect(s.spendPerCoverPaise).toBe(30000)
    expect(s.spendPerTablePaise).toBe(90000)
  })

  it('excludes a bill with no cover count rather than assuming two', () => {
    // A guessed denominator is worse than a smaller honest one.
    const bills = [
      { tableId: 't1', totalPaise: 100000, covers: 4, attached: false },
      { tableId: 't2', totalPaise: 999999, covers: null, attached: false },
    ]
    const s = computeSpend(bills)

    expect(s.covers).toBe(4)
    expect(s.spendPerCoverPaise).toBe(25000)
    // It still counts toward the per-table figure and the total.
    expect(s.bills).toBe(2)
  })

  it('reports attach rate over bills', () => {
    const bills = [
      { tableId: 't1', totalPaise: 1, covers: 1, attached: true },
      { tableId: 't2', totalPaise: 1, covers: 1, attached: false },
      { tableId: 't3', totalPaise: 1, covers: 1, attached: false },
      { tableId: 't4', totalPaise: 1, covers: 1, attached: true },
    ]

    expect(computeSpend(bills).attachRatePct).toBe(50)
  })

  it('has no rates at all for an empty import', () => {
    const s = computeSpend([])

    expect(s.spendPerCoverPaise).toBeNull()
    expect(s.attachRatePct).toBeNull()
  })
})

describe('comparison against the historical baseline (§3)', () => {
  const gates = { killBelowPct: 4, proceedAtPct: 6 }

  it('proceeds at or above the proceed gate', () => {
    expect(compareToBaseline(10600, 10000, gates).verdict).toBe('PROCEED')
  })

  it('watches between the two gates, and kills below the lower one', () => {
    // §6.3: kill below 4 percent, proceed at 6. The band between them is the
    // one that needs another weekend rather than a decision.
    expect(compareToBaseline(10500, 10000, gates).verdict).toBe('WATCH')
    expect(compareToBaseline(10400, 10000, gates).verdict).toBe('WATCH')
    expect(compareToBaseline(10300, 10000, gates).verdict).toBe('KILL')
    expect(compareToBaseline(9000, 10000, gates).verdict).toBe('KILL')
    expect(compareToBaseline(10200, 10000, gates).deltaPct).toBe(2)
  })

  it('says UNKNOWN rather than inventing a number when a side is missing', () => {
    // The whole argument for the historical baseline is that it is honest
    // without spending a live service.
    expect(compareToBaseline(null, 10000, gates).verdict).toBe('UNKNOWN')
    expect(compareToBaseline(10000, null, gates).verdict).toBe('UNKNOWN')
    expect(compareToBaseline(10000, 0, gates).verdict).toBe('UNKNOWN')
  })

  it('averages the baseline over same-weekday services only', () => {
    // Saturday against Saturday (§3). A Tuesday in the mean is the day-of-week
    // effect the counterbalancing exists to remove.
    const history = [
      { weekday: 6, covers: 100, totalPaise: 1000000 },
      { weekday: 6, covers: 100, totalPaise: 1200000 },
      { weekday: 2, covers: 100, totalPaise: 100 },
    ]

    expect(baselineForWeekday(history, 6)).toBe(11000)
  })

  it('has no baseline for a weekday never imported', () => {
    expect(baselineForWeekday([{ weekday: 6, covers: 10, totalPaise: 100 }], 3)).toBeNull()
  })
})

describe('purity', () => {
  it('is deterministic and order-independent', () => {
    const events = [
      ev('SESSION_OPEN', 'run_1', 'dev_1'),
      ev('RUN_START', 'run_1', 'dev_1'),
      ev('RUNG_REACHED', 'run_1', 'dev_1'),
      ev('RUN_END', 'run_1', 'dev_1', { reason: 'FOOD_ARRIVED' }),
    ]

    expect(computeMetrics([...events].reverse(), 5)).toEqual(computeMetrics(events, 5))
  })
})
