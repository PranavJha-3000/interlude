'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { readStaffSession, setStaffSessionCookie, verifyPin } from '@/lib/staff-session'
import { getOpenService, getVenueConfig } from '@/lib/service'
import { resolvePosAdapter } from '@/lib/pos'
import { recordEvent } from '@/lib/events'
import {
  earnedLifeActions,
  openOrResumeTableRun,
  runStateOf,
  saveRunState,
  toLadderConfig,
} from '@/lib/table-run'
import { grantLife } from '@/core/game/run'
import { planArmAssignments } from '@/core/measurement/arm-assignment'

/**
 * Staff sign-in, scoped to the venue named in the path (`/floor/[venueSlug]`).
 *
 * The slug is bound by the page, never read from the form, so a PIN is only
 * ever compared against the staff of one venue.
 */
export async function signIn(venueSlug: string, formData: FormData): Promise<void> {
  const pin = String(formData.get('pin') ?? '')
  if (!pin) redirect(`/floor/${venueSlug}?e=1`)

  // Scoped to the venue in the path. Unscoped, every staff PIN in the database
  // was a candidate and the loop kept the last match — so two venues choosing
  // the same four digits put a server on another restaurant's floor, with a
  // session correctly scoped to the wrong venue (SECURITY.md §8).
  //
  // Every stored hash is still checked rather than short-circuiting on the
  // first match, so the response time does not leak how many staff exist.
  const staff = await db.staffUser.findMany({ where: { venue: { slug: venueSlug } } })

  let match: (typeof staff)[number] | undefined
  let matches = 0
  for (const s of staff) {
    if (verifyPin(pin, s.pinHash)) {
      match = s
      matches++
    }
  }

  // Two staff at one venue sharing a PIN is the venue's own mistake, but
  // silently picking one of them would hand someone the other's role. Refuse,
  // and say the same thing a wrong PIN says.
  if (!match || matches > 1) redirect(`/floor/${venueSlug}?e=1`)

  await setStaffSessionCookie({
    staffId: match.id,
    venueId: match.venueId,
    role: match.role,
  })
  redirect(match.role === 'KITCHEN' ? '/pass' : '/floor')
}

/**
 * Opens a service and records the alternating arm split in one transaction.
 *
 * The assignment has to exist before the first guest scans, or the first few
 * tables would be unenrolled and silently excluded from the night's
 * comparison.
 */
export async function openService(): Promise<void> {
  const staff = await readStaffSession()
  if (!staff) return

  const existing = await getOpenService(staff.venueId)
  if (existing) return

  const tables = await db.table.findMany({
    where: { venueId: staff.venueId, active: true },
    select: { id: true, label: true },
  })
  if (tables.length === 0) return

  // Alternate which arm leads, so the same tables are not always treatment.
  const previous = await db.service.count({ where: { venueId: staff.venueId } })
  const plan = planArmAssignments(tables, previous % 2 === 0 ? 'TREATMENT' : 'CONTROL')

  await db.$transaction(async (tx) => {
    const service = await tx.service.create({
      data: {
        venueId: staff.venueId,
        name: new Date().toISOString().slice(0, 16).replace('T', ' '),
      },
    })
    await tx.tableArmAssignment.createMany({
      data: plan.map((p) => ({
        serviceId: service.id,
        tableId: p.tableId,
        arm: p.arm,
        reason: p.reason,
      })),
    })
  })

  revalidatePath('/floor')
}

export async function closeService(): Promise<void> {
  const staff = await readStaffSession()
  if (!staff) return
  const service = await getOpenService(staff.venueId)
  if (!service) return

  const now = new Date()
  await db.$transaction([
    db.service.update({ where: { id: service.id }, data: { endedAt: now } }),
    // Close the open assignment rows rather than deleting them — the record of
    // who was on which arm is the evidence, and it outlives the service.
    db.tableArmAssignment.updateMany({
      where: { serviceId: service.id, effectiveTo: null },
      data: { effectiveTo: now },
    }),
  ])
  revalidatePath('/floor')
}

/**
 * The mid-service swap: close every open row and write its opposite.
 * Never edits a row that has already been used.
 */
