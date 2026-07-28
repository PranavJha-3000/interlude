import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

/** Staff auth: a venue PIN, exchanged for an httpOnly session cookie. */

export { hashPin, verifyPin } from './pin'

const COOKIE = 'st'
const SEPARATOR = '.'

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('SESSION_SECRET is not set — see .env.example')
  return s
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('base64url')
}

export interface StaffSession {
  staffId: string
  venueId: string
  role: 'SERVER' | 'KITCHEN'
}

export async function setStaffSessionCookie(session: StaffSession): Promise<void> {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  const jar = await cookies()
  jar.set(COOKIE, `${payload}${SEPARATOR}${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // A shift, not a week. A tablet left on the pass should not stay signed in
    // until Tuesday.
    maxAge: 60 * 60 * 12,
  })
}

export async function readStaffSession(): Promise<StaffSession | null> {
  const jar = await cookies()
  const raw = jar.get(COOKIE)?.value
  if (!raw) return null

  const idx = raw.lastIndexOf(SEPARATOR)
  if (idx <= 0) return null

  const payload = raw.slice(0, idx)
  const given = Buffer.from(raw.slice(idx + 1))
  const expected = Buffer.from(sign(payload))
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()) as StaffSession
  } catch {
    return null
  }
}

export async function clearStaffSessionCookie(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE)
}
