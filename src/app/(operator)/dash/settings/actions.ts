'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { requireOperator } from '@/lib/operator-session'
import { hashPin } from '@/lib/pin'
import { normaliseGooglePlaceId } from '@/lib/google-place'

/**
 * Venue settings — the fields that are neither menu nor fences.
 *
 * `requireOperator()` supplies the venue id, as every operator query must; the
 * form carries no venue field, because one that did would be a cross-tenant
 * write that types cannot catch.
 */
export async function updateGooglePlace(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const result = normaliseGooglePlaceId(String(formData.get('googlePlaceId') ?? ''))
  if (!result.ok) {
    // The refusal reason is carried, not flattened to "invalid": the short-link
    // mistake is the likely one and needs its own answer, or the operator is
    // left holding the right instinct and no way forward.
    redirect(`/dash/settings?error=${result.reason}`)
  }

  await db.venue.update({
    where: { id: operator.venueId },
    data: { googlePlaceId: result.placeId },
  })

  revalidatePath('/dash/settings')
  redirect('/dash/settings?saved=1')
}

/**
 * Rotate the two role codes.
 *
 * Both fields are optional and independent: a blank field keeps the code it has,
 * so this is a partial update and never clears a code that was set. New codes
 * take effect from the next sign-in, so a live venue is not locked out by a
 * typo.
 */
export async function updateRoleCodes(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const admin = String(formData.get('adminCode') ?? '').trim()
  const staff = String(formData.get('staffCode') ?? '').trim()

  // Refuse the length rule the same way onboarding does — a 3-character code
  // is not a code, and it would be a live credential that is not a credential.
  if ([admin, staff].some((c) => c !== '' && (c.length < 4 || c.length > 12))) {
    redirect('/dash/settings?error=role_code_length')
  }

  const data: { adminPinHash?: string; staffPinHash?: string } = {}
  if (admin) data.adminPinHash = hashPin(admin)
  if (staff) data.staffPinHash = hashPin(staff)

  if (Object.keys(data).length === 0) {
    redirect('/dash/settings?error=role_code_nothing')
  }

  await db.venue.update({ where: { id: operator.venueId }, data })

  revalidatePath('/dash/settings')
  redirect('/dash/settings?saved=role_codes')
}
