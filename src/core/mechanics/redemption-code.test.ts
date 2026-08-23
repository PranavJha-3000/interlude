import { describe, expect, it } from 'vitest'
import { hashToRange } from '@/core/mechanics/hash'
import { newRedemptionCode } from '@/core/mechanics/redemption-code'

/**
 * The regression this file pins down: `newRedemptionCode` used to take a
 * picker without a position, the caller closed over one hash, and every code
 * came out as five copies of the same character — a 26-code keyspace against a
 * globally `@unique` column. The second colliding award failed its insert at
 * the table, mid-service, with a guest waiting.
 */

/** Exactly the derivation `decideAndWriteAward` uses, attempt 0. */
function codeFor(seed: string): string {
  return newRedemptionCode((max, position) => hashToRange(`${seed}:0:${position}`, max))
}

describe('newRedemptionCode', () => {
  it('is deterministic per seed — the audit trail can re-derive any code', () => {
    expect(codeFor('run-a:3')).toBe(codeFor('run-a:3'))
    expect(codeFor('run-a:3')).not.toBe(codeFor('run-b:3'))
  })

  it('draws five characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      expect(codeFor(`run-${i}:2`)).toMatch(/^[ACDEFGHJKLMNPQRTUVWXY34679]{5}$/)
    }
  })

  it('uses the position — codes are not five copies of one character', () => {
    // Under the old contract every single code was a 5-repeat. In the real
    // keyspace a repeat happens once in ~457,000 codes; across 200 it should
    // essentially never.
    const repeats = Array.from({ length: 200 }, (_, i) => codeFor(`table-${i}:1`)).filter((c) =>
      c.split('').every((ch) => ch === c[0])
    )
    expect(repeats).toHaveLength(0)
  })

  it('spans a keyspace that survives a real season, not 26 codes', () => {
    const seen = new Set<string>()
    const draws = 10_000
    for (let i = 0; i < draws; i++) seen.add(codeFor(`run-${i}:${i % 6}`))
    // 26^5 ≈ 11.9M; the birthday bound expects ~4 collisions in 10k draws.
    // The old defect produced 26 distinct codes here.
    expect(seen.size).toBeGreaterThan(draws - 30)
  })
})
