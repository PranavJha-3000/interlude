'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import {
  addMenuItem,
  advanceFrom,
  createVenueForOperator,
  finishMenu,
  removeMenuItem,
  rupeesToPaise,
  setTableCount,
} from '@/lib/onboarding'
import { getOperatorWithoutVenue } from '@/lib/operator-session'
import type { OnboardingStepName } from '@/lib/venue-setup'

/**
 * The onboarding writes.
 *
 * **Every one of these resolves the venue from the session**, never from the
 * form — `requireOnboardingVenue` below is the only way a venue id enters this
 * file. A hidden input carrying a venue id would be a cross-tenant write that
 * types cannot catch (SECURITY.md §8).
 */

async function requireOperatorId(): Promise<string> {
  const operator = await getOperatorWithoutVenue()
  if (!operator) redirect('/signin')
  return operator.operatorId
}

/** The signed-in operator's own venue, or nothing. Never a form's idea of it. */
async function requireOnboardingVenue(): Promise<{ id: string; step: OnboardingStepName }> {
  const operator = await getOperatorWithoutVenue()
  if (!operator) redirect('/signin')
  if (!operator.venueId) redirect('/onboarding')

  const venue = await db.venue.findUnique({
    where: { id: operator.venueId },
    select: { id: true, onboardingStep: true },
  })
  if (!venue) redirect('/onboarding')

  return { id: venue.id, step: venue.onboardingStep }
}

export async function submitDetails(formData: FormData): Promise<void> {
  const operatorId = await requireOperatorId()

  const result = await createVenueForOperator(operatorId, {
    name: String(formData.get('name') ?? ''),
    city: String(formData.get('city') ?? ''),
  })

  if (!result.ok) redirect(`/onboarding?error=${result.reason.toLowerCase()}`)

  // The session's venue claim is re-read from the database on every request
  // (`getOperator`), so attaching the venue is enough — there is no stale
  // cookie to refresh here.
  revalidatePath('/onboarding')
  redirect('/onboarding')
}

export async function submitTables(formData: FormData): Promise<void> {
  const venue = await requireOnboardingVenue()

  const count = Number(String(formData.get('count') ?? ''))
  const result = await setTableCount(venue.id, count)
  if (!result.ok) redirect(`/onboarding?error=${result.reason.toLowerCase()}`)

  revalidatePath('/onboarding')
  redirect('/onboarding')
}

export async function submitMenuItem(formData: FormData): Promise<void> {
  const venue = await requireOnboardingVenue()

  const price = Number(String(formData.get('price') ?? ''))
  const cost = Number(String(formData.get('cost') ?? ''))

  const result = await addMenuItem(venue.id, {
    name: String(formData.get('name') ?? ''),
    category: String(formData.get('category') ?? 'mains'),
    pricePaise: rupeesToPaise(price),
    foodCostPaise: rupeesToPaise(cost),
    // The operator is not asked to grade their own margin during setup: it is
    // derived from the numbers they just gave, and editable in /dash/menu.
    marginTier: marginTierFor(price, cost),
  })

  if (!result.ok) redirect(`/onboarding?error=${result.reason.toLowerCase()}`)

  revalidatePath('/onboarding')
  redirect('/onboarding')
}

/**
 * Margin tier from the two numbers already typed.
 *
 * A starting classification written into a row the operator then owns, not a
 * rule consulted at runtime — the same status as everything else seeded from an
 * estimate (PLATFORM.md §10). Editable in `/dash/menu` from the first minute.
 */
function marginTierFor(priceRupees: number, costRupees: number): 'HIGH' | 'MID' | 'LOW' {
  if (!Number.isFinite(priceRupees) || priceRupees <= 0) return 'LOW'
  const margin = (priceRupees - costRupees) / priceRupees
  if (margin >= 0.7) return 'HIGH'
  if (margin >= 0.45) return 'MID'
  return 'LOW'
}

export async function removeItem(formData: FormData): Promise<void> {
  const venue = await requireOnboardingVenue()
  await removeMenuItem(venue.id, String(formData.get('menuItemId') ?? ''))

  revalidatePath('/onboarding')
  redirect('/onboarding')
}

export async function submitMenuDone(): Promise<void> {
  const venue = await requireOnboardingVenue()

  const result = await finishMenu(venue.id)
  if (!result.ok) redirect(`/onboarding?error=${result.reason.toLowerCase()}`)

  revalidatePath('/onboarding')
  redirect('/onboarding')
}

/** The acknowledge-and-continue steps: STAFF, QR, GAMES. */
export async function advanceStep(formData: FormData): Promise<void> {
  const venue = await requireOnboardingVenue()

  // Taken from the session's venue, not from the form — the form's value is
  // only used to confirm the operator is acting on the step they were shown,
  // so a stale tab cannot skip one.
  const shown = String(formData.get('step') ?? '')
  if (shown !== venue.step) redirect('/onboarding')

  await advanceFrom(venue.id, venue.step)

  revalidatePath('/onboarding')
  redirect(venue.step === 'GAMES' ? '/dash' : '/onboarding')
}