export async function swapArms(): Promise<void> {
  const staff = await readStaffSession()
  if (!staff) return
  const service = await getOpenService(staff.venueId)
  if (!service) return

  const open = await db.tableArmAssignment.findMany({
    where: { serviceId: service.id, effectiveTo: null },
  })
  if (open.length === 0) return

  const now = new Date()
  await db.$transaction([
    db.tableArmAssignment.updateMany({
      where: { serviceId: service.id, effectiveTo: null },
      data: { effectiveTo: now },
    }),
    db.tableArmAssignment.createMany({
      data: open.map((a) => ({
        serviceId: service.id,
        tableId: a.tableId,
        arm: a.arm === 'TREATMENT' ? ('CONTROL' as const) : ('TREATMENT' as const),
        effectiveFrom: now,
        reason: `Mid-service swap from ${a.arm.toLowerCase()}`,
      })),
    }),
  ])
  revalidatePath('/floor')
}

/**
 * Food went in. This starts the guest's clock, so it is the one action on
 * `/floor` a guest can feel.
 *
 * The work happens behind the `PosAdapter` port — this action only decides
 * *who* fired and *what*, never how long the food takes.
 *
 * Courses are optional by design. One tap sends none and the venue's
 * `defaultPrepMinutes` applies; a server with a spare second taps the chips and
 * the estimate sharpens. Nothing on the busy path requires the second tap.
 */
export async function fireOrder(formData: FormData): Promise<void> {
  const staff = await readStaffSession()
  if (!staff) return

  const tableId = String(formData.get('tableId') ?? '')
  if (!tableId) return

  const service = await getOpenService(staff.venueId)
  if (!service) return

  const table = await db.table.findFirst({ where: { id: tableId, venueId: staff.venueId } })
  if (!table) return

  // Only categories the venue actually configured. A form field is client
  // input, and an unrecognised course would otherwise silently widen the
  // estimate's vocabulary.
  const config = await getVenueConfig(staff.venueId)
  const known = new Set(Object.keys(config.prepMinutesByCategory as Record<string, number>))
  const courses = formData
    .getAll('course')
    .map(String)
    .filter((c) => known.has(c))

  // Party size, captured in the same tap (§3). Spend per table is dominated by
  // how many people are sitting at it, so without this the spend comparison is
  // noise — which is why it is a required part of firing rather than a separate
  // screen somebody will skip on a Saturday.
  const partySizeRaw = Number(formData.get('partySize'))
  const partySize =
    Number.isInteger(partySizeRaw) && partySizeRaw > 0 && partySizeRaw <= 20 ? partySizeRaw : null

  const fire = await resolvePosAdapter(staff.venueId).recordFire({
    venueId: staff.venueId,
    serviceId: service.id,
    tableId,
    courses,
    firedAtMs: Date.now(),
    firedByStaffId: staff.staffId,
  })

  if (partySize !== null) {
    await db.orderFire.update({ where: { id: fire.id }, data: { partySize } })
    // Onto the run too, where the metrics read it — a run may outlive the fire
    // row's usefulness, and spend per cover is computed over runs.
    await db.tableRun.updateMany({
      where: { serviceId: service.id, tableId },
      data: { partySize },
    })
  }

  revalidatePath('/floor')
}

/**
 * The server records an add-on ticket (§4.4, REVAMP-BRIEF.md Part 6).
 *
 * The guest asks out loud — that is the point — and the server writes it
 * down here. Recording IS confirmation, so the row is born ACKED and the
 * table's life lands in the same tap: the sale happened in front of the
 * person granting it. This is what feeds tier 1's extra-spend column, which
 * was structurally ₹0 while nothing could create these rows.
 */
