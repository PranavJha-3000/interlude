'use server'

import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { recordEvent } from '@/lib/events'
import { grantLife } from '@/core/game/run'
import { readGuestSessionId } from '@/lib/session'
import { getVenueConfig, resolveScan } from '@/lib/service'
import { earnedLifeActions, runStateOf, saveRunState, toLadderConfig } from '@/lib/table-run'

/**
 * First-party feedback — the compliant half of "tell us how it went".
 *
 * **This is the module that may store words and may carry a rating**, and it is
 * the exact mirror of the Google prompt, which may do neither. The distinction
 * is the whole of §7.2: sentiment the restaurant hears in private is a service
 * improving itself; sentiment we could read *before* deciding whether to show a
 * Google prompt would be review gating. So they are separate routes, separate
 * tables, and ESLint forbids either from importing the other.
 *
 * It may also grant a life, which the Google prompt may never do.
 */
export async function submitFeedback(formData: FormData): Promise<void> {
  const qrToken = String(formData.get('qrToken') ?? '')

  const scan = await resolveScan(qrToken)
  if (scan.kind !== 'OK') redirect(`/t/${qrToken}`)

  const deviceId = await readGuestSessionId()
  const device = deviceId
    ? await db.deviceSession.findUnique({ where: { id: deviceId }, include: { tableRun: true } })
    : null
  if (!device || device.tableRun.serviceId !== scan.serviceId) redirect(`/t/${qrToken}`)

  const body = String(formData.get('body') ?? '').trim()
  if (body === '') redirect(`/t/${qrToken}/feedback?error=empty`)

  const ratingRaw = String(formData.get('rating') ?? '').trim()
  const rating = /^[1-5]$/.test(ratingRaw) ? Number(ratingRaw) : null

  await db.venueFeedback.create({
    data: { serviceId: scan.serviceId, tableRunId: device.tableRunId, body, rating },
  })

  const context = {
    serviceId: scan.serviceId,
    arm: scan.arm,
    tableRunId: device.tableRunId,
    deviceSessionId: device.id,
  }

  // At most one life per run, enforced by `grantLife` rather than here — so a
  // table cannot write four notes and earn four goes.
  const config = await getVenueConfig(scan.venueId)
  const earned = await earnedLifeActions(device.tableRunId)
  const granted = grantLife(
    runStateOf(device.tableRun),
    'FEEDBACK_SUBMITTED',
    earned,
    toLadderConfig(config)
  )

  await recordEvent('FEEDBACK_SUBMITTED', context, {})

  if (granted.granted) {
    await saveRunState(device.tableRunId, granted.state)
    await recordEvent('LIFE_EARNED', context, { action: 'FEEDBACK_SUBMITTED' })
  }

  redirect(`/t/${qrToken}/feedback?done=1${granted.granted ? '&life=1' : ''}`)
}
