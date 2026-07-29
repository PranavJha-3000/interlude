import { describe, expect, it } from 'vitest'
import { defaultPrizeRules } from '@/core/prize-engine'
import {
  ONBOARDING_ORDER,
  isAtOrPast,
  newQrToken,
  nextOnboardingStep,
  slugify,
  type OnboardingStepName,
} from './venue-setup'

/**
 * Venue creation. The integration half — that `createVenue` writes a config row
 * with every gate populated — needs a database and lives in the E2E suite; what
 * is testable purely is asserted here.
 */

describe('QR tokens', () => {
  it('are long enough not to be guessed, and never repeat', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      const t = newQrToken()
      expect(t.length).toBeGreaterThanOrEqual(16)
      expect(seen.has(t)).toBe(false)
      seen.add(t)
    }
  })

  it('is URL-safe, because it goes in a path a guest scans', () => {
    for (let i = 0; i < 100; i++) {
      expect(newQrToken()).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })
})

describe('slugs', () => {
  it('turns a venue name into something addressable', () => {
    expect(slugify('The Pilot Kitchen')).toBe('the-pilot-kitchen')
    expect(slugify("Karim's  Café  ")).toBe('karim-s-cafe')
    expect(slugify('Bar 91 — Delhi')).toBe('bar-91-delhi')
  })

  it('never leaves a leading or trailing dash', () => {
    expect(slugify('!!! Hello !!!')).toBe('hello')
    expect(slugify('   ')).toBe('')
  })

  it('stays short enough for a URL', () => {
    expect(slugify('a'.repeat(200)).length).toBeLessThanOrEqual(60)
  })
})

describe('onboarding is resumable', () => {
  it('walks the steps in order and stops at DONE', () => {
    let step: OnboardingStepName = ONBOARDING_ORDER[0]
    const walked: OnboardingStepName[] = [step]
    for (let i = 0; i < 10; i++) {
      step = nextOnboardingStep(step)
      walked.push(step)
    }
    expect(walked.slice(0, ONBOARDING_ORDER.length)).toEqual([...ONBOARDING_ORDER])
    // Past the end it stays put rather than falling off — an operator who
    // finishes twice must not loop back to the start.
    expect(nextOnboardingStep('DONE')).toBe('DONE')
  })

  it('knows whether a step has already been passed', () => {
    expect(isAtOrPast('MENU', 'TABLES')).toBe(true)
    expect(isAtOrPast('MENU', 'MENU')).toBe(true)
    expect(isAtOrPast('TABLES', 'MENU')).toBe(false)
    expect(isAtOrPast('DONE', 'DETAILS')).toBe(true)
  })
})

describe('the starting prize policy', () => {
  it('covers both outcomes for both mechanics, so no guest can fall through', () => {
    const rules = defaultPrizeRules(9900)
    for (const mechanic of ['KITCHEN_ROUND', 'MYSTERY_PLATE'] as const) {
      for (const outcome of ['WIN', 'LOSE'] as const) {
        const catchAll = rules.find(
          (r) =>
            r.mechanic === mechanic &&
            r.outcome === outcome &&
            r.window === 'ANY' &&
            r.marginTier === undefined &&
            r.category === undefined &&
            r.menuItemId === undefined
        )
        expect(catchAll, `no catch-all rule for ${mechanic}/${outcome}`).toBeDefined()
      }
    }
  })

  it('gives a losing guest something rather than nothing', () => {
    const lose = defaultPrizeRules(9900).find(
      (r) => r.outcome === 'LOSE' && r.mechanic === 'KITCHEN_ROUND'
    )
    expect(lose?.kind).toBe('PERCENT_OFF')
    expect(lose?.percentOff).toBeGreaterThan(0)
  })

  it('takes the mystery-plate price as an argument rather than hardcoding one', () => {
    const cheap = defaultPrizeRules(4900).find((r) => r.mechanic === 'MYSTERY_PLATE')
    const dear = defaultPrizeRules(19900).find((r) => r.mechanic === 'MYSTERY_PLATE')
    expect(cheap?.fixedPricePaise).toBe(4900)
    expect(dear?.fixedPricePaise).toBe(19900)
  })

  it('gives every rule a label an operator could recognise as their own', () => {
    for (const r of defaultPrizeRules(9900)) {
      expect(r.label.trim().length).toBeGreaterThan(0)
    }
  })
})