export async function recordAddOn(formData: FormData): Promise<void> {
  const staff = await readStaffSession()
  if (!staff) return

  const tableId = String(formData.get('tableId') ?? '')
  const menuItemId = String(formData.get('menuItemId') ?? '')
  if (!tableId || !menuItemId) return

  const service = await getOpenService(staff.venueId)
  if (!service) return

  const [table, item] = await Promise.all([
    db.table.findFirst({ where: { id: tableId, venueId: staff.venueId, active: true } }),
    db.menuItem.findFirst({ where: { id: menuItemId, venueId: staff.venueId, active: true } }),
  ])
  if (!table || !item) return

  const config = await getVenueConfig(staff.venueId)
  const ladder = toLadderConfig(config)

  // A table that never scanned can still order a dessert. The run is the unit
  // everything hangs off, so one is opened if the guests never did.
  const run = await openOrResumeTableRun(service.id, tableId, ladder)

  const now = new Date()
  const request = await db.addOnRequest.create({
    data: {
      tableRunId: run.id,
      menuItemId: item.id,
      qty: 1,
      // Snapshotted so the dashboard's money maths survives a menu edit.
      pricePaise: item.pricePaise,
      foodCostPaise: item.foodCostPaise,
      status: 'ACKED',
      ackedAt: now,
    },
  })

  const earned = await earnedLifeActions(run.id)
  const { state, granted } = grantLife(runStateOf(run), 'ADDON_CONFIRMED', earned, ladder)

  const context = { serviceId: service.id, arm: 'LIVE' as const, tableRunId: run.id }
  await recordEvent('ADDON_CONFIRMED', context, { addOnId: request.id })
  if (granted) {
    await saveRunState(run.id, state)
    await recordEvent('LIFE_EARNED', context, { action: 'ADDON_CONFIRMED' })
  }

  revalidatePath('/floor')
}

export async function ackAddOn(formData: FormData): Promise<void> {
  const staff = await readStaffSession()
  if (!staff) return
  const id = String(formData.get('id') ?? '')
  if (!id) return

  const request = await db.addOnRequest.findFirst({
    where: { id, status: 'REQUESTED', tableRun: { table: { venueId: staff.venueId } } },
    include: { tableRun: true },
  })
  if (!request) return

  await db.addOnRequest.update({
    where: { id },
    data: { status: 'ACKED', ackedAt: new Date() },
  })

  // **The life lands here, on confirmation — never on the request** (§4.4).
  // This is the strongest of the three earning actions precisely because it is
  // the behaviour the product exists to cause; granting it on the tap would pay
  // for the intention rather than the sale.
  if (request.tableRun) {
    const config = await getVenueConfig(staff.venueId)
    const ladder = toLadderConfig(config)
    const earned = await earnedLifeActions(request.tableRun.id)
    const { state, granted } = grantLife(
      runStateOf(request.tableRun),
      'ADDON_CONFIRMED',
      earned,
      ladder
    )

    const context = {
      serviceId: request.tableRun.serviceId,
      arm: 'LIVE' as const,
      tableRunId: request.tableRun.id,
    }
    await recordEvent('ADDON_CONFIRMED', context, { addOnId: id })

    if (granted) {
      await saveRunState(request.tableRun.id, state)
      await recordEvent('LIFE_EARNED', context, { action: 'ADDON_CONFIRMED' })
    }
  }

  revalidatePath('/floor')
}

/**
 * Staff confirms a prize at the table. No OTP, no code to type — the guest
 * shows the screen and a human decides. Anything on the critical path that can
 * fail at 9pm on a Saturday does not belong there.
 */
export async function confirmAward(formData: FormData): Promise<void> {
  const staff = await readStaffSession()
  if (!staff) return
  const id = String(formData.get('id') ?? '')
  if (!id) return

  // Scoped through the table run, not through a play. Awards stopped hanging
  // off a play when the table became the unit — matching on the old path here
  // silently confirmed nothing, which on a Saturday reads as a broken button.
  const now = new Date()
  await db.award.updateMany({
    where: {
      id,
      status: 'PENDING',
      tableRun: { table: { venueId: staff.venueId } },
    },
    data: {
      status: 'CONFIRMED',
      confirmedAt: now,
      confirmedById: staff.staffId,
      redeemedAt: now,
      redeemedById: staff.staffId,
    },
  })

  const award = await db.award.findUnique({ where: { id }, include: { tableRun: true } })
  if (award?.tableRun) {
    await recordEvent(
      'AWARD_REDEEMED',
      {
        serviceId: award.tableRun.serviceId,
        arm: 'LIVE',
        tableRunId: award.tableRun.id,
      },
      { awardId: id, code: award.code }
    )
  }

  revalidatePath('/floor')
}
