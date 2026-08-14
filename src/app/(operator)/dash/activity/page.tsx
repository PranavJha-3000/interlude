import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { formatPaise, guestPaysPaise } from '@/lib/money'
import { getOperatorWithoutVenue } from '@/lib/operator-session'
import { getOpenService } from '@/lib/service'
import { getServiceActivity, type ActivityRow } from '@/lib/activity'

export const dynamic = 'force-dynamic'

/**
 * Which table scanned, what they played, and whether staff confirmed the prize.
 *
 * Anonymous by construction — a row is a table and a session, never a person.
 */
export default async function ActivityPage() {
  // Venue-less is a signed-in state, not a signed-out one: signup and sign-in
  // are the same request, so a first-time operator has a valid session and no
  // venue. Bouncing them to /signin would send someone who *is* signed in to a
  // sign-in form. They get the same empty state /dash gives them.
  const operator = await getOperatorWithoutVenue()
  if (!operator) redirect('/signin')

  if (!operator.venueId) return <Empty />

  const venueId = operator.venueId

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  const service =
    (await getOpenService(venueId)) ??
    (await db.service.findFirst({
      where: { venueId },
      orderBy: { startedAt: 'desc' },
    }))

  if (!service) return <Empty />

  // Rendered in the venue's own timezone, never the server's. On Vercel the
  // server is UTC, which would stamp every scan 5h30m early on a page whose
  // entire job is "which table, when".
  const [{ rows, controlTableLabels, funnel }, venue] = await Promise.all([
    getServiceActivity(service.id, venueId, now),
    db.venue.findUniqueOrThrow({ where: { id: venueId }, select: { timezone: true } }),
  ])
  const tz = venue.timezone

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="text-xs tracking-widest text-muted uppercase">{en.dash.activity.heading}</h1>
      <p className="mt-2 text-lg tabular-nums">{en.dash.activity.funnel(funnel)}</p>

      {rows.length === 0 ? (
        <p className="mt-10 text-lg text-muted">{en.dash.activity.empty}</p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs tracking-wide text-muted uppercase">
              <tr>
                <th className="py-2 pr-4">{en.dash.activity.colTable}</th>
                <th className="py-2 pr-4">{en.dash.activity.colScanned}</th>
                <th className="py-2 pr-4">{en.dash.activity.colGame}</th>
                <th className="py-2 pr-4">{en.dash.activity.colResult}</th>
                <th className="py-2">{en.dash.activity.colClaimed}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sessionId} className="border-t border-line align-top">
                  <td className="py-3 pr-4 font-mono text-lg font-semibold tabular-nums">
                    {r.tableLabel}
                  </td>
                  <td className="py-3 pr-4 font-mono tabular-nums text-muted">
                    {timeOf(r.scannedAt, tz)}
                  </td>
                  <td className="py-3 pr-4">{gameLabel(r.mechanic)}</td>
                  <td className="py-3 pr-4 font-mono tabular-nums">{resultLabel(r)}</td>
                  <td className="py-3 font-mono tabular-nums">{claimLabel(r, tz)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {controlTableLabels.length > 0 && (
        <section className="mt-10 rounded-2xl border border-line bg-warm p-5">
          <p className="text-sm text-muted">{en.dash.activity.controlNote}</p>
          <p className="mt-2 font-mono text-lg tabular-nums">{controlTableLabels.join(' · ')}</p>
        </section>
      )}
    </main>
  )
}

function Empty() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="mb-8 text-xs tracking-widest text-muted uppercase">
        {en.dash.activity.heading}
      </h1>
      <p className="text-lg text-muted">{en.dash.empty}</p>
    </main>
  )
}

function timeOf(d: Date, timezone: string): string {
  return d.toLocaleTimeString('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  })
}

function gameLabel(mechanic: ActivityRow['mechanic']): string {
  // Old rows keep their old names — history stays legible after retirement.
  if (mechanic === 'KITCHEN_ROUND') return en.dash.activity.gameKitchenRound
  if (mechanic === 'MYSTERY_PLATE') return en.dash.activity.gameMysteryPlate
  if (mechanic === 'BEAT_THE_KITCHEN') return en.dash.games.beatTheKitchen
  return en.common.none
}

function resultLabel(r: ActivityRow): string {
  if (r.mechanic === null) return en.dash.activity.notPlayed
  if (!r.completed) return en.dash.activity.inProgress

  const score = en.dash.activity.scoreLine(r.score ?? 0, r.maxScore ?? 0)
  if (!r.awardItemName || !r.awardKind) return score

  const pays = guestPaysPaise(
    r.awardKind,
    r.awardItemPricePaise ?? 0,
    r.awardPercentOff ?? undefined,
    r.awardFixedPricePaise ?? undefined
  )
  const depth = r.awardKind === 'FREE' ? en.dash.activity.free : formatPaise(pays)
  return `${score} · ${r.awardItemName}, ${depth}`
}

function claimLabel(r: ActivityRow, timezone: string): string {
  if (r.awardStatus === null) return en.common.none
  if (r.awardStatus === 'CONFIRMED') {
    return r.confirmedAt
      ? en.dash.activity.claimedAt(timeOf(r.confirmedAt, timezone))
      : en.dash.activity.claimedMark
  }
  return en.dash.activity.pending
}
