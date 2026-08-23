import 'server-only'

import { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { looksLikeEmail, normaliseEmail } from '@/lib/magic-link'
import { DUMMY_PASSWORD_HASH, checkPassword, hashPassword, verifyPassword } from '@/lib/password'

/**
 * Signing up and signing in with a password. The database half of
 * SECURITY.md §7a, and the sibling of `operator-auth.ts`, which does the same
 * job for magic links and is deliberately left untouched.
 *
 * Neither function here touches a cookie. Issuing the session is the caller's
 * job, exactly as it is for `requestMagicLink`/`consumeMagicLink` — which is
 * what lets both of these be tested without a request context.
 */

/**
 * How many password attempts one client IP may make inside the window.
 *
 * Higher than it looks because a venue behind one NAT is a real customer and an
 * owner who mistypes twice must not be locked out mid-service, and low enough
 * that guessing at a single address is hopeless — scrypt's ~100ms already means
 * an attacker cannot go fast, and this caps how long they may go slowly.
 *
 * The mirror of `MAGIC_LINK_MAX_PER_IP_PER_WINDOW`, and per-IP for the same
 * reason: a per-address limit is not a limit when the attacker supplies the
 * addresses. Unlike the magic-link limits there is deliberately **no per-address
 * lockout at all** — with no email channel there is no recovery path, so a
 * per-address lock would hand anyone who knows an owner's address the power to
 * lock them out of their own venue during service.
 */
export const PASSWORD_MAX_ATTEMPTS_PER_IP_PER_WINDOW = 20
export const PASSWORD_ATTEMPT_WINDOW_MS = 15 * 60 * 1000

export type SignUpResult =
  | { ok: true; operatorId: string }
  | { ok: false; reason: 'INVALID_EMAIL' | 'WEAK_PASSWORD' | 'EMAIL_TAKEN' | 'RATE_LIMITED' }

export type SignInResult =
  | { ok: true; operatorId: string; venueId: string | null }
  | { ok: false; reason: 'INVALID_CREDENTIALS' | 'RATE_LIMITED' }

/**
 * Records the attempt and reports whether this IP has run out.
 *
 * Called *before* the credential check and before any write, so a refusal
 * leaves no `OperatorUser` row behind — the same ordering, and the same
 * reasoning, as the pre-upsert check in `operator-auth.ts`.
 */
async function throttled(fromIp: string | undefined, nowMs: number): Promise<boolean> {
  if (!fromIp) return false

  const since = new Date(nowMs - PASSWORD_ATTEMPT_WINDOW_MS)
  const recent = await db.operatorLoginAttempt.count({
    where: { ip: fromIp, createdAt: { gte: since } },
  })
  if (recent >= PASSWORD_MAX_ATTEMPTS_PER_IP_PER_WINDOW) return true

  await db.operatorLoginAttempt.create({ data: { ip: fromIp } })
  return false
}

/**
 * Create an operator with a password.
 *
 * **This one enumerates, and cannot avoid it.** `EMAIL_TAKEN` tells the caller
 * that an address already belongs to someone, which SECURITY.md §7 refuses to
 * do for magic links — but there is no way to let a person recover from typing
 * an address they already registered without saying so. Sign-in below does not
 * make the same concession, and this whole trade reverts when a verified
 * sending domain brings the magic link back to the front door (SECURITY.md §7a).
 */
export async function signUpWithPassword(
  rawEmail: string,
  password: string,
  nowMs: number,
  fromIp?: string
): Promise<SignUpResult> {
  const email = normaliseEmail(rawEmail)
  if (!looksLikeEmail(email)) return { ok: false, reason: 'INVALID_EMAIL' }
  if (!checkPassword(password).ok) return { ok: false, reason: 'WEAK_PASSWORD' }

  if (await throttled(fromIp, nowMs)) return { ok: false, reason: 'RATE_LIMITED' }

  try {
    const operator = await db.operatorUser.create({
      data: { email, passwordHash: hashPassword(password) },
      select: { id: true },
    })
    return { ok: true, operatorId: operator.id }
  } catch (error) {
    // The unique index is the arbiter, not a `findUnique` beforehand: two
    // simultaneous signups with the same address would both pass a pre-check
    // and one would crash on the insert anyway.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, reason: 'EMAIL_TAKEN' }
    }
    throw error
  }
}

/**
 * Exchange an email and password for the right to a session.
 *
 * One reason for every failure. An unknown address, an operator who only ever
 * had a magic link, and a wrong password are indistinguishable from outside —
 * in the message *and* in the time taken, which is what `DUMMY_PASSWORD_HASH`
 * is for. Returning early on a missing row would skip the ~100ms scrypt and
 * turn the enumeration oracle back on as a stopwatch.
 */
export async function signInWithPassword(
  rawEmail: string,
  password: string,
  nowMs: number,
  fromIp?: string
): Promise<SignInResult> {
  const email = normaliseEmail(rawEmail)

  if (await throttled(fromIp, nowMs)) return { ok: false, reason: 'RATE_LIMITED' }

  const operator = looksLikeEmail(email)
    ? await db.operatorUser.findUnique({
        where: { email },
        select: { id: true, venueId: true, passwordHash: true },
      })
    : null

  // A null hash is an operator who has only ever used a magic link. It means
  // "cannot sign in this way", never "any password will do" — and it costs the
  // same scrypt call as a real mismatch.
  const stored = operator?.passwordHash ?? DUMMY_PASSWORD_HASH
  const matches = verifyPassword(password, stored)

  if (!operator || !operator.passwordHash || !matches) {
    return { ok: false, reason: 'INVALID_CREDENTIALS' }
  }

  await db.operatorUser.update({
    where: { id: operator.id },
    data: { lastLoginAt: new Date(nowMs) },
  })

  return { ok: true, operatorId: operator.id, venueId: operator.venueId }
}
