import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Magic-link token mechanics, kept free of `server-only` and of the database so
 * they can be unit-tested directly and reused by a script.
 *
 * The link is a bearer credential that travels through email, which is not a
 * secure channel (SECURITY.md §7). Four properties, all tested:
 *
 *  - **Hashed at rest.** Only the SHA-256 is stored, so a database dump yields
 *    no working sign-in links.
 *  - **Single-use.** Consumed inside the same transaction that issues a session.
 *  - **Short-lived.** Minutes, not days.
 *  - **Rate-limited.** Enforced by the caller against `createdAt`.
 *
 * SHA-256 rather than scrypt is deliberate here, unlike the staff PIN: this
 * token has 256 bits of entropy from a CSPRNG, so there is nothing to brute
 * force and a slow hash would only add latency to every sign-in.
 */

/** How long a link is good for. Minutes, not days. */
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000

/** How many links one address may request inside the window below. */
export const MAGIC_LINK_MAX_PER_WINDOW = 5
export const MAGIC_LINK_RATE_WINDOW_MS = 15 * 60 * 1000

/**
 * How many links one *client IP* may request inside the same window.
 *
 * The per-address limit alone is no limit at all: a list of ten thousand
 * addresses is ten thousand separate buckets, so it sends ten thousand emails
 * from our sending domain and leaves ten thousand junk `OperatorUser` rows
 * behind. Higher than the per-address cap because a venue behind one NAT is a
 * real customer, and low enough that a list is not a viable relay.
 */
export const MAGIC_LINK_MAX_PER_IP_PER_WINDOW = 20

/**
 * The client IP, from the proxy header the platform sets.
 *
 * `x-forwarded-for` is a comma-separated chain and the *first* entry is the
 * original client. Everything after it was appended by a hop we do not control,
 * so only the first is worth anything — and even that is spoofable by a client
 * talking to us directly, which is why this limit is a brake on volume rather
 * than an authorisation decision.
 */
export function clientIpFrom(forwardedFor: string | null | undefined): string | undefined {
  const first = forwardedFor?.split(',')[0]?.trim()
  return first && first.length > 0 && first.length <= 64 ? first : undefined
}

/** 32 random bytes, base64url. Never stored — only its hash is. */
export function generateMagicToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashMagicToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Constant-time compare of two token hashes.
 *
 * The lookup is by unique index on the hash, so this is belt-and-braces rather
 * than the primary defence — but a hash comparison that leaks timing is free to
 * avoid and awkward to add back later.
 */
export function tokenHashMatches(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export type TokenVerdict =
  { valid: true } | { valid: false; reason: 'EXPIRED' | 'ALREADY_USED' | 'UNKNOWN' }

/** Pure verdict on a token row, so expiry logic is testable without a clock. */
export function checkToken(
  row: { expiresAt: Date; consumedAt: Date | null } | null,
  nowMs: number
): TokenVerdict {
  if (!row) return { valid: false, reason: 'UNKNOWN' }
  // Checked before expiry so a replayed link reads as "already used" rather
  // than as "expired", which is the more useful thing to tell someone.
  if (row.consumedAt !== null) return { valid: false, reason: 'ALREADY_USED' }
  if (row.expiresAt.getTime() <= nowMs) return { valid: false, reason: 'EXPIRED' }
  return { valid: true }
}

/** Emails are matched case-insensitively; addresses are not case-sensitive in practice. */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

/** Deliberately permissive — the real validation is that the link arrives. */
export function looksLikeEmail(raw: string): boolean {
  const email = normaliseEmail(raw)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
}
