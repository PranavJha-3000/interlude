import 'server-only'

import { db } from '@/lib/db'
import { sendMagicLink } from '@/lib/email'
import { setOperatorSessionCookie } from '@/lib/operator-session'
import {
  MAGIC_LINK_MAX_PER_IP_PER_WINDOW,
  MAGIC_LINK_MAX_PER_WINDOW,
  MAGIC_LINK_RATE_WINDOW_MS,
  MAGIC_LINK_TTL_MS,
  checkToken,
  generateMagicToken,
  hashMagicToken,
  looksLikeEmail,
  normaliseEmail,
} from '@/lib/magic-link'

/** Issuing and consuming sign-in links. The database half of SECURITY.md §7. */

export type RequestLinkResult =
  { ok: true } | { ok: false; reason: 'INVALID_EMAIL' | 'RATE_LIMITED' }

/**
 * Send a sign-in link, creating the operator if this address is new.
 *
 * **The caller must respond identically whether or not the address is known.**
 * Signing up and signing in are the same request on purpose: a different
 * response for a known address is an account-enumeration oracle, and it would
 * tell anyone who asks which restaurants are customers.
 */
export async function requestMagicLink(
  rawEmail: string,
  baseUrl: string,
  nowMs: number,
  fromIp?: string
): Promise<RequestLinkResult> {
  const email = normaliseEmail(rawEmail)
  if (!looksLikeEmail(email)) return { ok: false, reason: 'INVALID_EMAIL' }

  const since = new Date(nowMs - MAGIC_LINK_RATE_WINDOW_MS)

  // Checked *before* the upsert, deliberately. A per-address limit is not a
  // limit when the attacker supplies the addresses — each one is its own empty
  // bucket. Refusing after creating the row would still leave the junk
  // `OperatorUser` behind, which is half the damage.
  if (fromIp) {
    const fromThisIp = await db.magicLinkToken.count({
      where: { requestedFromIp: fromIp, createdAt: { gte: since } },
    })
    if (fromThisIp >= MAGIC_LINK_MAX_PER_IP_PER_WINDOW) {
      return { ok: false, reason: 'RATE_LIMITED' }
    }
  }

  const operator = await db.operatorUser.upsert({
    where: { email },
    update: {},
    create: { email },
    select: { id: true, email: true },
  })

  const recent = await db.magicLinkToken.count({
    where: { operatorUserId: operator.id, createdAt: { gte: since } },
  })
  if (recent >= MAGIC_LINK_MAX_PER_WINDOW) return { ok: false, reason: 'RATE_LIMITED' }

  const token = generateMagicToken()
  await db.magicLinkToken.create({
    data: {
      operatorUserId: operator.id,
      tokenHash: hashMagicToken(token),
      expiresAt: new Date(nowMs + MAGIC_LINK_TTL_MS),
      requestedFromIp: fromIp ?? null,
    },
  })

  const url = `${baseUrl}/signin/verify?token=${encodeURIComponent(token)}`
  await sendMagicLink(operator.email, url, Math.round(MAGIC_LINK_TTL_MS / 60000))

  return { ok: true }
}

export type ConsumeResult =
  | { ok: true; operatorId: string; venueId: string | null }
  | { ok: false; reason: 'EXPIRED' | 'ALREADY_USED' | 'UNKNOWN' }

/**
 * Exchange a link for a session.
 *
 * The consume and the session issue happen together: `updateMany` with a
 * `consumedAt: null` filter means two simultaneous opens of the same link — a
 * mail client prefetching it, say — race at the database and exactly one wins.
 * Checking then updating would let both through.
 */
export async function consumeMagicLink(token: string, nowMs: number): Promise<ConsumeResult> {
  const tokenHash = hashMagicToken(token)

  const row = await db.magicLinkToken.findUnique({
    where: { tokenHash },
    select: { id: true, operatorUserId: true, expiresAt: true, consumedAt: true },
  })

  const verdict = checkToken(row, nowMs)
  if (!verdict.valid) return { ok: false, reason: verdict.reason }

  const claimed = await db.magicLinkToken.updateMany({
    where: { id: row!.id, consumedAt: null },
    data: { consumedAt: new Date(nowMs) },
  })
  if (claimed.count === 0) return { ok: false, reason: 'ALREADY_USED' }

  const operator = await db.operatorUser.update({
    where: { id: row!.operatorUserId },
    data: { lastLoginAt: new Date(nowMs) },
    select: { id: true, venueId: true },
  })

  await setOperatorSessionCookie({ operatorId: operator.id, venueId: operator.venueId })
  return { ok: true, operatorId: operator.id, venueId: operator.venueId }
}

/** Housekeeping: drop spent and expired rows. Safe to run any time. */
export async function purgeStaleMagicLinks(nowMs: number): Promise<number> {
  const result = await db.magicLinkToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date(nowMs) } },
        { consumedAt: { lt: new Date(nowMs - 24 * 60 * 60 * 1000) } },
      ],
    },
  })
  return result.count
}
