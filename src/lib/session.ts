import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

/**
 * Guest sessions are anonymous. The cookie carries a session id and nothing
 * else — no name, no phone, no identity of any kind (PLATFORM.md §3).
 *
 * It is signed rather than encrypted: the id is not a secret, but a guest must
 * not be able to type in someone else's table's session id and claim their
 * prize.
 */

const COOKIE = 'gs'
const SEPARATOR = '.'

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('SESSION_SECRET is not set — see .env.example')
  return s
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('base64url')
}

/** Constant-time compare so a forged cookie cannot be brute-forced by timing. */
function signatureMatches(value: string, given: string): boolean {
  const expected = Buffer.from(sign(value))
  const actual = Buffer.from(given)
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}

export async function setGuestSessionCookie(sessionId: string): Promise<void> {
  const jar = await cookies()
  jar.set(COOKIE, `${sessionId}${SEPARATOR}${sign(sessionId)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // A service is one evening. Longer would mean a guest returning next week
    // silently resumes a dead session.
    maxAge: 60 * 60 * 8,
  })
}

export async function readGuestSessionId(): Promise<string | null> {
  const jar = await cookies()
  const raw = jar.get(COOKIE)?.value
  if (!raw) return null

  const idx = raw.lastIndexOf(SEPARATOR)
  if (idx <= 0) return null

  const id = raw.slice(0, idx)
  const sig = raw.slice(idx + 1)
  return signatureMatches(id, sig) ? id : null
}

export async function clearGuestSessionCookie(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE)
}
