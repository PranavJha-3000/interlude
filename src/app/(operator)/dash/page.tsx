import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { formatPaise } from '@/lib/money'
import { readStaffSession } from '@/lib/staff-session'
import { getOperatorWithoutVenue } from '@/lib/operator-session'
import { getConcededSoFarPaise, getEnabledGames, getOpenService } from '@/lib/service'
import { getDashboardData } from '@/lib/dashboard'
import { narrationDraftViews } from '@/lib/ai-drafts'
import { NarrationCard } from '../ai-assist-ui'
import { startService, endService } from './actions'
import { miniGames } from '@/strings/mini-games'
import {
  approveNarrationDraft,
  editNarrationDraft,
  generateNarration,
  rejectNarrationDraft,
} from './ai-actions'
import { SubmitButton } from '../../(staff)/SubmitButton'
import { RunningSince } from './RunningSince'

export const dynamic = 'force-dynamic'

/**
 * The owner dashboard (§9.4) — the command center.
 *
 * Leads with one number — **net contribution in rupees**, in the mono, at
 * display size — and orders the rest the way an operator needs it: whether
 * tonight is running, the compact counts beside the headline, the service
 * card, quick links into Manage, then the refusal log as hero and the ledger.
 * Not plays, not scans, not engagement: an operator does not renew because
 * people had fun; he renews because the night was worth more than it cost.
 *
 * Rules here that are the spec's, not preferences:
 *
 * - **No accent anywhere on this screen.** Money is not a promotion, so a
 *   positive figure stays `ink` and stays in the mono. Only a negative figure
 *   earns the loss colour and the display face — the one time this screen is
 *   allowed to raise its voice. Start Service is `bg-ink` for the same reason.
 * - **The tiers are told apart by label and a dashed underline, never by
 *   colour,** and are never merged or averaged into one figure.
 * - **The refusal log reads louder than the acceptance.** That inversion is the
 *   product: the pitch is restraint, so what the engine refused is the
 *   interesting column and is the one set in full ink.
 * - **Every figure is real.** The compact row relabels counts the dashboard
 *   already computed; the activity preview reads the event log; the budget
 *   line is the same conceded total the engine fences against. Nothing is
 *   invented for the layout's sake (PLATFORM.md §10).
 */
