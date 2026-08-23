import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { readGuestSessionId } from '@/lib/session'
import { resolveScan } from '@/lib/service'
import { shouldShowReviewPrompt } from '@/core/review/prompt'
import { markReviewOpened, markReviewShown } from '@/lib/review-funnel'
import { Body, guestViewport, Heading, Screen } from '../ui'

// Local const, never a re-export — see the note in ../page.tsx.
export const viewport = guestViewport
import { recordReviewHandOff } from './actions'

export const dynamic = 'force-dynamic'

/**
 * The review prompt (§7.2).
 *
 * Structurally separated from rewards: this route is forbidden by ESLint from
 * importing prize, award, game or mechanic state — see
 * `interlude/review-screen-isolation` — so no branch here *can* consult a win.
 * It renders identically for a table that never played, played and lost, or
 * played and won, and `shouldShowReviewPrompt` is deliberately a function that
 * cannot branch on anything but "is the visit at its end".
 *
 * The guest's words never touch our database. They draft on their own screen,
 * copy their own text, and paste it into Google's own dialog — we record that
 * a hand-off happened, never what it said. No rating field exists anywhere on
 * this path, and a schema test keeps it that way.
 */
export default async function ReviewPage({ params }: { params: Promise<{ qrToken: string }> }) {
  const { qrToken } = await params
  const scan = await resolveScan(qrToken)

  if (scan.kind === 'UNKNOWN_TABLE') notFound()
  if (scan.kind === 'NO_SERVICE' || scan.kind === 'BLOCKED') {
    return (
      <Screen venueName={scan.venueName}>
        <Heading>{en.guest.closed.heading}</Heading>
        <Body>{en.guest.closed.body}</Body>
      </Screen>
    )
  }

  const deviceId = await readGuestSessionId()
  const device = deviceId
    ? await db.deviceSession.findUnique({ where: { id: deviceId }, include: { tableRun: true } })
    : null
  if (!device || device.tableRun.serviceId !== scan.serviceId) redirect(`/t/${qrToken}`)

  // `atBill: true` — reaching this screen is the table wrapping up. The
  // function exists so the condition has exactly one input.
  if (!shouldShowReviewPrompt({ tableRunId: device.tableRunId, serviceId: scan.serviceId, atBill: true })) {
    redirect(`/t/${qrToken}`)
  }

  // Funnel counts, nothing else. `markReviewShown` is idempotent, so a guest
  // who reaches this screen by direct URL without ever seeing the entry link
  // gets both stamped in one request — which is the honest record.
  await markReviewShown(device.tableRunId, scan.serviceId)
  await markReviewOpened(device.tableRunId)

  const venue = await db.venue.findUniqueOrThrow({
    where: { id: scan.venueId },
    select: { googlePlaceId: true },
  })

  return (
    <Screen venueName={scan.venueName} tableLabel={scan.tableLabel}>
      <Heading>{en.guest.review.heading}</Heading>
      <Body>{en.guest.review.body}</Body>

      <form action={recordReviewHandOff} className="mt-6 flex flex-1 flex-col">
        <input type="hidden" name="qrToken" value={qrToken} />
        <label htmlFor="draft" className="block text-sm text-muted">
          {en.guest.review.draftLabel}
        </label>
        <textarea
          id="draft"
          name="draft"
          rows={6}
          placeholder={en.guest.review.draftPlaceholder}
          className="mt-2 w-full rounded-xl border border-line bg-paper p-4 text-lg"
        />
        <p className="mt-3 text-sm text-muted">{en.guest.review.copyHint}</p>

        <div className="mt-auto pt-8">
          {venue.googlePlaceId ? (
            <button
              type="submit"
              className="min-h-14 w-full rounded-xl bg-ink text-lg font-semibold text-paper active:bg-accent"
            >
              {en.guest.review.handOff}
            </button>
          ) : (
            <p className="text-center text-base text-muted">{en.guest.review.noPlaceId}</p>
          )}
          {/* The second of exactly two buttons (REVAMP-BRIEF.md Part 6): a
              plain way out, attached to nothing, promising nothing. */}
          <a
            href={`/t/${qrToken}`}
            className="transition-state mt-3 flex min-h-14 w-full items-center justify-center rounded-xl border-2 border-line text-lg font-medium active:border-ink"
          >
            {en.guest.review.decline}
          </a>
        </div>
      </form>
    </Screen>
  )
}
