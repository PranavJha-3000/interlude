import { describe, expect, it } from 'vitest'

import { phoneHmac } from '@/lib/phone-identity'

/**
 * The one-way function the whole DPDP position rests on.
 *
 * SECURITY.md §6 claims a cross-venue phone join is impossible **by
 * construction** rather than by policy. That claim is true only if the salt is
 * genuinely per-venue and genuinely mixed in — so the test that matters here is
 * not "does it hash" but "does the same number produce different hashes at two
 * venues".
 */

const NUMBER = '+919876543210'
const OTHER = '+919876543211'
const SALT_A = 'a'.repeat(64)
const SALT_B = 'b'.repeat(64)

describe('phoneHmac', () => {
  it('is stable for the same number and salt', () => {
    expect(phoneHmac(NUMBER, SALT_A)).toBe(phoneHmac(NUMBER, SALT_A))
  })

  it('gives two venues different hashes for the same number', () => {
    // The DPDP invariant. If this ever passes as equal, every venue's guest list
    // becomes joinable into a cross-venue identity graph — which is on the
    // never-build list, and which the per-venue salt exists to prevent.
    expect(phoneHmac(NUMBER, SALT_A)).not.toBe(phoneHmac(NUMBER, SALT_B))
  })

  it('gives different numbers different hashes at one venue', () => {
    expect(phoneHmac(NUMBER, SALT_A)).not.toBe(phoneHmac(OTHER, SALT_A))
  })

  it('does not contain the number it hashed', () => {
    const hash = phoneHmac(NUMBER, SALT_A)
    expect(hash).not.toContain('9876543210')
    expect(hash).not.toContain(NUMBER)
  })

  it('is a fixed-width hex digest, so it cannot leak length', () => {
    // A variable-length output would say something about the input.
    expect(phoneHmac(NUMBER, SALT_A)).toMatch(/^[0-9a-f]{64}$/)
    expect(phoneHmac('+911111111111', SALT_A)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refuses an empty salt rather than hashing without one', () => {
    // An unsalted hash of a ten-digit number is trivially reversible by brute
    // force — the whole keyspace is 10^10. Silently accepting a missing salt
    // would turn the store into plaintext with extra steps.
    expect(() => phoneHmac(NUMBER, '')).toThrow(/salt/i)
  })
})
