import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { formatPaise } from '@/lib/money'
import { readStaffSession } from '@/lib/staff-session'
import { getOperatorWithoutVenue } from '@/lib/operator-session'
import { getOpenService } from '@/lib/service'
import { getDashboardData } from '@/lib/dashboard'

export const dynamic = 'force-dynamic'

/**
 * The owner dashboard (§9.4).
 *
 * Leads with one number — **net contribution in rupees**, in the mono, at
 * display size. Not plays, not scans, not engagement. An operator does not
 * renew because people had fun; he renews because the night was worth more than
 * it cost.
 *
 * Three rules here are the spec's, not preferences:
 *
 * - **No accent anywhere on this screen.** Money is not a promotion, so a
 *   positive figure stays `ink` and stays in the mono. Only a negative figure
 *   earns the loss colour and the display face — the one time this screen is
 *   allowed to raise its voice.
 * - **The tiers are told apart by label and a dashed underline, never by
 *   colour,** and are never merged or averaged into one figure.
 * - **The refusal log reads louder than the acceptance.** That inversion is the
 *   product: the pitch is restraint, so what the engine refused is the
 *   interesting column and is the one set in full ink.
 */
export default async function DashPage() {
  // Staff lose access to /dash — a server must never be shown a metric
  // (PLATFORM.md §3). Only an operator's own session gets in; a staff session
  // that lands here is sent back to the floor, not shown a partial dashboard.
  const operator = await getOperatorWithoutVenue()
  if (!operator) {
    const staff = await readStaffSession()
    if (staff) redirect('/floor')
    redirect('/signin')
  }

  // A brand-new operator has a session but no venue yet, because signing up and
  // creating a venue are deliberately separate — the second one is abandonable.
  if (!operator.venueId) redirect('/onboarding')

  const venueId = operator.venueId

  // Half-finished setup goes back to where it stopped. The cursor lives on the
  // venue row rather than in the browser, so this is the same screen on the
  // phone they abandoned it on and the laptop they came back to.
  const setup = await db.venue.findUnique({
    where: { id: venueId },
    select: { onboardingStep: true },
  })
  if (setup && setup.onboardingStep !== 'DONE') redirect('/onboarding')

  const service = await getOpenService(venueId)
  const target =
    service ?? (await db.service.findFirst({ where: { venueId }, orderBy: { startedAt: 'desc' } }))

  if (!target) {
    return (
      <Shell>
        <p className="text-lg text-muted">{en.dash.empty}</p>
      </Shell>
    )
  }

  const data = await getDashboardData(venueId, target.id)
  const money = data.contribution
  const negative = money.netContributionPaise < 0
  const posBacked = data.tier === 'POS_BACKED'

  return (
    <Shell>
      {/* One number, large, in the mono. The tier chip sits beside it, so the
          figure is never read without knowing what produced it. */}
      <section>
        <div className="flex flex-wrap items-baseline gap-3">
          <p className="text-sm tracking-wide text-muted uppercase">{en.dash.tier1.headline}</p>
          <span className="border-b border-dashed border-ink-warm text-xs tracking-wide text-ink-warm uppercase">
            {posBacked ? en.dash.tier.posBacked : en.dash.tier.appEstimate}
          </span>
        </div>

        {/* The face is conditional, not stacked: `font-mono font-display` in
            one class list leaves the winner to stylesheet order. A positive
            figure is the instrument (mono, tabular); a negative one earns the
            display face and the loss colour — the one time this screen raises
            its voice. */}
        <p
          className={`mt-1 text-6xl ${
            negative
              ? 'font-display text-loss'
              : 'font-mono font-semibold text-ink tabular-nums'
          }`}
        >
          {formatPaise(money.netContributionPaise)}
        </p>

        {/* What the figure can and cannot see, in plain language, with a link
            to edit the assumption behind it. */}
        <p className="mt-4 max-w-prose text-sm leading-relaxed text-muted">
          {posBacked ? en.dash.tier.posCaveat : en.dash.tier.appCaveat}{' '}
          <a href="/dash/prizes" className="underline underline-offset-2">
            {en.dash.tier.editAssumption}
          </a>
        </p>

        {/* A negative night is a trade the operator made, not an error — so it
            is explained rather than hidden, and the explanation points at the
            log that shows the decision. */}
        {data.negativeReason && (
          <p className="mt-4 max-w-prose rounded-xl border border-line bg-warm p-4 text-sm leading-relaxed">
            {data.negativeReason}{' '}
            <a href="#refusals" className="underline underline-offset-2">
              {en.dash.refusals.link}
            </a>
          </p>
        )}
      </section>

      {/* ── The refusal log — the hero, not a panel at the bottom (Part 6).
          What the engine refused is the product argument rendered as layout:
          the refused column takes two thirds of the width, its reasons at
          full size in the mono — the system talking — while the cleared list
          sits compact. A stranger given three seconds should come away
          thinking this software says no for a living. ───────────────────── */}
      <section id="refusals" className="mt-10">
        <div className="grid gap-8 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <h2 className="text-sm font-semibold tracking-wide text-ink-warm uppercase">
              {en.dash.refusals.refusedHeading}
            </h2>
            <ul className="mt-3 grid gap-3">
              {data.pool.refused.length === 0 && (
                <li className="text-sm text-muted">{en.dash.refusals.none}</li>
              )}
              {data.pool.refused.map((r, i) => (
                <li key={i} className="border-b border-line pb-3">
                  <span className="text-sm text-muted line-through">{r.item}</span>
                  {r.why && (
                    <p className="mt-0.5 font-mono text-base leading-snug text-ink">{r.why}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-sm tracking-wide text-muted uppercase">
              {en.dash.refusals.clearedHeading}
            </h2>
            <ul className="mt-3 grid gap-2">
              {data.pool.cleared.length === 0 && (
                <li className="text-xs text-muted">{en.dash.refusals.none}</li>
              )}
              {data.pool.cleared.map((c, i) => (
                <li key={i} className="border-b border-line pb-2 text-xs">
                  <span className="text-ink-warm">{c.item}</span>
                  {c.why && <span className="block font-mono text-muted">{c.why}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-10 grid grid-cols-2 gap-3">
        <Stat label={en.dash.tier1.addOnGross} value={formatPaise(money.addOnGrossPaise)} />
        <Stat
          label={en.dash.tier1.addOnContribution}
          value={formatPaise(money.addOnContributionPaise)}
        />
        <Stat label={en.dash.tier1.prizeCost} value={formatPaise(money.prizeCostPaise)} />
        <Stat label={en.dash.tier1.redemptions} value={String(money.awardCount)} />
      </section>

      {/* The other tier, always visible, never averaged with the headline. */}
      <section className="mt-10 rounded-2xl border border-line bg-warm p-5">
        <p className="inline-block border-b border-dashed border-muted text-sm tracking-wide text-muted uppercase">
          {posBacked ? en.dash.tier.appEstimate : en.dash.tier.posBacked}
        </p>
        {posBacked ? (
          <p className="mt-2 font-mono text-2xl tabular-nums">
            {formatPaise(money.netContributionPaise)}
          </p>
        ) : (
          <p className="mt-2 text-2xl text-muted">{en.dash.tier2.pending}</p>
        )}
        <p className="mt-2 text-sm text-muted">
          {posBacked ? en.dash.tier.billsCounted(data.pos.billCount) : en.dash.tier2.comparison}
        </p>
      </section>

      {/* The ledger — one row per table that cost or earned something. */}
      {data.ledger.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm tracking-wide text-muted uppercase">{en.dash.ledger.heading}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-warm text-left text-xs tracking-wide text-ink-warm uppercase">
                  <th className="py-2 pr-3 font-medium">{en.dash.ledger.time}</th>
                  <th className="py-2 pr-3 font-medium">{en.dash.ledger.table}</th>
                  <th className="py-2 pr-3 font-medium">{en.dash.ledger.result}</th>
                  <th className="py-2 pr-3 font-medium">{en.dash.ledger.prize}</th>
                  <th className="py-2 pr-3 text-right font-medium">{en.dash.ledger.prizeCost}</th>
                  <th className="py-2 pr-3 text-right font-medium">{en.dash.ledger.extraSpend}</th>
                  <th className="py-2 text-right font-medium">{en.dash.ledger.net}</th>
                </tr>
              </thead>
              <tbody>
                {data.ledger.map((r, i) => (
                  <tr key={`${r.tableLabel}-${i}`} className="border-b border-line">
                    <td className="py-2 pr-3 font-mono tabular-nums">
                      {new Date(r.atMs).toLocaleTimeString('en-IN', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2 pr-3 font-mono tabular-nums">{r.tableLabel}</td>
                    <td className="py-2 pr-3">{r.result}</td>
                    <td className="py-2 pr-3">{r.prizeName ?? en.common.none}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">
                      {formatPaise(r.prizeCostPaise)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">
                      {formatPaise(r.extraSpendPaise)}
                    </td>
                    <td
                      className={`py-2 text-right font-mono tabular-nums ${
                        r.netPaise < 0 ? 'text-loss' : ''
                      }`}
                    >
                      {formatPaise(r.netPaise)}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 pr-3" colSpan={4}>
                    {en.dash.ledger.totals}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums">
                    {formatPaise(data.totals.prizeCostPaise)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums">
                    {formatPaise(data.totals.extraSpendPaise)}
                  </td>
                  <td
                    className={`py-2 text-right font-mono tabular-nums ${
                      data.totals.netPaise < 0 ? 'text-loss' : ''
                    }`}
                  >
                    {formatPaise(data.totals.netPaise)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      <details className="mt-10">
        <summary className="cursor-pointer text-sm text-muted">
          {en.dash.engagement.heading}
        </summary>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Stat label={en.dash.engagement.runs} value={String(data.metrics.runsOpened)} />
          <Stat label={en.dash.engagement.tented} value={String(data.metrics.tablesTented)} />
          <Stat
            label={en.dash.engagement.scanRate}
            value={
              data.metrics.scanRatePct === null ? en.common.none : `${data.metrics.scanRatePct}%`
            }
          />
          <Stat
            label={en.dash.engagement.completion}
            value={
              data.metrics.completionRatePct === null
                ? en.common.none
                : `${data.metrics.completionRatePct}%`
            }
          />
          <Stat
            label={en.dash.engagement.devicesPerRun}
            value={
              data.metrics.devicesPerRun === null
                ? en.common.none
                : String(data.metrics.devicesPerRun)
            }
          />
          {/* Food arriving is a success wearing a failure's clothes (§6.2), so
              it is reported separately from abandonment rather than folded in. */}
          <Stat
            label={en.dash.engagement.foodArrived}
            value={String(data.metrics.runEnds.foodArrived)}
          />
        </div>
      </details>

      {/* ── The review funnel (§7.2) ─────────────────────────────────────
          Counts only, and no rating — none is ever stored, which is what makes
          gating a public review on sentiment structurally impossible.
          No accent: money owns the accent on this screen, and a funnel is not
          money. */}
      <details className="mt-6">
        <summary className="cursor-pointer text-sm text-muted">
          {en.dash.reviewFunnel.heading}
        </summary>
        <p className="mt-3 text-sm text-muted">{en.dash.reviewFunnel.body}</p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat label={en.dash.reviewFunnel.shown} value={String(data.review.shown)} />
          <Stat label={en.dash.reviewFunnel.opened} value={String(data.review.opened)} />
          <Stat label={en.dash.reviewFunnel.handedOff} value={String(data.review.handedOff)} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Stat
            label={en.dash.reviewFunnel.openRate}
            value={data.review.openRatePct === null ? en.common.none : `${data.review.openRatePct}%`}
          />
          <Stat
            label={en.dash.reviewFunnel.handOffRate}
            value={
              data.review.handOffRatePct === null
                ? en.common.none
                : `${data.review.handOffRatePct}%`
            }
          />
        </div>
        {/* The honest limit, said on the screen rather than only in a doc. */}
        <p className="mt-3 text-xs text-muted">{en.dash.reviewFunnel.caveat}</p>
      </details>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-5 py-10">
      <h1 className="mb-8 text-xs tracking-widest text-muted uppercase">{en.dash.heading}</h1>
      {children}
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-warm p-4">
      <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 font-mono text-2xl tabular-nums">{value}</p>
    </div>
  )
}
