import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { markReviewShown } from '@/lib/review-funnel'
import { readGuestSessionId } from '@/lib/session'
import {
  getEnabledGames,
  getLatestOrderFire,
  getVenueConfig,
  resolveScan,
  roundEndsAtMs,
} from '@/lib/service'
import { formatPaise, guestPaysPaise } from '@/lib/money'
import { runStateOf, toLadderConfig } from '@/lib/table-run'
import { canStartRun, canTakePrize, offeredLifeActions } from '@/core/game/run'
import { earnedLifeActions } from '@/lib/table-run'
import { claimPrize, giveConsentAndOpen } from './game-actions'
import { Poller } from './Poller'
import { Body, Card, guestViewport, Heading, PrimaryButton, Screen } from './ui'
import { StartRun } from './StartRun'

// A local export, deliberately not `export { … as viewport } from './ui'`: on
// Next 16 a re-export in a page module silently breaks the registration of the
// page's inline server actions (POSTs 404 with "Failed to find Server
// Action"). Found by bisection 2026-08-14, same family as the group-layout
// viewport quirk documented in ../layout.tsx.
export const viewport = guestViewport

/** m:ss out of milliseconds, for the one won-screen clock figure. */
function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const dynamic = 'force-dynamic'

/**
 * Where each earning action goes.
 *
 * `ADDON_CONFIRMED` has no link on purpose: the life lands when a server
 * confirms the add-on, never when a guest taps something (§4.4). Rewarding the
 * tap instead of the order would reward the wrong behaviour.
 */
const LIFE_ACTION_HREF: Partial<Record<string, (qrToken: string) => string>> = {
  PHONE_SUBMITTED: (qrToken) => `/t/${qrToken}/phone`,
  FEEDBACK_SUBMITTED: (qrToken) => `/t/${qrToken}/feedback`,
}

/**
 * The way to the review prompt (§7.2), shown on the screens a visit ends on.
 * A plain link with no state attached — the prompt itself renders identically
 * whatever happened at the table, and never learns.
 */
function ReviewLink({ qrToken }: { qrToken: string }) {
  return (
    <p className="mt-8 text-center">
      <a href={`/t/${qrToken}/review`} className="text-sm text-muted underline">
        {en.guest.review.entry}
      </a>
    </p>
  )
}

/**
 * The guest surface (§9.1).
 *
 * A state machine rendered on the server — consent, waiting, the round, the
 * outcome, the spent device — so the only JavaScript that reaches the phone is
 * the round itself and a small poller.
 *
 * The states are in the order a table meets them, and the two that look like
 * edge cases are the ones worth reading: **not running** must be byte-identical
 * to a closed venue, and **device spent** is the screen most people will see on
 * night one.
 */
