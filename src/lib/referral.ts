import { createHmac, timingSafeEqual } from 'node:crypto'

import { z } from 'zod'

import { looksLikeEmail } from '@/lib/magic-link'

/**
 * Referral intake mechanics — everything about accepting a "Refer a
 * Restaurant" submission except the database write itself. Kept free of
 * `server-only` and of the DB for the same reason magic-link.ts is: the rules
 * are testable directly, and the action that calls them stays a thin shell.
 *
 * Three defences, layered so a single miss is not an opening:
 *
 *  - **Honeypot** — an invisible field humans never fill. Enforced by the
 *    caller (see app/refer/actions.ts).
 *  - **Time trap** — the form carries an HMAC-signed issue time; a POST that
 *    arrives faster than a human reads the page is a bot, and a token too old
 *    is a replay. Signed, because a plain timestamp is settable by the client.
 *  - **Rate limit** — submissions are bucketed by HMAC(IP), because bots do
 *    not rotate honeypot defeats one IP at a time.
 *
 * All three answer silently: the caller redirects a suspected bot to the
 * success screen without writing a row, because telling a bot it was caught
 * only tells it which defence beat it.
 */

/** Humans cannot read seven labelled fields in less than this. */
export const REFERRAL_MIN_FILL_MS = 3_000

/** A signed form token dies after this long — long enough for a slow reader, short enough to expire replays. */
export const REFERRAL_FORM_TOKEN_TTL_MS = 12 * 60 * 60 * 1000

/** Per-network caps, mirroring MAGIC_LINK_MAX_PER_IP_PER_WINDOW's logic. */
export const REFERRAL_RATE_LIMIT_MAX = 5
export const REFERRAL_RATE_WINDOW_MS = 60 * 60 * 1000

/**
 * Strip a human-typed phone number down to digits.
 *
 * Returns the canonical form (optional leading `+`, digits only) or null.
 * 10–15 digits is the E.164 envelope; anything outside it — lettered vanity
 * numbers, extensions, halves of two numbers pasted together — is refused,
 * because outreach dials this by hand and a wrong number costs a lead.
 */
export function normalisePhone(raw: string): string | null {
  const trimmed = raw.trim()
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) return null
  return `${hasPlus ? '+' : ''}${digits}`
}

type ReferralInput = {
  restaurantName: string
  location: string
  pocName: string
  pocPhone: string
  pocRoleTitle: string
  referrerName: string
  referrerContact: string
}

const baseSchema = z.object({
  restaurantName: z.string().trim().min(2).max(120),
  location: z.string().trim().min(2).max(160),
  pocName: z.string().trim().min(2).max(80),
  pocPhone: z
    .string()
    .transform(normalisePhone)
    .refine((v) => v !== null),
  pocRoleTitle: z.string().trim().min(2).max(80),
  referrerName: z.string().trim().min(2).max(80),
  referrerContact: z.string().trim(),
})

/**
 * Which field a failure came from, as a stable code the strings file can
 * answer and the URL can carry. Only ever one at a time — the visitor fixes
 * the first problem they hit, not eight at once.
 */
export type ReferralErrorCode =
  | 'RESTAURANT_NAME'
  | 'LOCATION'
  | 'POC_NAME'
  | 'POC_PHONE'
  | 'POC_ROLE_TITLE'
  | 'REFERRER_NAME'
  | 'REFERRER_CONTACT'

export type ReferralParseResult =
  { ok: true; value: ReferralInput } | { ok: false; code: ReferralErrorCode }

const fieldCodes: Record<string, ReferralErrorCode> = {
  restaurantName: 'RESTAURANT_NAME',
  location: 'LOCATION',
  pocName: 'POC_NAME',
  pocPhone: 'POC_PHONE',
  pocRoleTitle: 'POC_ROLE_TITLE',
  referrerName: 'REFERRER_NAME',
  referrerContact: 'REFERRER_CONTACT',
}

