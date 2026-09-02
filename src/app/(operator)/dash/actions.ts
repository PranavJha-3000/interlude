'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getOperatorWithoutVenue } from '@/lib/operator-session'
import { getOpenService, openServiceFor } from '@/lib/service'

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

/**
 * The operator's End Service — closes the open service and its arm assignments
 * in one transaction. Mirror of the floor console's `closeService`: same write,
 * not a parallel implementation, because the arm record is the evidence and
 * both entry points have to leave it in the same shape.
 */
export async function endService(): Promise<void> {
  const operator = await getOperatorWithoutVenue()
  if (!operator?.venueId) return

  const service = await getOpenService(operator.venueId)
  if (!service) return

  const now = new Date()
  await db.$transaction([
    db.service.update({ where: { id: service.id }, data: { endedAt: now } }),
    db.tableArmAssignment.updateMany({
      where: { serviceId: service.id, effectiveTo: null },
      data: { effectiveTo: now },
    }),
  ])

  revalidatePath('/dash')
}
