import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { readGuestSessionId } from '@/lib/session'
import { resolveScan } from '@/lib/service'
import { Body, Heading, Screen } from '../ui'
import { submitFeedback } from './actions'

export const dynamic = 'force-dynamic'

/**
 * Private feedback to the restaurant.
 *
 * **Deliberately not the same screen as the Google prompt, and it never links
 * to it.** `core/review/prompt.ts` states the rule: first-party feedback may
 * carry a rating and may grant a life; the Google prompt may do neither, and
 * they must not share a surface. Sharing one is how "they rated us 2, skip the
 * Google prompt" becomes a single `if` — sentiment gating through the back door.
 *
 * Zero client components. The rating is radio inputs inside the same form, so
 * it costs no JavaScript.
 */
export default async function FeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ qrToken: string }>
  searchParams: Promise<{ done?: string; life?: string; error?: string }>
}) {
  const { qrToken } = await params
  const { done, life, error } = await searchParams

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

  if (done) {
    return (
      <Screen venueName={scan.venueName} tableLabel={scan.tableLabel}>
        <Heading>{life ? en.guest.feedback.doneLife : en.guest.feedback.done}</Heading>
        <div className="mt-auto pt-8">
          <a href={`/t/${qrToken}`} className="block text-center text-base underline">
            {en.guest.back}
          </a>
        </div>
      </Screen>
    )
  }

  return (
    <Screen venueName={scan.venueName} tableLabel={scan.tableLabel}>
      <Heading>{en.guest.feedback.heading}</Heading>
      <Body>{en.guest.feedback.body}</Body>

      {error && <p className="mt-4 text-sm text-bad">{en.guest.feedback.empty}</p>}

      <form action={submitFeedback} className="mt-6 flex flex-1 flex-col">
        <input type="hidden" name="qrToken" value={qrToken} />

        <label htmlFor="body" className="block text-sm text-muted">
          {en.guest.feedback.label}
        </label>
        <textarea
          id="body"
          name="body"
          rows={6}
          required
          placeholder={en.guest.feedback.placeholder}
          className="mt-2 w-full rounded-xl border border-line bg-paper p-4 text-lg"
        />

        <fieldset className="mt-6">
          <legend className="text-sm text-muted">{en.guest.feedback.ratingLabel}</legend>
          <div className="mt-2 flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <label
                key={n}
                className="flex min-h-14 flex-1 items-center justify-center rounded-xl border border-line font-mono text-lg tabular-nums has-checked:border-ink has-checked:bg-ground-cotton"
              >
                <input type="radio" name="rating" value={n} className="sr-only" />
                {n}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-auto pt-8">
          <button
            type="submit"
            className="min-h-14 w-full rounded-xl bg-ink text-lg font-semibold text-paper"
          >
            {en.guest.feedback.submit}
          </button>
        </div>
      </form>
    </Screen>
  )
}
