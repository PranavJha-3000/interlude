'use server'

import { randomBytes } from 'node:crypto'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { hashPin } from '@/lib/pin'
import { matchRoleCode } from '@/lib/role-code'
import {
  clearOperatorSessionCookie,
  clearPendingRoleCookie,
  readPendingRoleSession,
  setOperatorSessionCookie,
  setPendingRoleCookie,
} from '@/lib/operator-session'
import { clearStaffSessionCookie, setStaffSessionCookie } from '@/lib/staff-session'

/**
 * The code step, and the only place a real session is ever issued from a
 * password login.
 *
 * The code decides what the device that typed it can open:
 *
 *   - **Admin code** — the operator session, everything under `/dash`.
 *   - **Staff code** — a staff session, `/floor` and `/pass`. Both kitchen and
 *     floor staff share this one code; the surfaces it opens are staff
 *     surfaces, and every one of them is deliberately metric-free.
 *
 * Every branch requires the pending cookie set by `signIn`, so a code alone —
 * without the email and password that came before it — opens nothing.
 */
export async function selectRole(formData: FormData): Promise<void> {
  const pending = await readPendingRoleSession()
  if (!pending) redirect('/signin')
  if (!pending.venueId) redirect('/onboarding')

  const code = String(formData.get('code') ?? '')

  // The hashes come from the operator's own venue row, reached through the
  // pending session — never through the form.
  const venue = await db.venue.findUnique({
    where: { id: pending.venueId },
    select: { adminPinHash: true, staffPinHash: true },
  })
  if (!venue) redirect('/signin')

  const role = matchRoleCode(code, venue)

  if (role === 'ADMIN') {
    // Admin on this device. The staff cookie goes too — one device, one role.
    await clearStaffSessionCookie()
    await clearPendingRoleCookie()
    await setOperatorSessionCookie({
      operatorId: pending.operatorId,
      venueId: pending.venueId,
    })
    redirect('/dash')
  }

  if (role === 'STAFF') {
    // Staff on this device. The acting identity is the venue's floor staff
    // row, so award confirmations keep their attribution (and their foreign
    // key) without inventing a per-device account.
    const staffUser = await ensureSharedStaffUser(pending.venueId)
    await clearOperatorSessionCookie()
    await clearPendingRoleCookie()
    await setStaffSessionCookie({
      staffId: staffUser.id,
      venueId: pending.venueId,
      role: 'SERVER',
    })
    redirect('/floor')
  }

  // A wrong code says exactly what a wrong password says — that it did not
  // work — and the pending cookie survives, so the next try costs one entry.
  await setPendingRoleCookie(pending)
  redirect('/signin/code?e=wrong')
}

/**
 * The StaffUser row a shared-code staff session acts as.
 *
 * The code is shared by every kitchen and floor hand at the venue, so the
 * attribution is the venue's floor staff rather than any one person. The row
 * already exists at any venue that ran onboarding's staff step; this only
 * creates one when none does, so a first login can never fail on a foreign
 * key it did not write.
 */
async function ensureSharedStaffUser(venueId: string) {
  const existing = await db.staffUser.findFirst({
    where: { venueId, role: 'SERVER' },
  })
  if (existing) return existing

  // The PIN is a random value nobody is given: the shared code is the
  // credential, and this row exists so confirmations have someone to name.
  return db.staffUser.create({
    data: {
      venueId,
      name: 'Shared staff access',
      role: 'SERVER',
      pinHash: hashPin(randomBytes(12).toString('hex')),
    },
  })
}