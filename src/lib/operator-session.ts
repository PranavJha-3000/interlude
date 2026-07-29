import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'

/**
 * Operator auth: an email magic link, exchanged for an httpOnly session cookie.
 *
 * Same signed-cookie shape as the staff session, and deliberately a *separate*
 * cookie rather than a role on the existing one. A tablet on the pass and an
 * owner's laptop are different devices with different lifetimes, and a staff
 * PIN must never be one enum value away from reading the P&L.
 */

const COOKIE = 'op'
const SEPARATOR = '.'

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('SESSION_SECRET is not set — see .env.example')
  return s
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('base64url')
}

export interface OperatorSession {
  operatorId: string
  /** Null until they have created their venue — signup precedes onboarding. */
  venueId: string | null
}

export async function setOperatorSessionCookie(session: OperatorSession): Promise<void> {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  const jar = await cookies()
  jar.set(COOKIE, `${payload}${SEPARATOR}${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // Longer than a staff shift — an owner checking last night's number on a
    // Sunday morning should not have to ask for another email.
    maxAge: 60 * 60 * 24 * 14,
  })
}

export async function readOperatorSession(): Promise<OperatorSession | null> {
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
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as unknown
    if (typeof parsed !== 'object' || parsed === null) return null
    const { operatorId, venueId } = parsed as Record<string, unknown>
    if (typeof operatorId !== 'string' || operatorId.length === 0) return null
    if (venueId !== null && typeof venueId !== 'string') return null
    return { operatorId, venueId }
  } catch {
    return null
  }
}

export async function clearOperatorSessionCookie(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE)
}

export interface Operator {
  operatorId: string
  email: string
  name: string | null
  venueId: string
}

/**
 * The venue-scoping helper. **Every operator query takes its `venueId` from
 * here** — never from a URL parameter, a form field or a header
 * (SECURITY.md §8).
 *
 * TypeScript cannot help with this: a `string` off the session and a `string`
 * off the URL are the same type, and getting it wrong leaks another
 * restaurant's P&L. So the venue id is only ever obtainable by calling this,
 * and the cookie's claim is re-read from the database rather than trusted —
 * an operator removed from a venue must lose access on their next request, not
 * whenever their fortnight-long cookie happens to expire.
 *
 * Returns null rather than redirecting, so callers choose between "sign in" and
 * "not found" — the difference matters, and `requireOperatorOr404` below is the
 * one to use when a route must not confirm that something exists.
 */
export async function getOperator(): Promise<Operator | null> {
  const session = await readOperatorSession()
  if (!session) return null

  const row = await db.operatorUser.findUnique({
    where: { id: session.operatorId },
    select: { id: true, email: true, name: true, venueId: true },
  })
  if (!row || !row.venueId) return null

  return { operatorId: row.id, email: row.email, name: row.name, venueId: row.venueId }
}

/**
 * As above, but 404s instead of returning null.
 *
 * 404 rather than 403 deliberately: 403 confirms the thing exists and merely
 * belongs to someone else, which is a small free leak we do not need to give
 * away (SECURITY.md §8).
 */
export async function requireOperator(): Promise<Operator> {
  const operator = await getOperator()
  if (!operator) notFound()
  return operator
}

/**
 * Guard for a route that takes a venue id in the path.
 *
 * Prefer routes that take no venue id at all — the session already knows. Where
 * one is unavoidable, this is the only sanctioned way to use it.
 */
export async function assertVenueScope(venueIdFromRequest: string): Promise<Operator> {
  const operator = await requireOperator()
  if (operator.venueId !== venueIdFromRequest) notFound()
  return operator
}

/**
 * The signed-in operator before they have a venue — the only state in which a
 * session legitimately has no venue scope. Used by onboarding, and by nothing
 * that reads venue data.
 */
export async function getOperatorWithoutVenue(): Promise<{
  operatorId: string
  email: string
  name: string | null
  venueId: string | null
} | null> {
  const session = await readOperatorSession()
  if (!session) return null

  const row = await db.operatorUser.findUnique({
    where: { id: session.operatorId },
    select: { id: true, email: true, name: true, venueId: true },
  })
  if (!row) return null

  return { operatorId: row.id, email: row.email, name: row.name, venueId: row.venueId }
}
