'use server'

import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { readGuestSessionId } from '@/lib/session'
import { resolveScan } from '@/lib/service'
import { buildWriteReviewUrl } from '@/core/review/link'

/**
 * The hand-off tap. Records timestamps on the funnel row and sends the guest
 * to Google's own dialog. **The draft never leaves the guest's screen** — the
 * form field exists so they can compose, and this action deliberately reads
 * only its length. Storing the words would be storing sentiment, and §7.2
 * exists to make gating on sentiment structurally impossible.
 */
export async function recordReviewHandOff(formData: FormData): Promise<void> {
  const qrToken = String(formData.get('qrToken') ?? '')
  const scan = await resolveScan(qrToken)
  if (scan.kind !== 'OK') redirect(`/t/${qrToken}`)

  const deviceId = await readGuestSessionId()
  const device = deviceId
    ? await db.deviceSession.findUnique({ where: { id: deviceId }, select: { tableRunId: true } })
    : null
  if (!device) redirect(`/t/${qrToken}`)

  const drafted = String(formData.get('draft') ?? '').trim().length > 0
  const now = new Date()

  await db.reviewPrompt.updateMany({
    where: { tableRunId: device.tableRunId, handedOffAt: null },
    data: { handedOffAt: now, ...(drafted ? { draftedAt: now } : {}) },
  })

  const venue = await db.venue.findUniqueOrThrow({
    where: { id: scan.venueId },
    select: { googlePlaceId: true },
  })
  if (!venue.googlePlaceId) redirect(`/t/${qrToken}`)

  redirect(buildWriteReviewUrl(venue.googlePlaceId))
}
