import 'server-only'

import { createHmac } from 'node:crypto'

/**
 * A guest's phone number, as an HMAC with the venue's own salt.
 *
 * **This is the function SECURITY.md §6's claim rests on.** The claim is that a
 * cross-venue phone join is impossible *by construction* rather than by policy:
 * `Venue.phoneSalt` is a per-venue column, so the same number produces a
 * different hash at every venue and no two guest lists can be joined. Cross-venue
 * identity is on the never-build list, and this is what makes it unavailable
 * rather than merely disallowed.
 *
 * `server-only` because the salt must never reach a bundle. The ESLint block on
 * the phone routes additionally forbids `console` there, since a raw number in a
 * serverless log is the one copy erasure cannot reach.
 *
 * Normalise with `normaliseIndianPhone` first — this hashes exactly what it is
 * given, so two spellings of one number would become two guests, permanently and
 * undetectably.
 */
export function phoneHmac(e164: string, venueSalt: string): string {
  if (!venueSalt) {
    // An unsalted hash of a ten-digit number is reversible by brute force in
    // seconds — the entire keyspace is 10^10. Accepting a missing salt would
    // make the store plaintext with extra steps.
    throw new Error('phoneHmac called with no venue salt — refusing to hash a phone number')
  }
  return createHmac('sha256', venueSalt).update(e164).digest('hex')
}
