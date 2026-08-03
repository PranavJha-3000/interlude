'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { requireOperator } from '@/lib/operator-session'
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