export default async function DashPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; edit?: string }>
}) {
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
  // phone they abandoned it on and the laptop they came back to. The timezone
  // rides along: the status line stamps its time in the venue's own clock,
  // never the server's.
  const setup = await db.venue.findUnique({
    where: { id: venueId },
    select: { onboardingStep: true, timezone: true },
  })
  if (setup && setup.onboardingStep !== 'DONE') redirect('/onboarding')
  const tz = setup?.timezone ?? 'Asia/Kolkata'

  const service = await getOpenService(venueId)
  const target =
    service ?? (await db.service.findFirst({ where: { venueId }, orderBy: { startedAt: 'desc' } }))

  // Games and the depth cap are venue state, not service state — the service
  // card shows them whether or not tonight has started.
  const [enabledGames, configRow] = await Promise.all([
    getEnabledGames(venueId),
    db.venueConfig.findUnique({ where: { venueId }, select: { depthCapPerServicePaise: true } }),
  ])
  const concededPaise = target ? await getConcededSoFarPaise(target.id) : null

  const serviceStatus = service
    ? en.dash.service.running(clockTime(service.startedAt.getTime(), tz))
    : en.dash.empty

  const params = await searchParams
  const narrationDrafts = await narrationDraftViews(venueId, ['DRAFT'])
  const narrationMessage =
    params.error === 'ai_unavailable'
      ? en.dash.aiAssist.unavailable
      : params.error === 'ai_no_services'
        ? en.dash.aiAssist.noServices
        : params.error === 'ai_not_found'
          ? en.dash.aiAssist.nothing
          : params.error === 'ai_invalid'
            ? en.dash.aiAssist.generic
            : params.error
              ? en.dash.aiAssist.failed
              : undefined

  if (!target) {
    // A venue that has never run a service. The card and the quick links are
    // the whole screen — there is no number to show, and a row of zeros would
    // be a lie told to fill space.
    return (
      <Shell>
        <p className="text-lg">{serviceStatus}</p>
        <ServiceCard
          status={null}
          running={false}
          killed={false}
          games={enabledGames.map(mechanicLabel)}
          tablesEngaged={null}
        />
        <QuickActions />
      </Shell>
    )
  }

  const data = await getDashboardData(venueId, target.id)
  const money = data.contribution
  const negative = money.netContributionPaise < 0
  const posBacked = data.tier === 'POS_BACKED'

  return (
    <Shell>
      {/* ── 1 · Context ────────────────────────────────────────────────────
          Which night this is, and whether it is running. The command center's
          first line answers the operator's first question. The "running since"
          figure ticks on the client (see RunningSince) so the line never
          appears stuck. */}
      <p className="text-lg">
        {service ? (
          <RunningSince
            startedAtMs={service.startedAt.getTime()}
            timezone={tz}
            prefix="Running since "
          />
        ) : (
          serviceStatus
        )}
      </p>

      {/* ── 2 · The command row ───────────────────────────────────────────
          One number, large, in the mono. The tier chip sits beside it, so the
          figure is never read without knowing what produced it. Beside it, the
          compact counts — each a relabel of a figure this page already
          computed, in the priority the owner reads them: tables, rewards,
          add-ons. */}
      <section className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
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
              negative ? 'font-display text-loss' : 'font-mono font-semibold text-ink tabular-nums'
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
        </div>

        <div className="grid content-start gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <Stat label={en.dash.metrics.tablesEngaged} value={String(data.metrics.runsOpened)} />
          <Stat label={en.dash.metrics.rewardsClaimed} value={String(money.awardCount)} />
          <Stat label={en.dash.metrics.addOns} value={String(money.addOnCount)} />
        </div>
      </section>

      {/* ── 3 · Tonight's service card ────────────────────────────────────
          The operational section: is tonight running, what is on, and how far
          it has reached — with the one action this state calls for. */}
      <ServiceCard
        status={service ? null : serviceStatus}
        running={Boolean(service)}
        killed={service?.killedAt !== null && service?.killedAt !== undefined}
        games={enabledGames.map(mechanicLabel)}
        tablesEngaged={data.metrics.runsOpened}
      />

      {/* ── 4 · Quick actions ───────────────────────────────────────────── */}
      <QuickActions />

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

      {/* The money behind the headline. "Prizes redeemed" moved up into the
          compact row next to the headline — this grid is only what money is
          made of, so the same count does not appear twice on one screen. */}
      <section className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={en.dash.tier1.addOnGross} value={formatPaise(money.addOnGrossPaise)} />
        <Stat
          label={en.dash.tier1.addOnContribution}
          value={formatPaise(money.addOnContributionPaise)}
        />
        <Stat label={en.dash.tier1.prizeCost} value={formatPaise(money.prizeCostPaise)} />
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

      {/* ── 5 · Previews ────────────────────────────────────────────────────
          The night's event log, named for a reader who has never seen the
          schema, beside the budget the engine is actually spending against —
          the same conceded total the cap fences. Both read-only; both already
          computed. */}
      <section className="mt-10 grid gap-10 lg:grid-cols-2">
        <div>
          <h2 className="text-sm tracking-wide text-muted uppercase">{en.dash.recent.heading}</h2>
          {data.recent.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{en.dash.recent.empty}</p>
          ) : (
            <ul className="mt-3">
              {data.recent.map((e, i) => (
                <li
                  key={`${e.atMs}-${i}`}
                  className="flex items-baseline justify-between gap-4 border-b border-line py-2 text-sm"
                >
                  <span>{en.dash.recent.eventLabels[e.type] ?? e.type}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                    {clockTime(e.atMs, tz)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="text-sm tracking-wide text-muted uppercase">
            {en.dash.recent.budgetLabel}
          </h2>
          {concededPaise === null || !configRow ? (
            <p className="mt-3 text-sm text-muted">{en.common.none}</p>
          ) : (
            <>
              <p className="mt-3 font-mono text-3xl tabular-nums">
                {formatPaise(concededPaise)}
                <span className="text-lg text-muted">
                  {' '}
                  / {formatPaise(configRow.depthCapPerServicePaise)}
                </span>
              </p>
              <p className="mt-2 text-sm text-muted">{en.dash.recent.budgetNote}</p>
            </>
          )}
        </div>
      </section>

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
            value={
              data.review.openRatePct === null ? en.common.none : `${data.review.openRatePct}%`
            }
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

      {/* ── AI narration (§6a) — the week in the operator's own words. The AI
          narrates only the figures this page computed; a narration that invents
          one is refused before it reaches this card. ───────────────────── */}
      {narrationMessage && <p className="mt-6 text-sm text-bad">{narrationMessage}</p>}
      <NarrationCard
        drafts={narrationDrafts}
        generateAction={generateNarration}
        approveAction={approveNarrationDraft}
        rejectAction={rejectNarrationDraft}
        editAction={editNarrationDraft}
        editId={params.edit}
      />
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-6xl px-6 py-10">
      <h1 className="mb-6 text-xs tracking-widest text-muted uppercase">{en.dash.heading}</h1>
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

/** The venue's enabled mechanics, named as the games page names them. */
function mechanicLabel(mechanic: string): string {
  if (mechanic === 'BEAT_THE_KITCHEN') return en.dash.games.beatTheKitchen
  if (mechanic === 'KITCHEN_ROUND') return en.dash.games.kitchenRound
  if (mechanic === 'MYSTERY_PLATE') return en.dash.games.mysteryPlate
  if (mechanic === 'SECRET_RECIPE') return miniGames.secretRecipe.title
  if (mechanic === 'MYSTERY_CUSTOMER') return miniGames.mysteryCustomer.title
  return mechanic
}

/** A wall-clock time in the venue's own timezone — the only clock it knows. */
function clockTime(atMs: number, timezone: string): string {
  return new Date(atMs).toLocaleTimeString('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Tonight's service card: the operational section of the command center. It
 * shows the state and offers the one action the state calls for — Start
 * Service when idle, End Service when running. The Start button is ink, not
 * accent: money owns the accent ledger on this screen, and a control is not
 * money. End Service is a bordered, secondary control, also ink, with a
 * confirm step so a misclick does not close a live night.
 */
function ServiceCard({
  status,
  running,
  killed,
  games,
  tablesEngaged,
}: {
  status: string | null
  running: boolean
  killed: boolean
  games: string[]
  tablesEngaged: number | null
}) {
  return (
    <section className="mt-10 rounded-2xl border border-line bg-warm p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {status !== null && <p className="text-lg font-medium">{status}</p>}
        {running ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dash/activity"
              className="rounded-xl border border-ink px-4 py-2.5 text-sm font-medium transition-state hover:bg-ink hover:text-paper"
            >
              {en.dash.service.viewTonight}
            </Link>
            <form action={endService}>
              <SubmitButton
                type="submit"
                className="min-h-11 rounded-xl border-2 border-ink bg-paper px-4 text-sm font-semibold text-ink transition-state hover:bg-ink hover:text-paper"
                onClick={(event) => {
                  if (!window.confirm(en.dash.service.endConfirm)) event.preventDefault()
                }}
              >
                {en.dash.service.end}
              </SubmitButton>
            </form>
          </div>
        ) : (
          <form action={startService}>
            <SubmitButton
              type="submit"
              className="min-h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-paper transition-state active:bg-ink-warm"
            >
              {en.floor.service.start}
            </SubmitButton>
          </form>
        )}
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs tracking-wide text-muted uppercase">
            {en.dash.service.gamesLabel}
          </dt>
          <dd className="mt-1 text-sm">
            {games.length === 0 ? (
              <span className="text-muted">{en.dash.service.noGames}</span>
            ) : (
              games.join(' · ')
            )}
          </dd>
        </div>
        {tablesEngaged !== null && (
          <div>
            <dt className="text-xs tracking-wide text-muted uppercase">
              {en.dash.service.tablesEngaged}
            </dt>
            <dd className="mt-1 font-mono text-sm tabular-nums">{tablesEngaged}</dd>
          </div>
        )}
      </dl>

      {/* The chef's emergency stop is state the owner must not discover later:
          a night with prizes stopped reads differently in the morning. */}
      {killed && (
        <p className="mt-4 rounded-xl border border-line bg-paper px-3 py-2 text-sm">
          {en.dash.service.stopped}
        </p>
      )}
    </section>
  )
}

/**
 * The subordinate links into Manage. The nav already carries every page; this
 * row exists because the dashboard is where an operator lands and thinks
 * "menu" — four taps saved is four taps earned.
 */
function QuickActions() {
  const links = [
    { href: '/dash/menu', label: en.dash.menuNav },
    { href: '/dash/games', label: en.dash.gamesNav },
    { href: '/dash/prizes', label: en.dash.prizesNav },
    { href: '/dash/import', label: en.dash.importNav },
  ]
  return (
    <section className="mt-10">
      <h2 className="text-xs tracking-widest text-muted uppercase">
        {en.dash.quickActions.heading}
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-xl border border-line px-4 py-2.5 text-sm transition-state hover:border-ink-warm"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </section>
  )
}
