'use server'

import { revalidatePath } from 'next/cache'
import { requireOperator } from '@/lib/operator-session'
import { setVenueGameEnabled } from '@/lib/service'
import { MECHANICS } from '@/core/prize-engine'

/**
 * Turn one game on or off.
 *
 * The venue comes from the session and the mechanic comes from the form, so the
 * mechanic is validated against the known set before it reaches a query — a
 * string off a form is a client input whatever its TypeScript type says.
 */
export async function toggleGame(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const raw = String(formData.get('mechanic') ?? '')
  const mechanic = MECHANICS.find((m) => m === raw)
  if (!mechanic) return

  const enabled = String(formData.get('enabled') ?? '') === 'true'

  await setVenueGameEnabled(operator.venueId, mechanic, enabled)
  revalidatePath('/dash/games')
}
