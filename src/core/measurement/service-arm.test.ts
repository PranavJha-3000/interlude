import { describe, expect, it } from 'vitest'
import {
  armInForce,
  isAppendOnly,
  isCounterbalanced,
  planCounterbalancedServices,
  wasDecidedBeforeOpen,
  type ArmRecord,
} from './service-arm'

/**
 * §3's control design, which replaces the per-table arm.
 *
 * The test that matters most is the counterbalance one: a schedule that runs
 * every Saturday live and every Sunday dark looks like a control design and
 * measures the difference between Saturday and Sunday.
 */

const SAT = 6
const SUN = 0

/** Four weekends of Saturday/Sunday services. */
const FOUR_WEEKENDS = [
  { date: '2026-04-04', weekday: SAT },
  { date: '2026-04-05', weekday: SUN },
  { date: '2026-04-11', weekday: SAT },
  { date: '2026-04-12', weekday: SUN },
  { date: '2026-04-18', weekday: SAT },
  { date: '2026-04-19', weekday: SUN },
  { date: '2026-04-25', weekday: SAT },
  { date: '2026-04-26', weekday: SUN },
]

describe('counterbalancing (§3)', () => {
  it('reverses which night is live each weekend', () => {
    const plan = planCounterbalancedServices(FOUR_WEEKENDS)

    // Weekend one: Saturday dark, Sunday live. Weekend two: the reverse.
    expect(plan[0]!.arm).toBe('CONTROL')
    expect(plan[1]!.arm).toBe('LIVE')
    expect(plan[2]!.arm).toBe('LIVE')
    expect(plan[3]!.arm).toBe('CONTROL')
  })

  it('measures every weekday on both arms', () => {
    // The property the whole design exists for. Without it, day-of-week is
    // confounded with the treatment and no amount of arithmetic separates them.
    expect(isCounterbalanced(planCounterbalancedServices(FOUR_WEEKENDS))).toBe(true)
  })

  it('rejects a schedule that always runs Saturday live', () => {
    const confounded = FOUR_WEEKENDS.map((d) => ({
      ...d,
      arm: d.weekday === SAT ? ('LIVE' as const) : ('CONTROL' as const),
      reason: 'every Saturday live',
    }))

    expect(isCounterbalanced(confounded)).toBe(false)
  })

  it('rejects a schedule with only one arm', () => {
    const allLive = FOUR_WEEKENDS.map((d) => ({ ...d, arm: 'LIVE' as const, reason: 'all live' }))

    expect(isCounterbalanced(allLive)).toBe(false)
  })

  it('can start live instead, and stays balanced either way', () => {
    const plan = planCounterbalancedServices(FOUR_WEEKENDS, true)

    expect(plan[0]!.arm).toBe('LIVE')
    expect(isCounterbalanced(plan)).toBe(true)
  })

  it('gives every planned service a non-empty reason', () => {
    for (const p of planCounterbalancedServices(FOUR_WEEKENDS)) {
      expect(p.reason.trim().length).toBeGreaterThan(0)
    }
  })

  it('is deterministic', () => {
    expect(planCounterbalancedServices(FOUR_WEEKENDS)).toEqual(
      planCounterbalancedServices(FOUR_WEEKENDS)
    )
  })

  it('plans nothing for no services', () => {
    expect(planCounterbalancedServices([])).toEqual([])
    expect(isCounterbalanced([])).toBe(false)
  })
})

describe('the append-only record (§12)', () => {
  const record = (over: Partial<ArmRecord> & { id: string }): ArmRecord => ({
    arm: 'LIVE',
    reason: 'planned',
    recordedAtMs: 1000,
    supersedesId: null,
    ...over,
  })

  it('takes the latest row as the arm in force', () => {
    const rows = [
      record({ id: 'a', arm: 'LIVE', recordedAtMs: 1000 }),
      record({ id: 'b', arm: 'CONTROL', recordedAtMs: 2000, supersedesId: 'a' }),
    ]

    expect(armInForce(rows)!.arm).toBe('CONTROL')
  })

  it('leaves the superseded row exactly as written', () => {
    // A correction must not be able to rewrite what was believed at the time.
    const original = record({ id: 'a', arm: 'LIVE', reason: 'planned live' })
    const rows = [
      original,
      record({ id: 'b', arm: 'CONTROL', recordedAtMs: 2000, supersedesId: 'a' }),
    ]

    armInForce(rows)

    expect(rows[0]).toEqual(original)
    expect(rows[0]!.reason).toBe('planned live')
  })

  it('has no arm for a service nothing was recorded against', () => {
    expect(armInForce([])).toBeNull()
  })

  it('accepts a correction chain that names what it replaces', () => {
    const rows = [
      record({ id: 'a' }),
      record({ id: 'b', recordedAtMs: 2000, supersedesId: 'a' }),
      record({ id: 'c', recordedAtMs: 3000, supersedesId: 'b' }),
    ]

    expect(isAppendOnly(rows)).toBe(true)
  })

  it('refuses two corrections claiming the same predecessor', () => {
    const rows = [
      record({ id: 'a' }),
      record({ id: 'b', recordedAtMs: 2000, supersedesId: 'a' }),
      record({ id: 'c', recordedAtMs: 3000, supersedesId: 'a' }),
    ]

    expect(isAppendOnly(rows)).toBe(false)
  })

  it('refuses a correction naming a row that does not exist', () => {
    expect(isAppendOnly([record({ id: 'b', supersedesId: 'ghost' })])).toBe(false)
  })
})

describe('decided before the service opened', () => {
  const opened = 5000

  it('accepts an arm recorded before the doors', () => {
    expect(
      wasDecidedBeforeOpen(
        [{ id: 'a', arm: 'LIVE', reason: 'planned', recordedAtMs: 4000 }],
        opened
      )
    ).toBe(true)
  })

  it('refuses an arm first recorded once the night was underway', () => {
    // An arm chosen after the first guest scanned is an arm that could have
    // been chosen because the night was going well.
    expect(
      wasDecidedBeforeOpen([{ id: 'a', arm: 'LIVE', reason: 'late', recordedAtMs: 6000 }], opened)
    ).toBe(false)
  })

  it('judges by the original row, not by a later correction', () => {
    const rows: ArmRecord[] = [
      { id: 'a', arm: 'LIVE', reason: 'planned', recordedAtMs: 4000 },
      { id: 'b', arm: 'CONTROL', reason: 'corrected', recordedAtMs: 9000, supersedesId: 'a' },
    ]

    expect(wasDecidedBeforeOpen(rows, opened)).toBe(true)
  })

  it('refuses a service with no arm at all', () => {
    expect(wasDecidedBeforeOpen([], opened)).toBe(false)
  })
})