export default async function GuestPage({ params }: { params: Promise<{ qrToken: string }> }) {
  const { qrToken } = await params
  // A dynamic server component renders once per request, and "the time of this
  // request" is what the countdown needs. Passed down as a prop, never re-read.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const scan = await resolveScan(qrToken)

  if (scan.kind === 'UNKNOWN_TABLE') notFound()

  // ── Not running ──────────────────────────────────────────────────────────
  // A control night and a closed venue are the same screen, in the same words,
  // with no distinguishing colour, icon or empty state. A guest who works out
  // that tonight is a control night behaves differently, and that contaminates
  // the comparison the control exists to provide. Compliance rule, not
  // preference (§9.1).
  if (scan.kind === 'NO_SERVICE' || scan.kind === 'BLOCKED') {
    return (
      <Screen venueName={scan.venueName}>
        <Heading>{en.guest.closed.heading}</Heading>
        <Body>{en.guest.closed.body}</Body>
      </Screen>
    )
  }

  // Every game switched off is a venue decision the guest must read as a
  // closed venue — /dash/games promises exactly that, and until now the guest
  // route never checked. Same words, same screen, no table number, no tell.
  const games = await getEnabledGames(scan.venueId)
  if (games.length === 0) {
    return (
      <Screen venueName={scan.venueName}>
        <Heading>{en.guest.closed.heading}</Heading>
        <Body>{en.guest.closed.body}</Body>
      </Screen>
    )
  }

  const config = await getVenueConfig(scan.venueId)
  const ladder = toLadderConfig(config)

  const deviceId = await readGuestSessionId()
  const device = deviceId
    ? await db.deviceSession.findUnique({
        where: { id: deviceId },
        include: { tableRun: true },
      })
    : null

  // ── Consent ──────────────────────────────────────────────────────────────
  // Nothing has been written at this point and nothing will be until the tap
  // (§7.3, DPDP purpose limitation).
  if (!device || device.tableRun.serviceId !== scan.serviceId) {
    return (
      <Screen venueName={scan.venueName} tableLabel={scan.tableLabel}>
        <Heading>{en.guest.consent.heading}</Heading>
        <Body>{en.guest.consent.body}</Body>
        <div className="mt-auto pt-8">
          <form
            action={async () => {
              'use server'
              await giveConsentAndOpen(qrToken)
            }}
          >
            <PrimaryButton>{en.guest.consent.accept}</PrimaryButton>
          </form>
          <p className="mt-3 text-center text-xs text-muted">{en.guest.consent.privacy}</p>
        </div>
      </Screen>
    )
  }

  const run = device.tableRun
  const state = runStateOf(run)

  // ── Device spent (§4.5) ──────────────────────────────────────────────────
  // The most frequently seen failure state on night one, and it must read as an
  // instruction with a bit of theatre rather than as a wall. It names the
  // table's standing, says what happens next, and offers the ways back in. A
  // flat rejection is where people put the phone down.
  //
  // Checked before the fire: a spent device waiting for the kitchen must not
  // see a screen promising a game this phone cannot play. The ways back in
  // matter more before the food than after it.
  if (device.spentAt || !canStartRun(state)) {
    // ── Won (§9.1) ─────────────────────────────────────────────────────────
    // Read from the award row, never from client memory: the claim used to
    // land the guest on the lifelines screen with the prize nowhere on it —
    // the code and the "show your server" instruction existed only in the
    // pre-reload client state. The award is the table's, so a dead battery
    // means any spent device at the table can still show it.
    const award = await db.award.findFirst({
      where: { tableRunId: run.id, origin: 'GAME', status: { in: ['PENDING', 'CONFIRMED'] } },
      orderBy: { createdAt: 'desc' },
      include: { menuItem: { select: { name: true, pricePaise: true } } },
    })

    if (award) {
      const pays = guestPaysPaise(
        award.kind,
        award.menuItem.pricePaise,
        award.percentOff ?? undefined,
        award.fixedPricePaise ?? undefined
      )
      const pending = award.status === 'PENDING'
      const endsAt = await roundEndsAtMs(scan, config)
      const clockToSpare = endsAt !== null ? endsAt - award.createdAt.getTime() : 0

      return (
        <Screen venueName={scan.venueName} tableLabel={scan.tableLabel}>
          {/* 3s while a server is walking over — PLATFORM.md §11's redemption
              interval, which had no screen to live on until now. */}
          {pending && <Poller everyMs={3000} />}

          {/* The win heading is the guest's one sanctioned display-face use —
              the free Georgia fallback, zero bytes (UI-SPEC §4). */}
          <h1 className="font-display text-3xl leading-tight text-balance">
            {en.guest.won.heading}
          </h1>
          {clockToSpare > 0 && (
            <p className="mt-2 font-mono text-sm text-muted tabular-nums">
              {en.guest.won.timeToSpare(mmss(clockToSpare))}
            </p>
          )}

          <div className="mt-8">
            <p className="text-2xl leading-tight font-semibold">{award.menuItem.name}</p>
            {/* Accent use one of four: the won price beside the struck menu
                price. The only accent a guest will ever see. Mono is for
                figures — "On the house" is words and keeps the body face. */}
            <p className="mt-2 flex items-baseline gap-3">
              {award.kind === 'FREE' ? (
                <span className="text-3xl font-semibold text-accent">{en.guest.won.free}</span>
              ) : (
                <span className="font-mono text-3xl font-medium text-accent tabular-nums">
                  {formatPaise(pays)}
                </span>
              )}
              <span className="font-mono text-lg text-muted tabular-nums line-through">
                {formatPaise(award.menuItem.pricePaise)}
              </span>
            </p>
            <p className="mt-1 text-sm text-muted">{en.guest.won.tonightOnly}</p>
          </div>

          <div className="mt-auto pt-10">
            <Card>
              <p className="text-center text-base font-medium">{en.guest.won.instruction}</p>
              <p className="mt-2 text-center font-mono text-4xl tracking-widest tabular-nums">
                {award.code}
              </p>
            </Card>
            <p
              className={`mt-3 text-center text-sm ${pending ? 'text-muted' : 'font-medium text-ink'}`}
            >
              {pending ? en.guest.won.awaiting : en.guest.won.confirmed}
            </p>
          </div>

          <ReviewLink qrToken={qrToken} />
        </Screen>
      )
    }

    const earned = await earnedLifeActions(run.id)
    const offered = offeredLifeActions(earned, ladder)

    // The top of the review funnel. Stamped where the link *renders*, not where
    // it is clicked — before this, `shownAt` was written when a guest opened
    // /review, so the funnel had no denominator and every row had already
    // converted. Idempotent, which matters because this screen polls.
    await markReviewShown(run.id, scan.serviceId)

    return (
      <Screen venueName={scan.venueName} tableLabel={scan.tableLabel}>
        {/* A life earned elsewhere — a server confirming an add-on, a friend
            leaving feedback on their own phone — must appear here without
            anyone thinking to reload. Same interval as the waiting screen. */}
        <Poller everyMs={5000} />
        <Heading>{en.guest.spent.heading}</Heading>
        <Body>{device.spentAt ? en.guest.spent.body : en.guest.spent.tableBody}</Body>

        {/* The standing is the asset being handed over, so it gets the one
            instrument moment on this screen: the mono, at size. A table that
            never climbed has no standing worth parading — zeros read as a
            shrug, not theatre, so the block renders only when it says
            something. */}
        {(run.currentRung > 0 || run.streak > 0) && (
          <div className="mt-8">
            <p className="text-xs tracking-widest text-muted uppercase">
              {en.guest.spent.standingLabel}
            </p>
            <p className="mt-1 font-mono text-2xl font-medium tabular-nums">
              {en.guest.game.rung(run.currentRung, config.ladderRungs)} ·{' '}
              {en.guest.game.streak(run.streak)}
            </p>
            {canTakePrize(state) && (
              <p className="mt-1 text-base text-muted">
                {en.guest.spent.standing(run.currentRung)}
              </p>
            )}
          </div>
        )}

        {offered.length > 0 && (
          <div className="mt-auto pt-10">
            <p className="text-xs tracking-widest text-muted uppercase">
              {en.guest.spent.earnHeading}
            </p>
            {/* Two of these three used to be inert text. `PHONE_SUBMITTED` and
                `FEEDBACK_SUBMITTED` were offered to guests with no route behind
                them — the screen said "leave a phone number" and there was
                nowhere to leave it. The whole row is the link now, not a word
                inside it: this is tapped one-handed at a dim table. The add-on
                row stays a plain sentence — its go lands when a server
                confirms the order, so there is nothing here to tap. */}
            <ul className="mt-3 grid gap-2">
              {offered.map((action) => {
                const label = en.guest.spent.actions[action]
                const href = LIFE_ACTION_HREF[action]?.(qrToken)

                return (
                  <li key={action}>
                    {href ? (
                      <a
                        href={href}
                        className="transition-state flex min-h-14 items-center rounded-xl border border-line bg-ground-cotton px-4 text-base active:border-ink"
                      >
                        {label}
                      </a>
                    ) : (
                      <p className="flex min-h-14 items-center px-4 text-base text-ink-warm">
                        {label}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <ReviewLink qrToken={qrToken} />
      </Screen>
    )
  }

  const fire = await getLatestOrderFire(scan.serviceId, scan.tableId, scan.venueId)

  // ── Before the fire ──────────────────────────────────────────────────────
  // The clock starts when the kitchen starts the order, so there is genuinely
  // nothing to do yet — and the copy says so rather than offering a disabled
  // mystery. The page wakes itself; the guest is told that too, because the
  // alternative is a table staring at a screen wondering if it is broken.
  if (!fire) {
    const untimedAt = run.openedAt.getTime() + config.untimedAfterSec * 1000
    const runUntimed = now >= untimedAt

    if (!runUntimed) {
      return (
        <Screen venueName={scan.venueName} tableLabel={scan.tableLabel}>
          <Poller everyMs={5000} />
          <Heading>{en.guest.waiting.heading}</Heading>
          <Body>{en.guest.waiting.body}</Body>
          <div className="mt-auto pt-8">
            <button
              disabled
              className="min-h-14 w-full rounded-xl border border-line text-lg text-muted"
            >
              {en.guest.waiting.notYet}
            </button>
          </div>
        </Screen>
      )
    }
  }

  // ── The round ────────────────────────────────────────────────────────────
  // The run is bounded by the food. `endsAt` is a server-issued absolute
  // timestamp; a suspended tab and a wrong phone clock both desync a locally
  // counted duration, and both are ordinary in a restaurant (§4.6).
  const endsAtMs = fire ? fire.estReadyAt.getTime() - config.countdownBufferSec * 1000 : null

  // ── Food's here (§4.6) ───────────────────────────────────────────────────
  // The designed ending, not a failure: the kitchen finished first. The rung
  // stays banked and claimable; the round itself is over, and the server
  // actions refuse an answer past this moment for the same reason this screen
  // renders instead of the game — the countdown must not lie.
  if (endsAtMs !== null && endsAtMs <= now) {
    await markReviewShown(run.id, scan.serviceId)
    const held = canTakePrize(state)

    return (
      <Screen venueName={scan.venueName} tableLabel={scan.tableLabel}>
        <Heading>{en.guest.arrived.heading}</Heading>
        <Body>{held ? en.guest.arrived.bodyHeld : en.guest.arrived.body}</Body>
        {held && (
          <div className="mt-auto pt-8">
            <form
              action={async () => {
                'use server'
                await claimPrize(qrToken)
              }}
            >
              <PrimaryButton>{en.guest.game.claim}</PrimaryButton>
            </form>
          </div>
        )}
        <ReviewLink qrToken={qrToken} />
      </Screen>
    )
  }

  return (
    <StartRun
      qrToken={qrToken}
      venueName={scan.venueName}
      tableLabel={scan.tableLabel}
      endsAtMs={endsAtMs}
      firedAtMs={fire ? fire.firedAt.getTime() : null}
      rungs={config.ladderRungs}
      penaltyRungs={config.gamblePenaltyRungs}
      streak={run.streak}
      currentRung={run.currentRung}
      livesRemaining={run.livesRemaining}
    />
  )
}
