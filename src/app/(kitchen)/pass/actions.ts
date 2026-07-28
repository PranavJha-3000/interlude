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
