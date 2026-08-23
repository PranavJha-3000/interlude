import { describe, expect, it } from 'vitest'

import {
  DUMMY_PASSWORD_HASH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  checkPassword,
  hashPassword,
  verifyPassword,
} from '@/lib/password'

describe('checkPassword', () => {
  it('refuses one character under the minimum and accepts the minimum', () => {
    expect(checkPassword('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toEqual({
      ok: false,
      reason: 'TOO_SHORT',
    })
    expect(checkPassword('a'.repeat(PASSWORD_MIN_LENGTH))).toEqual({ ok: true })
  })

  it('refuses one character over the maximum, so a megabyte cannot be handed to scrypt', () => {
    expect(checkPassword('a'.repeat(PASSWORD_MAX_LENGTH))).toEqual({ ok: true })
    expect(checkPassword('a'.repeat(PASSWORD_MAX_LENGTH + 1))).toEqual({
      ok: false,
      reason: 'TOO_LONG',
    })
  })

  it('asks nothing of composition — a long passphrase is a good password', () => {
    expect(checkPassword('correct horse battery staple')).toEqual({ ok: true })
  })
})

describe('hashPassword / verifyPassword', () => {
  it('round-trips the password it was given', () => {
    const stored = hashPassword('a-real-password')
    expect(verifyPassword('a-real-password', stored)).toBe(true)
  })

  it('refuses the wrong password', () => {
    const stored = hashPassword('a-real-password')
    expect(verifyPassword('a-real-passworD', stored)).toBe(false)
    expect(verifyPassword('', stored)).toBe(false)
  })

  it('salts, so the same password twice gives two different stored values', () => {
    const a = hashPassword('a-real-password')
    const b = hashPassword('a-real-password')
    expect(a).not.toBe(b)
    expect(verifyPassword('a-real-password', a)).toBe(true)
    expect(verifyPassword('a-real-password', b)).toBe(true)
  })

  it('stores scrypt:<salt>:<hash> and never the password itself', () => {
    const stored = hashPassword('a-real-password')
    const [scheme, salt, hash] = stored.split(':')
    expect(scheme).toBe('scrypt')
    expect(salt).toMatch(/^[0-9a-f]{32}$/)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(stored).not.toContain('a-real-password')
  })

  it('refuses a malformed or tampered stored value rather than throwing', () => {
    expect(verifyPassword('x', '')).toBe(false)
    expect(verifyPassword('x', 'not-a-hash')).toBe(false)
    expect(verifyPassword('x', 'scrypt:only-a-salt')).toBe(false)
    // An unknown scheme must fail closed — a future migration to another KDF
    // must not silently authenticate everyone in the meantime.
    expect(verifyPassword('x', 'argon2:salt:hash')).toBe(false)
    expect(verifyPassword('x', 'scrypt::')).toBe(false)
  })
})

describe('DUMMY_PASSWORD_HASH', () => {
  it('is a usable stored hash, so the unknown-address branch really runs scrypt', () => {
    // If this were malformed, verifyPassword would return false at the split
    // and skip the hash entirely — which is exactly the timing leak it exists
    // to close.
    const [scheme, salt, hash] = DUMMY_PASSWORD_HASH.split(':')
    expect(scheme).toBe('scrypt')
    expect(salt).toMatch(/^[0-9a-f]{32}$/)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('authenticates nothing a caller would plausibly try', () => {
    expect(verifyPassword('', DUMMY_PASSWORD_HASH)).toBe(false)
    expect(verifyPassword('password', DUMMY_PASSWORD_HASH)).toBe(false)
  })
})
