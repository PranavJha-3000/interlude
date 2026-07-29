import { describe, expect, it } from 'vitest'
import { summariseFunnel, type FunnelSessionInput } from './funnel'

function session(over: Partial<FunnelSessionInput> & { tableId: string }): FunnelSessionInput {
  return {
    playCount: 0,
    completedCount: 0,
    wonCount: 0,
    awardCount: 0,
    claimedCount: 0,
    ...over,
  }
}

describe('summariseFunnel', () => {
  it('counts two sessions at one table as two sessions but one scanned table', () => {
    const r = summariseFunnel({
      tentedTableIds: ['t1', 't2', 't3'],
      sessions: [session({ tableId: 't1' }), session({ tableId: 't1' })],
    })
    expect(r.scannedSessions).toBe(2)
    expect(r.scannedTables).toBe(1)
    expect(r.tentedTables).toBe(3)
  })

  it('sums the play funnel across sessions', () => {
    const r = summariseFunnel({
      tentedTableIds: ['t1', 't2'],
      sessions: [
        session({
          tableId: 't1',
          playCount: 1,
          completedCount: 1,
          wonCount: 1,
          awardCount: 1,
          claimedCount: 1,
        }),
        session({
          tableId: 't2',
          playCount: 1,
          completedCount: 1,
          wonCount: 0,
          awardCount: 1,
          claimedCount: 0,
        }),
      ],
    })
    expect(r.played).toBe(2)
    expect(r.completed).toBe(2)
    expect(r.won).toBe(1)
    expect(r.awarded).toBe(2)
    expect(r.claimed).toBe(1)
  })

  it('ignores a scan from a table that is not tented, rather than inflating scannedTables', () => {
    // A control table cannot open a session, so this should be impossible —
    // but if it ever happens the funnel must not silently count it as reach.
    const r = summariseFunnel({
      tentedTableIds: ['t1'],
      sessions: [session({ tableId: 't1' }), session({ tableId: 'rogue' })],
    })
    expect(r.scannedTables).toBe(1)
    expect(r.scannedSessions).toBe(2)
  })

  it('returns all zeroes for an empty service without dividing by anything', () => {
    const r = summariseFunnel({ tentedTableIds: [], sessions: [] })
    expect(r).toEqual({
      tentedTables: 0,
      scannedTables: 0,
      scannedSessions: 0,
      played: 0,
      completed: 0,
      won: 0,
      awarded: 0,
      claimed: 0,
    })
  })

  it('is a pure function of its input', () => {
    const input = {
      tentedTableIds: ['t1'],
      sessions: [session({ tableId: 't1', playCount: 1 })],
    }
    const first = JSON.stringify(summariseFunnel(input))
    for (let i = 0; i < 50; i++) {
      expect(JSON.stringify(summariseFunnel(input))).toBe(first)
    }
  })
})
