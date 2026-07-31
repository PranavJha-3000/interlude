import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  meetsVelocityGate,
  reviewVelocity,
  shouldShowReviewPrompt,
  summariseReviewFunnel,
  type ReviewPromptInput,
} from './prompt'

/**
 * §7.2 and the §12 lines that check it.
 *
 * Two of these tests read this module's own source rather than calling it. That
 * is deliberate: the isolation rule is about what the module is *able* to see,
 * and no amount of calling a function proves it never imported something. The
 * lint rule is the primary enforcement; these are the ones that fail in a test
 * run, where someone is more likely to be looking.
 */

const HERE = join(process.cwd(), 'src', 'core', 'review')

function reviewModuleSources(): Array<{ file: string; source: string }> {
  return readdirSync(HERE)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((file) => ({ file, source: readFileSync(join(HERE, file), 'utf8') }))
}

describe('the prompt fires for every table session (§7.2)', () => {
  const base: ReviewPromptInput = { tableRunId: 'run_1', serviceId: 'svc_1', atBill: true }

  it('shows at the bill, unconditionally', () => {
    expect(shouldShowReviewPrompt(base)).toBe(true)
  })

  it('shows regardless of play, win, loss, or whether anyone scanned', () => {
    // The input type has no field for any of those, so this test is really
    // asserting that it still does not — if someone adds `won` to the input,
    // this is where the argument about why happens.
    const keys = Object.keys(base)

    expect(keys).toEqual(['tableRunId', 'serviceId', 'atBill'])
    for (const k of keys) {
      expect(['won', 'rung', 'prize', 'award', 'rating', 'lives']).not.toContain(k)
    }
  })

  it('has exactly one condition, and it is the bill', () => {
    expect(shouldShowReviewPrompt({ ...base, atBill: false })).toBe(false)
    expect(shouldShowReviewPrompt({ ...base, atBill: true })).toBe(true)
  })
})

describe('the module cannot read prize, award, life or game state (§7.2)', () => {
  it('imports nothing from the engine, the game, or the database', () => {
    const forbidden = [
      '@/core/prize-engine',
      '@/core/game',
      '@/core/mechanics',
      '@/lib/db',
      '@/generated/prisma',
      '@prisma/',
    ]

    for (const { file, source } of reviewModuleSources()) {
      for (const pattern of forbidden) {
        expect(
          source.includes(`from '${pattern}`),
          `${file} imports ${pattern} — see §7.2, the review module is given no prize or award state`
        ).toBe(false)
      }
    }
  })

  it('stores no rating at any stage before hand-off (§12)', () => {
    // Not "we choose not to read it" — there is no field to read. Sentiment
    // gating is structurally impossible rather than merely disallowed.
    const funnel = summariseReviewFunnel({ shown: 10, opened: 4, handedOff: 2 })

    expect(Object.keys(funnel).sort()).toEqual(
      ['handOffRatePct', 'handedOff', 'openRatePct', 'opened', 'shown'].sort()
    )
    expect('rating' in funnel).toBe(false)
    expect('sentiment' in funnel).toBe(false)
    expect('score' in funnel).toBe(false)
  })

  it('names no rating or sentiment field anywhere in its source', () => {
    for (const { file, source } of reviewModuleSources()) {
      // Comments discuss the rule, so only declarations are checked.
      const declarations = source
        .split('\n')
        .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'))
        .join('\n')

      expect(/\brating\s*[?:]/.test(declarations), `${file} declares a rating field`).toBe(false)
      expect(/\bsentiment\s*[?:]/.test(declarations), `${file} declares a sentiment field`).toBe(
        false
      )
    }
  })
})

describe('the funnel', () => {
  it('counts the drop at hand-off rather than trying to close it', () => {
    // There is no third-party write interface to Google, by design. The drop is
    // real and the honest thing is to report it.
    const f = summariseReviewFunnel({ shown: 100, opened: 30, handedOff: 12 })

    expect(f.openRatePct).toBe(30)
    expect(f.handOffRatePct).toBe(12)
  })

  it('has no rates for a service that showed nothing', () => {
    const f = summariseReviewFunnel({ shown: 0, opened: 0, handedOff: 0 })

    expect(f.openRatePct).toBeNull()
    expect(f.handOffRatePct).toBeNull()
  })
})

describe('review velocity (§6.3)', () => {
  it('reports the multiple against the pre-launch baseline', () => {
    expect(reviewVelocity(6, 3).multiple).toBe(2)
  })

  it('refuses to report a multiple against a baseline of zero', () => {
    // A venue that had no reviews before is not up by an infinite multiple.
    expect(reviewVelocity(6, 0).multiple).toBeNull()
  })

  it('checks the venue own gate', () => {
    expect(meetsVelocityGate(2, 2)).toBe(true)
    expect(meetsVelocityGate(1.9, 2)).toBe(false)
    expect(meetsVelocityGate(null, 2)).toBe(false)
  })
})
