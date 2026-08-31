'use server'

import { revalidatePath } from 'next/cache'
import { getOperatorWithoutVenue } from '@/lib/operator-session'
import { openServiceFor } from '@/lib/service'

/**
 * The operator's Start Service, on the dashboard's service card.
 *
 * Deliberately the same write the floor console performs — the arm split has to
 * be planned identically no matter who opens the night — so the body is the
 * shared `openServiceFor`, not a second implementation beside it. The operator
 * session is the only credential this accepts (SECURITY.md §8): the venue comes
 * from the session or the action does nothing.
 */
export async function startService(): Promise<void> {
  const operator = await getOperatorWithoutVenue()
  if (!operator?.venueId) return

  await openServiceFor(operator.venueId)

  revalidatePath('/dash')
}
