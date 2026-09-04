'use server'

import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { issueStaffPins } from '@/lib/onboarding'
import { hashPin } from '@/lib/pin'
import { getOperatorWithoutVenue } from '@/lib/operator-session'

/**
 * Minting the staff PINs, kept in its own file because it is the one action
 * that **returns** rather than redirects.
 *
 * Only the hash is stored, so the plaintext exists for exactly as long as this
 * return value does. That is why it is a POST: a page that minted PINs while
 * rendering would rotate them on a reload, or on a link prefetch, with nobody
 * having asked.
 */

export type PinState = { issued: false } | { issued: true; floorPin: string; kitchenPin: string }

/**
 * `useActionState` calls this with the previous state and the form data, and
 * both are required by that signature even though neither is read — everything
 * this needs comes from the session.
 */
export async function generatePins(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prev: PinState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData
): Promise<PinState> {
  // The venue comes from the session, never from the form (SECURITY.md §8).
  const operator = await getOperatorWithoutVenue()
  if (!operator) redirect('/signin')
  if (!operator.venueId) redirect('/onboarding')

  const venue = await db.venue.findUnique({
    where: { id: operator.venueId },
    select: { id: true, onboardingStep: true },
  })
  if (!venue) redirect('/onboarding')

  // Refuse outside the step that shows them. Otherwise this is an endpoint that
  // silently rotates a live venue's PINs mid-service, locking the floor out of
  // their own tablets.
  if (venue.onboardingStep !== 'STAFF') redirect('/onboarding')

  const { floorPin, kitchenPin } = await issueStaffPins(venue.id)
  return { issued: true, floorPin, kitchenPin }
}

/**
 * The role codes for the two-step login, set during the staff step.
 *
 * Both codes are written together and both are required here — a venue with
 * one code and not the other would have a half-configured login, and the
 * operator is typing these exactly once, at the moment the whole model is on
 * the screen in front of them. Rotating them later is the settings page's job.
 *
 * `useActionState` calls this with the previous state and the form data, and
 * both are required by that signature even though the venue comes from the
 * session.
 */
export type RoleCodesState = { saved: false; error?: string } | { saved: true }

export async function saveRoleCodes(
  _prev: RoleCodesState,
  formData: FormData
): Promise<RoleCodesState> {
  const operator = await getOperatorWithoutVenue()
  if (!operator) redirect('/signin')
  if (!operator.venueId) redirect('/onboarding')

  const admin = String(formData.get('adminCode') ?? '').trim()
  const staff = String(formData.get('staffCode') ?? '').trim()

  // 4–12 characters: long enough to be guess-resistant when the shared login
  // is handed around, short enough to type one-handed on a tablet.
  if ([admin, staff].some((c) => c.length < 4 || c.length > 12)) {
    return { saved: false, error: 'LENGTH' }
  }

  await db.venue.update({
    where: { id: operator.venueId },
    data: { adminPinHash: hashPin(admin), staffPinHash: hashPin(staff) },
  })

  return { saved: true }
}