/**
 * Validate one referral submission. `referrerContact` accepts either a phone
 * number or an email — the referrer picks whichever they actually watch;
 * the POC's channel is always a phone number, by owner decision.
 */
export function parseReferral(input: ReferralInput): ReferralParseResult {
  const parsed = baseSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = String(issue?.path[0] ?? '')
    return { ok: false, code: fieldCodes[path] ?? 'RESTAURANT_NAME' }
  }

  // zod proved the shape; these re-checks pick the precise reason. A
  // referrerContact that is neither dialable nor mailable gets its own
  // refusal rather than a generic one.
  if (!looksLikeEmail(parsed.data.referrerContact)) {
    const phone = normalisePhone(parsed.data.referrerContact)
    if (!phone) return { ok: false, code: 'REFERRER_CONTACT' }
    parsed.data.referrerContact = phone
  }

  return { ok: true, value: parsed.data as ReferralInput }
}

/* ── Form tokens: the signed issue-time stamp ─────────────────────────────── */

function signature(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url').slice(0, 24)
}

/** Issued once while rendering the form; travels back on the POST. */
export function issueReferralFormToken(secret: string, nowMs: number): string {
  if (secret.length === 0) throw new Error('REFERRAL_SECRET_MISSING')
  return `${nowMs}.${signature(secret, String(nowMs))}`
}

export type FormTokenVerdict =
  | { valid: true; issuedAtMs: number }
  | { valid: false; reason: 'MALFORMED' | 'TAMPERED' | 'EXPIRED' }

/**
 * Verify a submitted token in constant time where it matters (the signature)
 * and reject the rest by shape. Expiry and the min-fill clock are checked by
 * the caller against `issuedAtMs`, so this stays free of a `Date.now()`.
 */
export function verifyReferralFormToken(secret: string, token: unknown): FormTokenVerdict {
  if (typeof token !== 'string') return { valid: false, reason: 'MALFORMED' }
  const parts = token.split('.')
  const atMs = parts[0]
  const sig = parts[1]
  // noUncheckedIndexedAccess means both come back possibly-undefined even
  // though split('.') of a containing-'.' string yields them; being explicit
  // costs one line and reads the same everywhere.
  if (!token.includes('.') || atMs === undefined || sig === undefined) {
    return { valid: false, reason: 'MALFORMED' }
  }
  const issuedAtMs = Number(atMs)
  if (!Number.isInteger(issuedAtMs) || issuedAtMs <= 0) {
    return { valid: false, reason: 'MALFORMED' }
  }
  const expected = Buffer.from(signature(secret, atMs))
  const received = Buffer.from(sig)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { valid: false, reason: 'TAMPERED' }
  }
  return { valid: true, issuedAtMs }
}

/**
 * The checks the caller must apply to a verified token, in one place so no
 * caller forgets one: the POST arrived late enough to be human, and early
 * enough not to be a replay of yesterday's page.
 */
export function fillTimingLooksHuman(issuedAtMs: number, nowMs: number): boolean {
  const elapsed = nowMs - issuedAtMs
  if (elapsed < REFERRAL_MIN_FILL_MS) return false
  return elapsed <= REFERRAL_FORM_TOKEN_TTL_MS
}

/* ── Rate limiting: bucket by hashed network ──────────────────────────────── */

/**
 * Equality-preserving identity for the limiter's bucket. Same construction as
 * the guest phone salt: keyed by SESSION_SECRET, so a database dump yields no
 * addresses, and useless across secret rotations.
 */
export function referralSubmitterKey(secret: string, clientIp: string | undefined): string {
  return createHmac('sha256', secret)
    .update(`referral:${clientIp ?? 'unknown'}`)
    .digest('hex')
    .slice(0, 32)
}

/** Pure verdict on a count, so the limit is testable without a clock or rows. */
export function referralRateAllows(countInWindow: number): boolean {
  return countInWindow < REFERRAL_RATE_LIMIT_MAX
}
