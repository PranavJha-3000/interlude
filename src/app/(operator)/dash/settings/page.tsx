import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { getOperatorWithoutVenue } from '@/lib/operator-session'
import { buildWriteReviewUrl } from '@/core/review/link'
import { updateGooglePlace, updateRoleCodes } from './actions'

export const dynamic = 'force-dynamic'

/**
 * Venue settings — the fields that are neither the menu nor the fences.
 *
 * It exists for one that was missing entirely. `Venue.googlePlaceId` was read
 * by the review screen and written by nothing, so on any real deployment it was
 * always null: the hand-off button never rendered, and the review funnel would
 * have reported 100% shown and 0% handed off as though that were a fact about
 * guests rather than a missing form field.
 *
 * Deliberately not a step in the onboarding wizard. A Place ID has to be looked
 * up, and the menu step is already where setup gets abandoned — this belongs
 * somewhere an owner can reach on a quiet afternoon.
 */

const INPUT = 'mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3 font-mono text-base'
const LABEL = 'block text-sm text-muted'
const SECTION = 'mt-8 rounded-2xl border border-line p-5'
const SAVE = 'mt-5 min-h-11 rounded-xl border-2 border-line px-5 text-sm font-semibold'

const ERRORS: Record<string, string> = {
  short_link: en.dash.settings.review.errShortLink,
  not_a_place_id: en.dash.settings.review.errNotPlaceId,
  role_code_length: en.dash.settings.roleCodes.errLength,
  role_code_nothing: en.dash.settings.roleCodes.nothing,
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>
}) {
  const operator = await getOperatorWithoutVenue()
  if (!operator) redirect('/signin')
  if (!operator.venueId)
    return (
      <Shell>
        <p className="text-lg text-muted">{en.dash.empty}</p>
      </Shell>
    )

  const { error, saved } = await searchParams

  const venue = await db.venue.findUniqueOrThrow({
    where: { id: operator.venueId },
    select: { googlePlaceId: true, adminPinHash: true, staffPinHash: true },
  })

  const s = en.dash.settings

  return (
    <Shell>
      <p className="text-lg text-muted">{s.body}</p>

      {saved && <p className="mt-4 text-sm text-good">{s.saved}</p>}
      {error && <p className="mt-4 text-sm text-bad">{ERRORS[error] ?? s.review.errNotPlaceId}</p>}

      <section className={SECTION}>
        <h2 className="text-lg font-semibold">{s.review.heading}</h2>
        <p className="mt-2 text-sm text-muted">{s.review.body}</p>

        <p className={`mt-4 text-sm ${venue.googlePlaceId ? 'text-good' : 'text-muted'}`}>
          {venue.googlePlaceId ? s.review.linked : s.review.notLinked}
        </p>

        <form action={updateGooglePlace} className="mt-5">
          <label htmlFor="googlePlaceId" className={LABEL}>
            {s.review.label}
          </label>
          <input
            id="googlePlaceId"
            name="googlePlaceId"
            defaultValue={venue.googlePlaceId ?? ''}
            placeholder={s.review.placeholder}
            className={INPUT}
          />
          <p className="mt-2 text-sm text-muted">{s.review.help}</p>
          <p className="mt-1 text-sm text-muted">{s.review.clearHint}</p>
          <a
            href={s.review.finderUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-sm underline"
          >
            {s.review.finderLink}
          </a>

          <button type="submit" className={SAVE}>
            {s.save}
          </button>
        </form>

        {/* The exact URL a guest is sent to. A wrong Place ID fails silently
            everywhere else — it points at somebody else's restaurant and
            nothing errors — so the only way to catch it is to look. */}
        {venue.googlePlaceId && (
          <div className="mt-6 border-t border-line pt-4">
            <p className={LABEL}>{s.review.preview}</p>
            <a
              href={buildWriteReviewUrl(venue.googlePlaceId)}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block font-mono text-sm break-all underline"
            >
              {buildWriteReviewUrl(venue.googlePlaceId)}
            </a>
          </div>
        )}
      </section>

      <section className={SECTION}>
        <h2 className="text-lg font-semibold">{s.roleCodes.heading}</h2>
        <p className="mt-2 text-sm text-muted">{s.roleCodes.body}</p>

        <p className="mt-4 text-sm">
          <span className="text-muted">{s.roleCodes.adminLabel}: </span>
          {venue.adminPinHash ? (
            <span className="text-good">{s.roleCodes.adminSet}</span>
          ) : (
            <span className="text-muted">{s.roleCodes.adminNotSet}</span>
          )}
        </p>
        <p className="mt-1 text-sm">
          <span className="text-muted">{s.roleCodes.staffLabel}: </span>
          {venue.staffPinHash ? (
            <span className="text-good">{s.roleCodes.staffSet}</span>
          ) : (
            <span className="text-muted">{s.roleCodes.staffNotSet}</span>
          )}
        </p>

        <form action={updateRoleCodes} className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="adminCode" className={LABEL}>
              {s.roleCodes.adminLabel}
            </label>
            <input
              id="adminCode"
              name="adminCode"
              type="text"
              autoComplete="off"
              minLength={4}
              maxLength={12}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="staffCode" className={LABEL}>
              {s.roleCodes.staffLabel}
            </label>
            <input
              id="staffCode"
              name="staffCode"
              type="text"
              autoComplete="off"
              minLength={4}
              maxLength={12}
              className={INPUT}
            />
          </div>
          <p className="text-sm text-muted sm:col-span-2">{s.roleCodes.help}</p>
          <button type="submit" className={SAVE}>
            {s.save}
          </button>
        </form>
      </section>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="mb-2 text-xs tracking-widest text-muted uppercase">
        {en.dash.settings.heading}
      </h1>
      {children}
    </main>
  )
}
