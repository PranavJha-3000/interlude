'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { readStaffSession } from '@/lib/staff-session'
import { getOpenService } from '@/lib/service'

/**
 * The chef's two controls. Both take effect on the next guest, immediately —
 * PLATFORM.md §4 is explicit that promoting a dessert at 9pm on a Saturday
 * with no kitchen control makes the chef the product's enemy by 9:15.
 */

export async function setKitchenLoad(formData: FormData): Promise<void> {
  const staff = await readStaffSession()
  if (!staff) return

  const level = String(formData.get('level') ?? '')
  if (level !== 'GREEN' && level !== 'AMBER' && level !== 'RED') return

  const service = await getOpenService(staff.venueId)

  // A new row each time rather than an update: when the kitchen went RED, and
  // for how long, is part of explaining the night's numbers afterwards.
  await db.kitchenLoad.create({
    data: {
      venueId: staff.venueId,
      serviceId: service?.id ?? null,
      level,
      setById: staff.staffId,
    },
  })

  revalidatePath('/pass')
}

export async function toggleVeto(formData: FormData): Promise<void> {
  const staff = await readStaffSession()
  if (!staff) return

  const menuItemId = String(formData.get('menuItemId') ?? '')
  if (!menuItemId) return

  const item = await db.menuItem.findFirst({
    where: { id: menuItemId, venueId: staff.venueId },
  })
  if (!item) return

  const existing = await db.chefVeto.findUnique({ where: { menuItemId } })

  if (!existing) {
    await db.chefVeto.create({ data: { venueId: staff.venueId, menuItemId, active: true } })
  } else {
    await db.chefVeto.update({
      where: { menuItemId },
      data: {
        active: !existing.active,
        clearedAt: existing.active ? new Date() : null,
      },
    })
  }

  revalidatePath('/pass')
}

/**
 * The kill switch (§7.4).
 *
 * **Separate from RED, and the separation is the point.** RED is a kitchen
 * state that shapes the pool — it says "nothing that makes me cook", and the
 * engine still offers what the bar can pour. This says "stop giving things
 * away", full stop.
 *
 * The game, the event log and the measurement all carry on, so the night still
 * produces a number. That matters: a chef who can only stop the product by
 * stopping the pilot will stop the pilot.
 *
 * The chef needs to know it exists, or he will find a worse one.
 */
export async function toggleKillSwitch(): Promise<void> {
  const staff = await readStaffSession()
  if (!staff) return

  const service = await getOpenService(staff.venueId)
  if (!service) return

  const killing = service.killedAt === null

  await db.service.update({
    where: { id: service.id },
    data: {
      killedAt: killing ? new Date() : null,
      killedById: killing ? staff.staffId : null,
    },
  })

  revalidatePath('/pass')
  revalidatePath('/floor')
}
