import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The operator session cookie's wire format, kept free of `server-only` and of
 * `next/headers` so the signing and the expiry are unit-testable without a
 * request.
 *
 * The signed payload carries its own issued-at. A cookie `maxAge` is a request
 * to the *browser* and nothing more: a captured cookie replayed by curl has no
 * browser to obey it. Without `iat` in the signed bytes, the credential is
 * permanent — `signOut` only deletes the client's copy, so there is nothing
 * server-side that would ever stop honouring it (SECURITY.md §7).
 */

/** Longer than a staff shift — an owner checking Saturday's number on Sunday. */
export const OPERATOR_SESSION_TTL_MS = 60 * 60 * 24 * 14 * 1000

/**
 * The pending role selection: email and password are verified, the code is not
 * typed yet. Ten minutes — long enough to walk from the office laptop to the
 * floor tablet is not the same device anyway, short enough that a captured
 * pending cookie is worthless by the time anyone could use it. The real
 * session cookie is only ever issued *after* the code step succeeds.
 */
export const PENDING_ROLE_TTL_MS = 10 * 60 * 1000

const SEPARATOR = '.'

export interface OperatorSession {
  operatorId: string
  /** Null until they have created their venue — signup precedes onboarding. */
  venueId: string | null
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

export function encodeOperatorSession(
  session: OperatorSession,
  secret: string,
  nowMs: number
): string {
  const body = { operatorId: session.operatorId, venueId: session.venueId, iat: nowMs }
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url')
  return `${payload}${SEPARATOR}${sign(payload, secret)}`
}

/**
 * Verify, then read. Returns null for anything that is not a currently-valid
 * session: bad signature, malformed payload, missing issued-at, or expired.
 *
 * A cookie issued before this field existed has no `iat` and is refused rather
 * than grandfathered — the whole point is that an unbounded session cannot
 * exist, and one re-sign-in is a cheaper price than an exception.
 */
export function decodeOperatorSession(
  raw: string,
  secret: string,
  nowMs: number
): OperatorSession | null {
  return parseSession(raw, secret, nowMs, OPERATOR_SESSION_TTL_MS)
}

/**
 * The pending half of the two-step login: the same wire format as the session
 * cookie, but a ten-minute ceiling instead of a fortnight. Encoding is shared
 * with the session — the payload is identical; only the enforced lifetime and
 * the cookie it travels in differ.
 */
export function encodePendingRoleSession(
  session: OperatorSession,
  secret: string,
  nowMs: number
): string {
  return encodeOperatorSession(session, secret, nowMs)
}

export function decodePendingRoleSession(
  raw: string,
  secret: string,
  nowMs: number
): OperatorSession | null {
  return parseSession(raw, secret, nowMs, PENDING_ROLE_TTL_MS)
}

function parseSession(
  raw: string,
  secret: string,
  nowMs: number,
  ttlMs: number
): OperatorSession | null {
  const idx = raw.lastIndexOf(SEPARATOR)
  if (idx <= 0) return null

  const payload = raw.slice(0, idx)
  const given = Buffer.from(raw.slice(idx + 1))
  const expected = Buffer.from(sign(payload, secret))
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as unknown
    if (typeof parsed !== 'object' || parsed === null) return null
    const { operatorId, venueId, iat } = parsed as Record<string, unknown>
    if (typeof operatorId !== 'string' || operatorId.length === 0) return null
    if (venueId !== null && typeof venueId !== 'string') return null
    if (typeof iat !== 'number' || !Number.isFinite(iat)) return null
    if (nowMs - iat >= ttlMs) return null
    return { operatorId, venueId }
  } catch {
    return null
  }
}
