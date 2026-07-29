import { describe, expect, it } from 'vitest'
import { countScannedTreatmentTables, summariseFunnel } from './funnel'
import { summariseEngagement } from './contribution'

describe('summariseFunnel', () => {
  it('counts two sessions at one table as two sessions but one scanned table', () => {
    const r = summariseFunnel({
      tentedTableIds: ['t1', 't2', 't3'],
      scannedTableIds: ['t1', 't1'],
      scannedSessions: 2,
      playedSessions: 0,
      claimedSessions: 0,
    })
    expect(r.scannedSessions).toBe(2)
    expect(r.scannedTables).toBe(1)
    expect(r.tentedTables).toBe(3)
  })

  it('ignores a scan from a table that is not tented, rather than inflating scannedTables', () => {
    // A control table cannot open a session, so this should be impossible —
    // but if it ever happens the funnel must not silently count it as reach.
    const r = summariseFunnel({
      tentedTableIds: ['t1'],
      scannedTableIds: ['t1', 'rogue'],
      scannedSessions: 2,
      playedSessions: 0,
      claimedSessions: 0,
    })
    expect(r.scannedTables).toBe(1)
    expect(r.scannedSessions).toBe(2)
  })

  it('returns all zeroes for an empty service without dividing by anything', () => {
    const r = summariseFunnel({
      tentedTableIds: [],
      scannedTableIds: [],
      scannedSessions: 0,
      playedSessions: 0,
      claimedSessions: 0,
    })
    expect(r).toEqual({
      tentedTables: 0,
      scannedTables: 0,
      scannedSessions: 0,
      playedSessions: 0,
      claimedSessions: 0,
    })
  })

  it('is a pure function of its input', () => {
    const input = {
      tentedTableIds: ['t1'],
      scannedTableIds: ['t1'],
      scannedSessions: 1,
      playedSessions: 1,
      claimedSessions: 0,
    }
    const first = JSON.stringify(summariseFunnel(input))
    for (let i = 0; i < 50; i++) {
      expect(JSON.stringify(summariseFunnel(input))).toBe(first)
    }
  })
})

describe('the funnel descends', () => {
  it('counts sessions at every stage, so a stage can never exceed the one above it', () => {
    // Two sessions at one table, one of which claimed. Two plays on one session
    // would once have made `played` exceed `scannedSessions`; it cannot now,
    // because the caller counts sessions-that-played rather than plays.
    const summary = summariseFunnel({
      tentedTableIds: ['t1', 't2'],
      scannedTableIds: ['t1', 't1'],
      scannedSessions: 2,
      playedSessions: 2,
      claimedSessions: 1,
    })

    expect(summary.tentedTables).toBe(2)
    expect(summary.scannedTables).toBe(1)
    expect(summary.scannedSessions).toBe(2)
    expect(summary.playedSessions).toBe(2)
    expect(summary.claimedSessions).toBe(1)
    expect(summary.playedSessions).toBeLessThanOrEqual(summary.scannedSessions)
    expect(summary.claimedSessions).toBeLessThanOrEqual(summary.playedSessions)
  })

  it('counts a table that scanned but never played', () => {
    const summary = summariseFunnel({
      tentedTableIds: ['t1'],
      scannedTableIds: ['t1'],
      scannedSessions: 1,
      playedSessions: 0,
      claimedSessions: 0,
    })
    expect(summary.scannedTables).toBe(1)
    expect(summary.playedSessions).toBe(0)
  })

  it('never puts a numerator above its own denominator', () => {
    // A table deactivated after its scan, or moved by a mid-service swap. Its
    // session is real and counted; its table is not in the denominator, so the
    // scan rate cannot exceed 100%.
    const summary = summariseFunnel({
      tentedTableIds: ['t1'],
      scannedTableIds: ['t1', 'gone'],
      scannedSessions: 2,
      playedSessions: 2,
      claimedSessions: 0,
    })
    expect(summary.tentedTables).toBe(1)
    expect(summary.scannedTables).toBe(1)
    expect(summary.scannedSessions).toBe(2)
  })
})

describe('countScannedTreatmentTables', () => {
  it('ignores a session from a table that is not on the treatment arm', () => {
    // A table deactivated after it scanned, or moved by a mid-service swap.
    expect(
      countScannedTreatmentTables(['t1', 't2'], [{ tableId: 't1' }, { tableId: 'gone' }])
    ).toBe(1)
  })

  it('cannot report a scan rate above 100%', () => {
    const tented = ['t1', 't2']
    const scannedTables = countScannedTreatmentTables(tented, [
      { tableId: 't1' },
      { tableId: 't2' },
      { tableId: 'deactivated-after-scanning' },
      { tableId: 'swapped-to-control' },
    ])

    const engagement = summariseEngagement({
      tentedTables: tented.length,
      scannedTables,
      roundsStarted: 0,
      roundsCompleted: 0,
    })
    expect(engagement.scanRatePct).toBe(100)
    expect(engagement.scanRatePct).toBeLessThanOrEqual(100)
  })

  it('is the same count /dash/activity prints, so the two pages cannot disagree', () => {
    const tented = ['t1', 't2']
    const scannedTableIds = ['t1', 'not-tented', 'not-tented']
    expect(countScannedTreatmentTables(tented, scannedTableIds.map((tableId) => ({ tableId })))).toBe(
      summariseFunnel({
        tentedTableIds: tented,
        scannedTableIds,
        scannedSessions: scannedTableIds.length,
        playedSessions: 0,
        claimedSessions: 0,
      }).scannedTables
    )
  })
})
