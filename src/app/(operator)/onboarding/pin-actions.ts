'use server'

import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { issueStaffPins } from '@/lib/onboarding'
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
