import { describe, expect, it } from 'vitest'
import { MECHANICS, defaultPrizeRules } from '@/core/prize-engine'
import {
  ONBOARDING_ORDER,
  defaultVenueGames,
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
  it('covers both outcomes of the one shipping mechanic, so no guest can fall through', () => {
    const rules = defaultPrizeRules()
    for (const outcome of ['WIN', 'LOSE'] as const) {
      const catchAll = rules.find(
        (r) =>
          r.mechanic === 'BEAT_THE_KITCHEN' &&
          r.outcome === outcome &&
          r.window === 'ANY' &&
          r.marginTier === undefined &&
          r.category === undefined &&
          r.menuItemId === undefined
      )
      expect(catchAll, `no catch-all rule for BEAT_THE_KITCHEN/${outcome}`).toBeDefined()
    }
  })

  it('gives a losing guest something rather than nothing', () => {
    const lose = defaultPrizeRules().find(
      (r) => r.outcome === 'LOSE' && r.mechanic === 'BEAT_THE_KITCHEN'
    )
    expect(lose?.kind).toBe('PERCENT_OFF')
    expect(lose?.percentOff).toBeGreaterThan(0)
  })

  it('names no retired mechanic — the climb and the mystery plate are gone', () => {
    for (const r of defaultPrizeRules()) {
      expect(['CLIMB', 'MYSTERY_PLATE']).not.toContain(r.mechanic)
    }
    // The V1 set is exactly the three shipping games.
    expect([...new Set(defaultPrizeRules().map((r) => r.mechanic))].sort()).toEqual([
      'BEAT_THE_KITCHEN',
      'MYSTERY_CUSTOMER',
      'SECRET_RECIPE',
    ])
  })

  it('gives every rule a label an operator could recognise as their own', () => {
    for (const r of defaultPrizeRules()) {
      expect(r.label.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('the games a venue is born with', () => {
  it('enables the three shipping games — a new venue is playable without configuring anything', () => {
    const games = defaultVenueGames()
    expect(games.map((g) => g.mechanic)).toEqual([
      'BEAT_THE_KITCHEN',
      'SECRET_RECIPE',
      'MYSTERY_CUSTOMER',
    ])
    expect(games.every((g) => g.enabled)).toBe(true)
  })

  it('gives every game a distinct display order', () => {
    const orders = defaultVenueGames().map((g) => g.displayOrder)
    expect(new Set(orders).size).toBe(orders.length)
  })

  // `/dash/games` lists MECHANICS and `setVenueGameEnabled` upserts the row, so
  // a mechanic missing from here would still be switchable — but it would be
  // born off, and a venue created after it shipped would not offer it until
  // someone noticed. The two lists have to stay in step.
  it('has a starting row for every mechanic the platform knows', () => {
    const defaults = defaultVenueGames().map((g) => g.mechanic)
    expect([...MECHANICS].sort()).toEqual([...defaults].sort())
  })
})
