import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Operator password hashing.
 *
 * Deliberately free of `server-only`, for the same reason `pin.ts` is: the seed
 * script has to hash the pilot owner's password, and this module reads no
 * environment and holds no secret of its own — the salt travels with the hash.
 *
 * scrypt via `node:crypto` rather than bcrypt or argon2, because it is already
 * this codebase's KDF (`pin.ts`) and adds no dependency — and a native-binary
 * dependency would be one more thing fighting a OneDrive-synced `node_modules`.
 *
 * A password is a stronger credential than a staff PIN and a weaker one than a
 * magic-link token: unlike the PIN it is typed in private on the owner's own
 * laptop, and unlike the token it is chosen by a human, so it has far less than
 * 256 bits of entropy and the slow hash is doing real work here.
 *
 * **This exists because there is no email channel yet** (SECURITY.md §7a). It is
 * the second door, not the replacement one — magic link is untouched.
 */

const KEY_LENGTH = 32

/**
 * Length is the only rule (NIST 800-63B).
 *
 * Composition rules — a digit, a symbol, a capital — measurably push people
 * towards `Password1!` and towards reuse, so they buy nothing here. The maximum
 * exists only so a megabyte of input cannot be turned into a slow hash on
 * demand; it is a denial-of-service brake, not a password opinion.
 */
export const PASSWORD_MIN_LENGTH = 10
export const PASSWORD_MAX_LENGTH = 200

export type PasswordVerdict = { ok: true } | { ok: false; reason: 'TOO_SHORT' | 'TOO_LONG' }

/** Pure, so the rule is testable without touching a hash or a database. */
export function checkPassword(raw: string): PasswordVerdict {
  if (raw.length < PASSWORD_MIN_LENGTH) return { ok: false, reason: 'TOO_SHORT' }
  if (raw.length > PASSWORD_MAX_LENGTH) return { ok: false, reason: 'TOO_LONG' }
  return { ok: true }
}

/** Returns `scrypt:<salt>:<hash>` — the same shape `pin.ts` stores. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, expected] = stored.split(':')
  if (scheme !== 'scrypt' || !salt || !expected) return false

  const actual = scryptSync(password, salt, KEY_LENGTH).toString('hex')
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * A real hash of a fixed string, to be verified against and thrown away.
 *
 * Sign-in must take the same time whether the address is unknown, has no
 * password set, or has the wrong one. Returning early on a missing row would
 * skip the ~100ms scrypt and make "no such operator" measurable from outside —
 * which is the account-enumeration oracle SECURITY.md §7 refuses, arriving by
 * the back door as a timing difference instead of a different message.
 *
 * Computed once at module load. The value it hashes is worthless: nothing
 * authenticates against it, because the caller discards the result.
 */
export const DUMMY_PASSWORD_HASH = hashPassword('dummy-password-for-constant-time-signin')
