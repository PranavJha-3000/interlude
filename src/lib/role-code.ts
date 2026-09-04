import { verifyPin } from '@/lib/pin'

/**
 * Which role a login code opens.
 *
 * The two-step login signs everyone in with the venue's shared email and
 * password, then asks for a code. The code — not the password — decides what
 * the device they typed it on can open: `ADMIN` is the dashboard, `STAFF` is
 * the floor and the pass.
 */

export type RoleCodeResult = 'ADMIN' | 'STAFF'

export interface RoleCodeHashes {
  adminPinHash: string | null
  staffPinHash: string | null
}

/**
 * Match a code against the venue's configured role codes.
 *
 * Matching rules, in order:
 *
 * 1. A staff code that is configured and matches opens `STAFF` — checked
 *    first, so with both codes set the staff code can never fall through to
 *    whatever the admin rule would have said.
 * 2. An admin code that is configured and matches opens `ADMIN`.
 * 3. **No admin code configured at all** (`adminPinHash` null) opens `ADMIN`
 *    for any entry. That is the pre-codes behaviour kept as a fallback: a
 *    venue that never sets codes is not locked out of its own dashboard, and
 *    the shared password remains the whole admin credential. The onboarding
 *    and settings forms always write both codes together, so this branch is
 *    only ever the legacy or not-yet-configured case.
 * 4. Anything else opens nothing — null, and the login says so.
 *
 * `verifyPin` already pays the full scrypt cost per check, so a wrong code
 * costs the same time as a right one.
 */
export function matchRoleCode(code: string, hashes: RoleCodeHashes): RoleCodeResult | null {
  const trimmed = code.trim()
  if (!trimmed) return null

  if (hashes.staffPinHash && verifyPin(trimmed, hashes.staffPinHash)) return 'STAFF'
  if (hashes.adminPinHash && verifyPin(trimmed, hashes.adminPinHash)) return 'ADMIN'
  if (!hashes.adminPinHash) return 'ADMIN'

  return null
}
