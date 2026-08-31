import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { getOperatorWithoutVenue } from '@/lib/operator-session'

export const dynamic = 'force-dynamic'

/**
 * What guests said, privately, to this restaurant.
 *
 * **The mirror of the review screen, and deliberately so.** The Google prompt
 * stores funnel timestamps and never a word or a rating; this stores both,
 * because it goes to the owner and never anywhere public. Keeping them apart is
 * what makes gating a public review on sentiment structurally impossible rather
 * than merely against the rules (§7.2) — and ESLint forbids either route from
 * importing the other.
 *
 * Venue comes from the session, never a parameter. `VenueFeedback` has no
 * `venueId` of its own, so the scope is the join through `Service`.
 */
export default async function FeedbackPage() {
  // Venue-less is a signed-in state, not a signed-out one — same reasoning as
  // /dash/activity: signup and sign-in are one request.
  const operator = await getOperatorWithoutVenue()
  if (!operator) redirect('/signin')
  if (!operator.venueId) return <Shell>{<p className="text-lg text-muted">{en.dash.empty}</p>}</Shell>

  const venueId = operator.venueId

  const [rows, venue] = await Promise.all([
    db.venueFeedback.findMany({
      // The tenancy boundary. A feedback row reaches its venue only through the
      // service, so that join *is* the authorisation.
      where: { service: { venueId } },
      orderBy: { submittedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        body: true,
        rating: true,
        submittedAt: true,
        tableRun: { select: { table: { select: { label: true } } } },
      },
    }),
    db.venue.findUniqueOrThrow({ where: { id: venueId }, select: { timezone: true } }),
  ])

  // The venue's own timezone, never the server's. On Vercel the server is UTC,
  // which would stamp every note 5h30m early.
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: venue.timezone,
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  })

  return (
    <Shell>
      <p className="text-lg text-muted">{en.dash.feedback.body}</p>

      {rows.length === 0 ? (
        <p className="mt-8 text-base text-muted">{en.dash.feedback.empty}</p>
      ) : (
        <>
          <p className="mt-6 font-mono text-xs text-muted">
            {en.dash.feedback.count(rows.length)}
          </p>
          <ul className="mt-4">
            {rows.map((row) => (
              <li key={row.id} className="border-t border-line py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-xs text-muted">
                    {row.tableRun?.table
                      ? en.dash.feedback.table(row.tableRun.table.label)
                      : en.dash.feedback.noTable}
                    {' · '}
                    {time.format(row.submittedAt)}
                  </span>
                  <span className="font-mono text-xs">
                    {row.rating === null
                      ? en.dash.feedback.noRating
                      : en.dash.feedback.rating(row.rating)}
                  </span>
                </div>
                <p className="mt-2 text-base whitespace-pre-wrap">{row.body}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="mb-2 text-xs tracking-widest text-muted uppercase">
        {en.dash.feedback.heading}
      </h1>
      {children}
    </main>
  )
}
