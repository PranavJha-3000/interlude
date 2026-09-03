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
import {
  confirmMenuDraft,
  costPctFromForm,
  discardMenuDraft,
  rowsFromForm,
  uploadMenuFile,
} from '@/lib/menu-draft'
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

function uploadErrorKey(reason: string): string {
  switch (reason) {
    case 'EMPTY_FILE':
      return 'empty'
    case 'TOO_LARGE':
      return 'too_large'
    case 'UNSUPPORTED_TYPE':
      return 'unsupported'
    case 'CSV_NO_HEADER':
      return 'csv_header'
    case 'CSV_NO_ROWS':
      return 'csv_empty'
    case 'AI_UNAVAILABLE':
      return 'upload_ai_unavailable'
    case 'AI_AUTH':
      return 'upload_ai_auth'
    case 'AI_QUOTA':
      return 'upload_ai_quota'
    case 'AI_NOT_A_MENU':
      return 'upload_ai_not_menu'
    case 'AI_PARTIAL':
      return 'upload_ai_partial'
    case 'AI_DECLINED':
    case 'AI_UNREACHABLE':
    case 'AI_INVALID':
      return 'upload_ai_failed'
    case 'NO_ITEMS':
      return 'no_items'
    default:
      return 'upload_failed'
  }
}

export async function uploadMenu(formData: FormData): Promise<void> {
  const venue = await requireOnboardingVenue()

  const file = formData.get('menuFile')
  if (!(file instanceof File)) redirect('/onboarding?error=upload_failed')

  const result = await uploadMenuFile(venue.id, file)
  if (!result.ok) redirect(`/onboarding?error=${uploadErrorKey(result.reason)}`)

  revalidatePath('/onboarding')
  redirect('/onboarding')
}

export async function confirmUploadedMenu(formData: FormData): Promise<void> {
  const venue = await requireOnboardingVenue()

  const result = await confirmMenuDraft(venue.id, rowsFromForm(formData), costPctFromForm(formData))
  if (!result.ok) {
    redirect(
      `/onboarding?error=${result.reason === 'MISSING_COST_PCT' ? 'missing_cost_pct' : 'nothing_selected'}`
    )
  }

  revalidatePath('/onboarding')
  redirect('/onboarding')
}

export async function discardUploadedMenu(): Promise<void> {
  const venue = await requireOnboardingVenue()
  await discardMenuDraft(venue.id)

  revalidatePath('/onboarding')
  redirect('/onboarding')
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
