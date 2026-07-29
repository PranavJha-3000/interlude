import { describe, expect, it } from 'vitest'
import {
  armAt,
  canOpenSession,
  partitionByArm,
  planArmAssignments,
  planMidServiceSwap,
  type ArmRow,
  type TableForAssignment,
} from './arm-assignment'

const T0 = 1_700_000_000_000
const HOUR = 3_600_000

function tables(n: number): TableForAssignment[] {
  return Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, label: String(i + 1) }))
}

describe('the split is balanced and explainable', () => {
  it('alternates so the two arms differ by at most one table', () => {
    for (const n of [2, 3, 10, 29, 30]) {
      const plan = planArmAssignments(tables(n))
      const t = plan.filter((p) => p.arm === 'TREATMENT').length
      const c = plan.filter((p) => p.arm === 'CONTROL').length
      expect(Math.abs(t - c)).toBeLessThanOrEqual(1)
      expect(t + c).toBe(n)
    }
  })

  it('sorts table 2 before table 10, not lexically', () => {
    const plan = planArmAssignments([
      { id: 'b', label: '10' },
      { id: 'a', label: '2' },
    ])
    expect(plan[0]?.tableId).toBe('a')
  })

  it('does not depend on the order rows came out of the database', () => {
    const t = tables(12)
    const a = planArmAssignments(t)
    const b = planArmAssignments([...t].reverse())
    expect(a).toEqual(b)
  })

  it('records a reason on every assignment', () => {
    for (const p of planArmAssignments(tables(8))) {
      expect(p.reason.trim().length).toBeGreaterThan(0)
    }
  })

  it('can start on control so consecutive services do not favour the same tables', () => {
    const a = planArmAssignments(tables(4), 'TREATMENT')
    const b = planArmAssignments(tables(4), 'CONTROL')
    expect(a.map((x) => x.arm)).toEqual(['TREATMENT', 'CONTROL', 'TREATMENT', 'CONTROL'])
    expect(b.map((x) => x.arm)).toEqual(['CONTROL', 'TREATMENT', 'CONTROL', 'TREATMENT'])
  })
})

describe('the mid-service swap cancels out table position', () => {
  it('flips every table', () => {
    const first = planArmAssignments(tables(6))
    const second = planMidServiceSwap(first)
    expect(second).toHaveLength(first.length)
    for (let i = 0; i < first.length; i++) {
      expect(second[i]?.tableId).toBe(first[i]?.tableId)
      expect(second[i]?.arm).not.toBe(first[i]?.arm)
    }
  })

  it('leaves every table having spent time on both arms', () => {
    const first = planArmAssignments(tables(10))
    const second = planMidServiceSwap(first)
    for (const t of tables(10)) {
      const arms = new Set([
        first.find((a) => a.tableId === t.id)?.arm,
        second.find((a) => a.tableId === t.id)?.arm,
      ])
      expect(arms.size).toBe(2)
    }
  })
})

describe('reading a recorded assignment back', () => {
  const rows: ArmRow[] = [
    { tableId: 't1', arm: 'TREATMENT', effectiveFromMs: T0, effectiveToMs: T0 + 2 * HOUR },
    { tableId: 't1', arm: 'CONTROL', effectiveFromMs: T0 + 2 * HOUR, effectiveToMs: null },
  ]

  it('returns the arm in force at that moment, not the latest one', () => {
    expect(armAt(rows, 't1', T0 + HOUR)).toBe('TREATMENT')
    expect(armAt(rows, 't1', T0 + 3 * HOUR)).toBe('CONTROL')
  })

  it('treats the boundary as belonging to the new row', () => {
    expect(armAt(rows, 't1', T0 + 2 * HOUR)).toBe('CONTROL')
  })

  it('returns null before the service started', () => {
    expect(armAt(rows, 't1', T0 - 1)).toBeNull()
  })

  it('returns null for a table that was never enrolled', () => {
    expect(armAt(rows, 'never-seen', T0 + HOUR)).toBeNull()
  })
})

describe('control tables cannot play (PLATFORM.md §7, enforced invariant)', () => {
  const rows: ArmRow[] = [
    { tableId: 'treat', arm: 'TREATMENT', effectiveFromMs: T0, effectiveToMs: null },
    { tableId: 'ctrl', arm: 'CONTROL', effectiveFromMs: T0, effectiveToMs: null },
  ]

  it('lets a treatment table open a session', () => {
    const r = canOpenSession(rows, 'treat', T0 + HOUR)
    expect(r.allowed).toBe(true)
    expect(r.arm).toBe('TREATMENT')
  })

  it('refuses a control table', () => {
    const r = canOpenSession(rows, 'ctrl', T0 + HOUR)
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('Control table — cannot open a session')
  })

  it('fails closed for an unenrolled table rather than assuming treatment', () => {
    const r = canOpenSession(rows, 'unknown', T0 + HOUR)
    expect(r.allowed).toBe(false)
    expect(r.arm).toBeNull()
  })

  it('refuses the same table after it swaps onto control mid-service', () => {
    const swapped: ArmRow[] = [
      { tableId: 'x', arm: 'TREATMENT', effectiveFromMs: T0, effectiveToMs: T0 + 2 * HOUR },
      { tableId: 'x', arm: 'CONTROL', effectiveFromMs: T0 + 2 * HOUR, effectiveToMs: null },
    ]
    expect(canOpenSession(swapped, 'x', T0 + HOUR).allowed).toBe(true)
    expect(canOpenSession(swapped, 'x', T0 + 3 * HOUR).allowed).toBe(false)
  })

  it('never allows a session for any control table across a whole planned service', () => {
    const plan = planArmAssignments(tables(30))
    const rows: ArmRow[] = plan.map((p) => ({
      tableId: p.tableId,
      arm: p.arm,
      effectiveFromMs: T0,
      effectiveToMs: null,
    }))
    for (const p of plan) {
      const r = canOpenSession(rows, p.tableId, T0 + HOUR)
      expect(r.allowed).toBe(p.arm === 'TREATMENT')
    }
  })
})

describe('partitioning for the intent-to-treat comparison', () => {
  const rows: ArmRow[] = [
    { tableId: 'a', arm: 'TREATMENT', effectiveFromMs: T0, effectiveToMs: null },
    { tableId: 'b', arm: 'CONTROL', effectiveFromMs: T0, effectiveToMs: null },
  ]

  it('separates the arms', () => {
    const p = partitionByArm(rows, ['a', 'b'], T0 + HOUR)
    expect(p.treatment).toEqual(['a'])
    expect(p.control).toEqual(['b'])
  })

  it('excludes unassigned tables rather than defaulting them into an arm', () => {
    const p = partitionByArm(rows, ['a', 'b', 'c'], T0 + HOUR)
    expect(p.unassigned).toEqual(['c'])
    expect(p.treatment).not.toContain('c')
    expect(p.control).not.toContain('c')
  })
})
