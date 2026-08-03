import { describe, expect, it } from 'vitest'

import { normaliseIndianPhone } from './phone'

/**
 * The function that decides whether one guest is one guest.
 *
 * A phone number is the loyalty programme's only identifier, and it is stored
 * as a one-way HMAC — so if the same person's number normalises two different
 * ways on two nights, they become two identities with two separate stamp
 * counts, and nothing downstream can ever detect it or repair it. The hash is
 * not reversible; there is no migration that fixes a bad normalisation after
 * the fact.
 *
 * That is why this is a pure function under `PURE_CORE` lint with its own test
 * file, rather than a regex inside a server action.
 */

function e164Of(raw: string): string {
  const result = normaliseIndianPhone(raw)
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
  return result.e164
}

function reasonOf(raw: string): string {
  const result = normaliseIndianPhone(raw)
  if (result.ok) throw new Error(`expected a refusal, got ${result.e164}`)
  return result.reason
}

const CANONICAL = '+919876543210'

describe('normaliseIndianPhone', () => {
  it.each([
    ['9876543210', 'bare ten digits, what most people type'],
    ['+919876543210', 'already canonical'],
    ['+91 98765 43210', 'the way it is printed on a card'],
    ['098765 43210', 'the leading zero people still dial'],
    ['91-9876543210', 'country code, no plus'],
    ['0091 9876543210', 'the international prefix'],
    ['(+91) 98765-43210', 'brackets and a dash'],
    ['  9876543210  ', 'whitespace from a paste'],
    ['+91.98765.43210', 'dots'],
  ])('normalises %s (%s) to the canonical form', (input) => {
    // The whole point: every one of these is the same person, so every one of
    // these must produce the same HMAC input.
    expect(e164Of(input)).toBe(CANONICAL)
  })

  it('is idempotent, so re-normalising a stored value is safe', () => {
    expect(e164Of(e164Of('98765 43210'))).toBe(CANONICAL)
  })

  it('refuses a number too short to be a mobile', () => {
    expect(reasonOf('98765')).toBe('wrong_length')
    expect(reasonOf('')).toBe('wrong_length')
    expect(reasonOf('   ')).toBe('wrong_length')
  })

  it('refuses a number too long to be a mobile', () => {
    expect(reasonOf('98765432100')).toBe('wrong_length')
  })

  it('refuses an Indian landline or service number', () => {
    // Indian mobile numbers start 6-9. A 2 or a 1 is a landline or a service
    // code, and a stamp card cannot text or recognise one.
    expect(reasonOf('1234567890')).toBe('not_a_mobile')
    expect(reasonOf('2234567890')).toBe('not_a_mobile')
    expect(reasonOf('5234567890')).toBe('not_a_mobile')
  })

  it('accepts every valid Indian mobile prefix', () => {
    for (const first of ['6', '7', '8', '9']) {
      const number = `${first}876543210`
      expect(normaliseIndianPhone(number).ok, `${first} should be a valid prefix`).toBe(true)
    }
  })

  it('refuses anything that is not a number', () => {
    expect(reasonOf('abcdefghij')).toBe('not_numeric')
    expect(reasonOf('98765abcde')).toBe('not_numeric')
  })

  it('refuses a non-Indian country code rather than silently truncating it', () => {
    // +1 555 867 5309 has ten digits after the code. Stripping "+1" and keeping
    // the rest would mint a plausible-looking Indian identity for an American
    // number, which is the worst available failure: silent and wrong.
    expect(reasonOf('+15558675309')).toBe('not_indian')
    expect(reasonOf('+44 20 7946 0958')).toBe('not_indian')
  })
})
