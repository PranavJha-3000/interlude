/**
 * Indian mobile numbers, normalised to one canonical form.
 *
 * This is the function that decides whether one guest is one guest. The
 * loyalty programme's only identifier is a phone number, stored as a one-way
 * HMAC with the venue's own salt (SECURITY.md §6) — so if the same person's
 * number normalises two different ways on two nights they become two
 * identities, with two stamp counts, and **nothing downstream can detect or
 * repair it**. The hash cannot be reversed, so there is no migration that fixes
 * a bad normalisation afterwards.
 *
 * Pure, and deliberately in `core/mechanics` so `PURE_CORE` lint bans a clock,
 * randomness, the database and the framework from it.
 *
 * **It is named for what it does.** Generalising to other countries later would
 * mean re-normalising every stored hash, which is impossible — so the refusal
 * is explicit rather than a silent truncation. See TODO.md *Later*.
 */

export type PhoneRefusal = 'wrong_length' | 'not_a_mobile' | 'not_numeric' | 'not_indian'

export type PhoneResult = { ok: true; e164: string } | { ok: false; reason: PhoneRefusal }

/** India's country code, and the only one this accepts. */
const IN = '91'

/** TRAI allocates mobile numbers starting 6, 7, 8 or 9. Everything else is a
 *  landline or a service code, which cannot receive a stamp. */
const MOBILE_FIRST_DIGIT = /^[6-9]/

const SUBSCRIBER_DIGITS = 10

/** Punctuation a human or a paste can introduce. Not stripped from digits. */
const SEPARATORS = /[\s\-().]/g

export function normaliseIndianPhone(raw: string): PhoneResult {
  // Separators come off first, then the `+`. The other order fails on
  // "(+91) 98765-43210" — a real way to write it — because the bracket keeps
  // the plus from being leading until the brackets are gone.
  const stripped = raw.trim().replace(SEPARATORS, '')
  const hadPlus = stripped.startsWith('+')
  const cleaned = hadPlus ? stripped.slice(1) : stripped

  if (cleaned === '') return { ok: false, reason: 'wrong_length' }
  // Any remaining `+` is mid-number, which is not a phone number.
  if (!/^\d+$/.test(cleaned)) return { ok: false, reason: 'not_numeric' }

  const national = stripPrefix(cleaned, hadPlus)
  if (national === null) return { ok: false, reason: 'not_indian' }

  if (national.length !== SUBSCRIBER_DIGITS) return { ok: false, reason: 'wrong_length' }
  if (!MOBILE_FIRST_DIGIT.test(national)) return { ok: false, reason: 'not_a_mobile' }

  return { ok: true, e164: `+${IN}${national}` }
}

/**
 * Reduce whatever was typed to the ten-digit subscriber number.
 *
 * Returns `null` for a number that announces a country and it is not India.
 * Truncating one of those to its last ten digits would mint a plausible Indian
 * identity for a foreign number — silent, and wrong, which is the one failure
 * mode this module exists to prevent.
 */
function stripPrefix(digits: string, hadPlus: boolean): string | null {
  // 0091… — the international access code.
  if (digits.startsWith('00')) {
    const rest = digits.slice(2)
    return rest.startsWith(IN) ? rest.slice(IN.length) : null
  }

  // An explicit `+` means the digits that follow are a country code. If it is
  // not ours, say so rather than guessing.
  if (hadPlus) {
    return digits.startsWith(IN) ? digits.slice(IN.length) : null
  }

  // 91… with no plus, but only when the length says it is a country code
  // rather than a subscriber number that happens to begin 91. A ten-digit
  // number starting 91 is a valid mobile and must not lose its first two
  // digits.
  if (digits.startsWith(IN) && digits.length === IN.length + SUBSCRIBER_DIGITS) {
    return digits.slice(IN.length)
  }

  // 0… — the trunk prefix people still dial out of habit.
  if (digits.startsWith('0')) return digits.slice(1)

  return digits
}
