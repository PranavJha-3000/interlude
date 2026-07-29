import { describe, expect, it } from 'vitest'
import {
  MAGIC_LINK_TTL_MS,
  checkToken,
  generateMagicToken,
  hashMagicToken,
  looksLikeEmail,
  normaliseEmail,
  tokenHashMatches,
} from './magic-link'

/**
 * A sign-in link is a bearer credential travelling through email. These are the
 * properties SECURITY.md §7 promises about it, not style tests.
 */

const NOW = Date.UTC(2026, 6, 29, 12, 0, 0)

describe('the token itself', () => {
  it('is long and never repeats', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) {
      const t = generateMagicToken()
      expect(t.length).toBeGreaterThanOrEqual(40)
      expect(seen.has(t)).toBe(false)
      seen.add(t)
    }
  })

  it('is stored only as a hash, and the hash does not contain the token', () => {
    const token = generateMagicToken()
    const hash = hashMagicToken(token)
    expect(hash).toHaveLength(64)
    expect(hash).not.toContain(token)
    expect(hash).not.toBe(token)
  })

  it('hashes deterministically, so the lookup by hash can work at all', () => {
    const token = generateMagicToken()
    expect(hashMagicToken(token)).toBe(hashMagicToken(token))
  })

  it('gives a different hash for a token differing by one character', () => {
    const a = 'a'.repeat(43)
    const b = `${'a'.repeat(42)}b`
    expect(hashMagicToken(a)).not.toBe(hashMagicToken(b))
  })

  it('compares hashes without leaking length mismatches as a match', () => {
    const h = hashMagicToken('x')
    expect(tokenHashMatches(h, h)).toBe(true)
    expect(tokenHashMatches(h, h.slice(0, -1))).toBe(false)
    expect(tokenHashMatches(h, hashMagicToken('y'))).toBe(false)
  })
})

describe('a link works once, and not forever', () => {
  it('accepts a fresh, unconsumed token', () => {
    const row = { expiresAt: new Date(NOW + MAGIC_LINK_TTL_MS), consumedAt: null }
    expect(checkToken(row, NOW)).toEqual({ valid: true })
  })

  it('refuses a token that has already been used', () => {
    const row = { expiresAt: new Date(NOW + MAGIC_LINK_TTL_MS), consumedAt: new Date(NOW - 1000) }
    expect(checkToken(row, NOW)).toEqual({ valid: false, reason: 'ALREADY_USED' })
  })

  it('refuses an expired token', () => {
    const row = { expiresAt: new Date(NOW - 1), consumedAt: null }
    expect(checkToken(row, NOW)).toEqual({ valid: false, reason: 'EXPIRED' })
  })

  it('refuses a token at the exact moment it expires', () => {
    const row = { expiresAt: new Date(NOW), consumedAt: null }
    expect(checkToken(row, NOW)).toEqual({ valid: false, reason: 'EXPIRED' })
  })

  it('refuses a token that does not exist', () => {
    expect(checkToken(null, NOW)).toEqual({ valid: false, reason: 'UNKNOWN' })
  })

  it('reports a used-and-expired token as used, which is the more useful truth', () => {
    const row = { expiresAt: new Date(NOW - 1), consumedAt: new Date(NOW - 2) }
    expect(checkToken(row, NOW)).toEqual({ valid: false, reason: 'ALREADY_USED' })
  })

  it('expires in minutes rather than days', () => {
    expect(MAGIC_LINK_TTL_MS).toBeLessThanOrEqual(60 * 60 * 1000)
  })
})

describe('addresses', () => {
  it('matches case-insensitively, because email is', () => {
    expect(normaliseEmail('  Owner@Example.COM ')).toBe('owner@example.com')
  })

  it('accepts an ordinary address and rejects obvious nonsense', () => {
    expect(looksLikeEmail('owner@venue.co.in')).toBe(true)
    expect(looksLikeEmail('owner')).toBe(false)
    expect(looksLikeEmail('owner@venue')).toBe(false)
    expect(looksLikeEmail('a b@venue.com')).toBe(false)
    expect(looksLikeEmail('')).toBe(false)
    expect(looksLikeEmail(`${'a'.repeat(250)}@venue.com`)).toBe(false)
  })
})
