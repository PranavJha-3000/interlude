import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Staff PIN hashing. Deliberately free of `server-only` so the seed script can
 * use it too — it reads no environment and holds no secret of its own; the
 * salt travels with the hash.
 *
 * A PIN is weak by design: it is typed one-handed on a shared tablet, mid
 * service, by someone carrying plates. The mitigation is scope rather than
 * strength — a staff session can fire orders, acknowledge add-ons and confirm
 * redemptions, and can read no metrics, change no config, and see nothing
 * belonging to another venue.
 */

const KEY_LENGTH = 32

/** Returns `scrypt:<salt>:<hash>`. */
export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(pin, salt, KEY_LENGTH).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function verifyPin(pin: string, stored: string): boolean {
  const [scheme, salt, expected] = stored.split(':')
  if (scheme !== 'scrypt' || !salt || !expected) return false

  const actual = scryptSync(pin, salt, KEY_LENGTH).toString('hex')
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
