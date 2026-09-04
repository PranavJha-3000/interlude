import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { formatPaise, guestPaysPaise } from '@/lib/money'
import { getOperatorWithoutVenue } from '@/lib/operator-session'
import { getOpenService } from '@/lib/service'
import { getServiceActivity, type ActivityRow } from '@/lib/activity'
import { miniGames } from '@/strings/mini-games'

export const dynamic = 'force-dynamic'

/**
 * Which table scanned, what they played, and whether staff confirmed the prize.
 *
 * Anonymous by construction — a row is a table and a session, never a person.
 *
 * The page now carries the granular story the dashboard hides: a 15-minute
 * scan timeline so an operator can see whether guests are arriving in pulses
 * or steadily, a per-mechanic breakdown so they can see which game the room
 * is actually playing, and the add-on total so a quiet prize board still
 * surfaces the upsell it caused. Numbers are read off the same service rows
 * the funnel uses, not a separate count.
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
  const [activity, venue] = await Promise.all([
    getServiceActivity(service.id, venueId, now),
    db.venue.findUniqueOrThrow({ where: { id: venueId }, select: { timezone: true } }),
  ])
  const tz = venue.timezone

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="text-xs tracking-widest text-muted uppercase">{en.dash.activity.heading}</h1>
      <p className="mt-2 text-lg tabular-nums">{en.dash.activity.funnel(activity.funnel)}</p>

      {/* ── Summary cards: a glance's worth of the granular numbers. ──────── */}
      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label={en.dash.activity.mechanicHeading}
          value={
            activity.mechanicBreakdown.length === 0
              ? en.dash.activity.mechanicNone
              : activity.mechanicBreakdown
                  .slice(0, 3)
                  .map((m) => `${mechanicLabel(m.mechanic)} ${m.count}`)
                  .join(' · ')
          }
        />
        <SummaryCard
          label={en.dash.activity.addOnHeading}
          value={
            activity.addOns.requested === 0
              ? en.dash.activity.noAddOns
              : en.dash.activity.addOnLine(activity.addOns.requested, activity.addOns.confirmed)
          }
          sub={
            activity.addOns.confirmed > 0
              ? en.dash.activity.addOnTotal(formatPaise(activity.addOns.totalPaise))
              : undefined
          }
        />
        <SummaryCard
          label={en.dash.metrics.tablesEngaged}
          value={String(activity.funnel.scannedTables)}
        />
      </section>

      {/* ── Scan timeline: when in the night did guests actually tap? ────── */}
      <section className="mt-10">
        <h2 className="text-sm tracking-wide text-muted uppercase">
          {en.dash.activity.timelineHeading}
        </h2>
        {activity.scanTimeline.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{en.dash.activity.timelineEmpty}</p>
        ) : (
          <ScanTimeline
            buckets={activity.scanTimeline}
            firstScanAt={activity.firstScanAt}
            lastScanAt={activity.lastScanAt}
            timezone={tz}
          />
        )}
      </section>

      {/* ── Session table: per-row detail. Kept last so the summary reads
           first; the table is the answer, the chart is the question. ──── */}
      {activity.rows.length === 0 ? (
        <p className="mt-10 text-lg text-muted">{en.dash.activity.empty}</p>
      ) : (
        <div className="mt-10 overflow-x-auto">
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
              {activity.rows.map((r) => (
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

      {/*
        Control table panel — kept at the foot of the page, deliberately less
        prominent than before. Before, it sat in a coloured "warm" card above
        the fold; here it only renders once there *are* scans, and even then
        in muted text. A control table's identity is the experiment, not the
        operator's problem to solve.
      */}
      {activity.controlTableLabels.length > 0 && activity.rows.length > 0 && (
        <section className="mt-10">
          <p className="text-xs tracking-wide text-muted uppercase">
            {en.dash.activity.controlNote}
          </p>
          <p className="mt-2 font-mono text-sm text-muted tabular-nums">
            {activity.controlTableLabels.join(' · ')}
          </p>
        </section>
      )}
    </main>
  )
}

function Empty() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="mb-8 text-xs tracking-widest text-muted uppercase">
        {en.dash.activity.heading}
      </h1>
      <p className="text-lg text-muted">{en.dash.empty}</p>
    </main>
  )
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-xl border border-line bg-warm p-4">
      <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 font-mono text-base tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  )
}

/**
 * A bar chart, deliberately drawn with CSS: no chart library exists in this
 * repo, and the four facts this screen needs (a bucket has any scans, the
 * height is the count, the labels are timestamps) do not earn one.
 *
 * Each bar is a `<div>` whose height is a percentage of the largest bucket
 * in the window. The largest bucket is read off `buckets`, not off
 * `maxCount`, so adding new buckets in flight never re-flows the existing
 * ones — only the newest one grows.
 */
function ScanTimeline({
  buckets,
  firstScanAt,
  lastScanAt,
  timezone,
}: {
  buckets: Array<{ startMs: number; endMs: number; count: number }>
  firstScanAt: Date | null
  lastScanAt: Date | null
  timezone: string
}) {
  const max = buckets.reduce((m, b) => Math.max(m, b.count), 1)
  const startLabel = firstScanAt ? timeOf(firstScanAt, timezone) : ''
  const endLabel = lastScanAt ? timeOf(lastScanAt, timezone) : ''

  return (
    <div className="mt-3">
      <p className="text-xs text-muted">
        {en.dash.activity.timelineAxis(startLabel, endLabel)}
      </p>
      <div className="mt-3 flex h-32 items-end gap-1">
        {buckets.map((b) => (
          <div
            key={b.startMs}
            className="flex-1 rounded-t bg-ink-warm"
            style={{ height: `${Math.max(2, Math.round((b.count / max) * 100))}%` }}
            aria-label={`${timeOf(new Date(b.startMs), timezone)}: ${b.count} scans`}
            title={`${timeOf(new Date(b.startMs), timezone)} – ${timeOf(new Date(b.endMs - 1), timezone)} · ${b.count}`}
          />
        ))}
      </div>
    </div>
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
  if (mechanic === 'SECRET_RECIPE') return miniGames.secretRecipe.title
  if (mechanic === 'MYSTERY_CUSTOMER') return miniGames.mysteryCustomer.title
  return en.common.none
}

function mechanicLabel(mechanic: ActivityRow['mechanic']): string {
  return gameLabel(mechanic)
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
