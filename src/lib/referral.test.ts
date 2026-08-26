import { describe, expect, it } from 'vitest'

import {
  fillTimingLooksHuman,
  issueReferralFormToken,
  normalisePhone,
  parseReferral,
  referralRateAllows,
  referralSubmitterKey,
  verifyReferralFormToken,
  REFERRAL_FORM_TOKEN_TTL_MS,
  REFERRAL_RATE_LIMIT_MAX,
} from './referral'

const SECRET = 'unit-test-secret'

const goodInput = {
  restaurantName: '  Dilli Junction  ',
  location: 'New Delhi',
  pocName: 'Kabir Sharma',
  pocPhone: '+91 98765 43210',
  pocRoleTitle: 'Owner',
  referrerName: 'Meera Iyer',
  referrerContact: 'meera@coastaltable.in',
}

describe('normalisePhone', () => {
  it('accepts the formats a person actually types and canonicalises them', () => {
    expect(normalisePhone('+91 98765 43210')).toBe('+919876543210')
    expect(normalisePhone('98765-43210')).toBe('9876543210')
    expect(normalisePhone('(98765) 43210')).toBe('9876543210')
    expect(normalisePhone('+14155552671')).toBe('+14155552671')
  })

  it('refuses everything outreach cannot dial', () => {
    expect(normalisePhone('12345')).toBe(null) // too few digits
    expect(normalisePhone('9'.repeat(16))).toBe(null) // too many
    expect(normalisePhone('call the manager tomorrow')).toBe(null)
    expect(normalisePhone('')).toBe(null)
  })
})

describe('parseReferral', () => {
  it('trims every field and passes a good submission through', () => {
    const result = parseReferral(goodInput)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.restaurantName).toBe('Dilli Junction')
      expect(result.value.pocPhone).toBe('+919876543210')
    }
  })

  it.each([
    ['RESTAURANT_NAME', { ...goodInput, restaurantName: 'X' }],
    ['LOCATION', { ...goodInput, location: '' }],
    ['POC_NAME', { ...goodInput, pocName: 'K' }],
    ['POC_ROLE_TITLE', { ...goodInput, pocRoleTitle: '' }],
    ['REFERRER_NAME', { ...goodInput, referrerName: 'M' }],
  ] as const)('names the offending field: %s', (expectedCode, bad) => {
    const result = parseReferral(bad)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe(expectedCode)
  })

  it('refuses an unparseable POC phone as POC_PHONE', () => {
    const result = parseReferral({ ...goodInput, pocPhone: 'not-a-number' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('POC_PHONE')
  })

  it('lets the referrer be reached by phone as well as email', () => {
    const byPhone = parseReferral({ ...goodInput, referrerContact: '+91 91234 56789' })
    expect(byPhone.ok).toBe(true)

    const garbage = parseReferral({ ...goodInput, referrerContact: 'find me somewhere' })
    expect(garbage.ok).toBe(false)
    if (!garbage.ok) expect(garbage.code).toBe('REFERRER_CONTACT')
  })
})

describe('form tokens', () => {
  it('round-trips a token it issued', () => {
    const now = Date.now()
    expect(verifyReferralFormToken(SECRET, issueReferralFormToken(SECRET, now))).toEqual({
      valid: true,
      issuedAtMs: now,
    })
  })

  it('rejects tampering and nonsense', () => {
    const token = issueReferralFormToken(SECRET, Date.now())
    const [atMs, sig] = token.split('.')
    if (atMs === undefined || sig === undefined) throw new Error('unreachable')
    expect(
      verifyReferralFormToken(SECRET, `${atMs}.${sig.slice(0, -1)}A`),
    ).toEqual({ valid: false, reason: 'TAMPERED' })
    expect(verifyReferralFormToken(SECRET, 'not-a-token')).toEqual({
      valid: false,
      reason: 'MALFORMED',
    })
    expect(verifyReferralFormToken(SECRET, 'abc.def')).toEqual({
      valid: false,
      reason: 'MALFORMED',
    })
  })

  it('fails closed when the secret is absent', () => {
    expect(() => issueReferralFormToken('', Date.now())).toThrow('REFERRAL_SECRET_MISSING')
  })

  it('insists a human took their time, and that the form is not ancient', () => {
    const issued = Date.now()
    expect(fillTimingLooksHuman(issued, issued)).toBe(false) // instant POST: bot
    expect(fillTimingLooksHuman(issued, issued + 60_000)).toBe(true)
    expect(fillTimingLooksHuman(issued, issued + REFERRAL_FORM_TOKEN_TTL_MS + 1000)).toBe(false)
  })
})

describe('rate limiting', () => {
  it('buckets by hashed IP and hides the address behind the hash', () => {
    const key = referralSubmitterKey(SECRET, '203.0.113.7')
    expect(key).toBe(referralSubmitterKey(SECRET, '203.0.113.7'))
    expect(key).not.toContain('203.0.113.7')
    expect(key).toHaveLength(32)
    expect(referralSubmitterKey(SECRET, '203.0.113.8')).not.toBe(key)
    expect(referralSubmitterKey(SECRET, undefined)).toBe(referralSubmitterKey(SECRET, undefined))
  })

  it(`allows up to ${REFERRAL_RATE_LIMIT_MAX} per window and refuses the next`, () => {
    for (let n = 0; n < REFERRAL_RATE_LIMIT_MAX; n++) {
      expect(referralRateAllows(n)).toBe(true)
    }
    expect(referralRateAllows(REFERRAL_RATE_LIMIT_MAX)).toBe(false)
  })
})