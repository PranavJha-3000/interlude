'use server'

import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { recordEvent } from '@/lib/events'
import { normaliseIndianPhone } from '@/core/mechanics/phone'
import { grantLife } from '@/core/game/run'
import { loyaltyRewardDue } from '@/core/prize-engine'
import { eraseIdentity, linkStampAward, recordStamp } from '@/lib/loyalty'
import { phoneHmac } from '@/lib/phone-identity'
import { decideAndWriteAward } from '@/lib/prize-award'
import { readGuestSessionId } from '@/lib/session'
import { getVenueConfig, resolveScan } from '@/lib/service'
import { earnedLifeActions, runStateOf, saveRunState, toLadderConfig } from '@/lib/table-run'

/**
 * Phone capture, the stamp, and the returning-guest reward.
 *
 * **The number is normalised, hashed, and discarded — in that order, in this
 * function, and it is never written anywhere.** `GuestIdentity` holds only the
 * HMAC, and the ESLint block on this directory forbids `console` outright, so a
 * raw number cannot reach a serverless log either. A log is the one copy
 * erasure cannot reach.
 *
 * This route is also the first thing that makes `PHONE_SUBMITTED` real. The
 * spent-device screen has advertised "Leave a phone number" since the ladder
 * shipped, `lifeForPhone` has defaulted to true, and there has never been a
 * route that accepted one.
 */

/** The guest's run, or nothing. Same three lines the review screen uses. */
async function deviceFor(qrToken: string) {
  const scan = await resolveScan(qrToken)
  if (scan.kind !== 'OK') return null

  const deviceId = await readGuestSessionId()
  const device = deviceId
    ? await db.deviceSession.findUnique({
        where: { id: deviceId },
        include: { tableRun: true },
      })
    : null
  if (!device || device.tableRun.serviceId !== scan.serviceId) return null

  return { scan, device }
}

export async function submitPhone(formData: FormData): Promise<void> {
  const qrToken = String(formData.get('qrToken') ?? '')
  const found = await deviceFor(qrToken)
  if (!found) redirect(`/t/${qrToken}`)
  const { scan, device } = found

  const parsed = normaliseIndianPhone(String(formData.get('phone') ?? ''))
  if (!parsed.ok) redirect(`/t/${qrToken}/phone?error=${parsed.reason}`)

  const venue = await db.venue.findUniqueOrThrow({
    where: { id: scan.venueId },
    select: { phoneSalt: true },
  })
  const hmac = phoneHmac(parsed.e164, venue.phoneSalt)

  const now = Date.now()
  const config = await getVenueConfig(scan.venueId)

  const stamp = await recordStamp({
    venueId: scan.venueId,
    serviceId: scan.serviceId,
    tableRunId: device.tableRunId,
    phoneHmac: hmac,
    nowMs: now,
  })

  const context = {
    serviceId: scan.serviceId,
    arm: scan.arm,
    tableRunId: device.tableRunId,
    deviceSessionId: device.id,
  }

  // The visit number, never the number that earned it.
  if (!stamp.alreadyStamped) {
    await recordEvent('LOYALTY_STAMPED', context, { visitNumber: stamp.visitNumber })
  }

  // ── The life ─────────────────────────────────────────────────────────────
  // At most once per run, and `grantLife` enforces that rather than this
  // function — so a second phone at the same table earns nothing, which is the
  // behaviour `offeredLifeActions` already advertises.
  const ladder = toLadderConfig(config)
  const earned = await earnedLifeActions(device.tableRunId)
  const granted = grantLife(runStateOf(device.tableRun), 'PHONE_SUBMITTED', earned, ladder)

  if (granted.granted) {
    await saveRunState(device.tableRunId, granted.state)
    await recordEvent('PHONE_SUBMITTED', context, {})
    await recordEvent('LIFE_EARNED', context, { action: 'PHONE_SUBMITTED' })
  }

  // ── The reward ───────────────────────────────────────────────────────────
  // The chef's kill switch is honoured the way `claimPrize` honours it: the
  // stamp is still recorded and the visit still counts, there is simply nothing
  // to hand over. The night still produces a number.
  const due =
    config.loyaltyEnabled &&
    !scan.killed &&
    !stamp.alreadyStamped &&
    loyaltyRewardDue(stamp.visitsSinceLastReward, config.loyaltyVisitsRequired)

  if (!due) redirect(`/t/${qrToken}/phone?done=1`)

  const award = await decideAndWriteAward({
    venueId: scan.venueId,
    serviceId: scan.serviceId,
    tableRunId: device.tableRunId,
    nowMs: now,
    purpose: {
      kind: 'LOYALTY',
      visitNumber: stamp.visitNumber,
      maxValuePaise: config.loyaltyRewardMaxValuePaise,
    },
  })

  // No award is a legitimate outcome — every item behind a fence, or nothing
  // under the ceiling. The stamp stands and the next visit tries again.
  if (!award) redirect(`/t/${qrToken}/phone?done=1`)

  await linkStampAward(stamp.guestVisitId, award.id)
  await recordEvent('LOYALTY_REWARDED', context, {
    visitNumber: stamp.visitNumber,
    awardId: award.id,
  })

  redirect(`/t/${qrToken}/phone?done=1&code=${award.code ?? ''}`)
}

/**
 * Erasure (DPDP).
 *
 * The guest re-enters the number; it is normalised and hashed with the same
 * venue salt, and the identity and its visits go. `Award` rows survive
 * deliberately — they hang off the table run, carry no identity, and are the
 * money record. Erasing a person must not erase a sale.
 */
export async function erasePhone(formData: FormData): Promise<void> {
  const qrToken = String(formData.get('qrToken') ?? '')
  const found = await deviceFor(qrToken)
  if (!found) redirect(`/t/${qrToken}`)
  const { scan, device } = found

  const parsed = normaliseIndianPhone(String(formData.get('phone') ?? ''))
  // Even a malformed number gets the same ending. Anything else lets a caller
  // distinguish "not a number" from "not here".
  if (parsed.ok) {
    const venue = await db.venue.findUniqueOrThrow({
      where: { id: scan.venueId },
      select: { phoneSalt: true },
    })
    const removed = await eraseIdentity(scan.venueId, phoneHmac(parsed.e164, venue.phoneSalt))

    if (removed > 0) {
      await recordEvent(
        'PHONE_ERASED',
        {
          serviceId: scan.serviceId,
          arm: scan.arm,
          tableRunId: device.tableRunId,
          deviceSessionId: device.id,
        },
        { deletedVisits: removed }
      )
    }
  }

  redirect(`/t/${qrToken}/phone/erase?done=1`)
}
