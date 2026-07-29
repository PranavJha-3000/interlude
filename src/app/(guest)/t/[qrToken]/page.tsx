import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { readGuestSessionId } from '@/lib/session'
import { getLatestOrderFire, getVenueConfig, resolveScan, toRoundConfig } from '@/lib/service'
import {
  computeRoundWindow,
  isRoundWorthStarting,
  minutesUntilReady,
} from '@/core/mechanics/kitchen-round'
import { formatPaise } from '@/lib/money'
import { giveConsent, requestAddOn, startRound, submitRound } from './actions'
import { Round, type RoundQuestion } from './Round'
import { Poller } from './Poller'
import { Body, Card, Heading, PrimaryButton, Screen } from './ui'

export const dynamic = 'force-dynamic'

/**
 * The guest surface. A state machine rendered on the server — consent, wait,
 * play, outcome, add-on — so the only JavaScript that reaches the phone is the
 * round countdown and a small poller.
 */
export default async function GuestPage({ params }: { params: Promise<{ qrToken: string }> }) {
  const { qrToken } = await params
  // A dynamic server component renders once per request, and "the time of this
  // request" is exactly what the arm lookup and the countdown need. The purity
  // rule is aimed at client re-renders; there is no request-clock primitive to
  // use instead, and the value is passed down as a prop rather than re-read.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const scan = await resolveScan(qrToken, now)

  if (scan.kind === 'UNKNOWN_TABLE') notFound()

  // A control table and a closed venue look identical on purpose. A guest who
  // learns they are in a control group behaves differently, and that would
  // contaminate the very comparison the control exists to provide.
  if (scan.kind === 'NO_SERVICE' || scan.kind === 'BLOCKED') {
    return (
      <Screen venueName={scan.venueName}>
        <Heading>{en.guest.closed.heading}</Heading>
        <Body>{en.guest.closed.body}</Body>
      </Screen>
    )
  }

  const sessionId = await readGuestSessionId()
  const session = sessionId
    ? await db.guestSession.findUnique({
        where: { id: sessionId },
        include: {
          plays: { orderBy: { startedAt: 'desc' }, include: { award: true } },
          addOnRequests: { include: { menuItem: true } },
        },
      })
    : null

  // ── 1. Consent ─────────────────────────────────────────────────────────
  // Nothing has been recorded at this point, and the copy says so.
  if (!session || session.serviceId !== scan.serviceId) {
    return (
      <Screen venueName={scan.venueName}>
        <Heading>{en.guest.consent.heading}</Heading>
        <Body>{en.guest.consent.body}</Body>
        <Card>
          <p className="text-sm leading-relaxed text-muted">{en.guest.consent.privacy}</p>
        </Card>
        <div className="flex-1" />
        <form
          action={async () => {
            'use server'
            await giveConsent(qrToken)
          }}
        >
          <PrimaryButton type="submit">{en.guest.consent.accept}</PrimaryButton>
        </form>
        <p className="mt-4 text-center text-sm text-muted">{en.guest.consent.declineNote}</p>
      </Screen>
    )
  }

  const config = await getVenueConfig(scan.venueId)
  const roundConfig = toRoundConfig(config)
  const play = session.plays[0]

  // ── 4. Outcome ─────────────────────────────────────────────────────────
  if (play?.completedAt) {
    const award = play.award
    const item = award ? await db.menuItem.findUnique({ where: { id: award.menuItemId } }) : null
    const won = play.outcome === 'WIN'
    const alreadyAsked = session.addOnRequests.length > 0

    return (
      <Screen venueName={scan.venueName}>
        {award?.status === 'PENDING' && <Poller everyMs={3000} />}

        <Heading>{won ? en.guest.outcome.wonHeading : en.guest.outcome.lostHeading}</Heading>
        <Body>
          {item
            ? won
              ? en.guest.outcome.wonBody(item.name)
              : en.guest.outcome.lostBody(item.name)
            : en.guest.closed.body}
        </Body>
        <p className="mt-2 text-sm text-muted">
          {en.guest.outcome.scoreLine(play.score, play.maxScore)}
        </p>

        {award && item && (
          <div className="mt-6">
            <Card>
              <p className="text-2xl font-semibold">{item.name}</p>
              <p className="mt-1 text-lg text-accent">
                {award.kind === 'FREE'
                  ? 'Free'
                  : award.kind === 'HALF_PRICE'
                    ? `Half price — ${formatPaise(item.pricePaise - award.valuePaise)}`
                    : formatPaise(config.mysteryPlatePricePaise)}
              </p>
              <p className="mt-4 text-sm text-muted">
                {award.status === 'CONFIRMED'
                  ? en.guest.outcome.confirmed
                  : en.guest.outcome.awaitingConfirm}
              </p>
            </Card>
            <p className="mt-3 text-center text-sm text-muted">
              {won ? en.guest.outcome.wonInstruction : en.guest.outcome.lostInstruction}
            </p>
          </div>
        )}

        {/* ── 5. Add-on ───────────────────────────────────────────────── */}
        <div className="mt-10">
          {alreadyAsked ? (
            <Card>
              <p className="text-lg">{en.guest.addOn.sent}</p>
              <ul className="mt-2 text-sm text-muted">
                {session.addOnRequests.map((r) => (
                  <li key={r.id}>
                    {r.qty}× {r.menuItem.name}
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <AddOnOffer qrToken={qrToken} venueId={scan.venueId} excludeId={item?.id} />
          )}
        </div>
      </Screen>
    )
  }

  // ── 3. Round in progress ───────────────────────────────────────────────
  if (play) {
    const recorded = play.answers as Array<{ questionId: string; given: number | null }>
    const rows = await db.quizQuestion.findMany({
      where: { id: { in: recorded.map((a) => a.questionId) } },
    })
    const byId = new Map(rows.map((q) => [q.id, q]))
    const questions: RoundQuestion[] = recorded
      .map((a) => byId.get(a.questionId))
      .filter((q): q is NonNullable<typeof q> => Boolean(q))
      .map((q) => ({ id: q.id, prompt: q.prompt, options: q.options as string[] }))

    return (
      <Round
        questions={questions}
        endsAtMs={play.endsAt.getTime()}
        serverNowMs={now}
        action={async (formData: FormData) => {
          'use server'
          await submitRound(qrToken, formData)
        }}
      />
    )
  }

  // ── 2. Waiting for the kitchen ─────────────────────────────────────────
  const fire = await getLatestOrderFire(scan.serviceId, scan.tableId)

  if (!fire) {
    return (
      <Screen venueName={scan.venueName}>
        <Poller everyMs={5000} />
        <Heading>{en.guest.waiting.heading}</Heading>
        <Body>{en.guest.waiting.notFiredYet}</Body>
      </Screen>
    )
  }

  const estReadyMs = fire.estReadyAt.getTime()
  const window = computeRoundWindow(now, estReadyMs, roundConfig)
  const minutes = minutesUntilReady(now, estReadyMs)

  // A five-second round is worse than no round. Say so rather than start one.
  if (!isRoundWorthStarting(window)) {
    return (
      <Screen venueName={scan.venueName}>
        <Heading>{en.guest.round.foodArriving}</Heading>
        <Body>{en.guest.closed.body}</Body>
      </Screen>
    )
  }

  return (
    <Screen venueName={scan.venueName}>
      <Heading>{en.guest.waiting.heading}</Heading>
      <Body>
        {minutes > 0
          ? en.guest.waiting.subheadWithMinutes(minutes)
          : en.guest.waiting.subheadNoTimer}
      </Body>
      <div className="flex-1" />
      <form
        action={async () => {
          'use server'
          await startRound(qrToken)
        }}
      >
        <PrimaryButton type="submit">{en.guest.waiting.start}</PrimaryButton>
      </form>
    </Screen>
  )
}

/**
 * Three one-tap options. Chosen by contribution margin, not price — the point
 * is what the venue keeps, not what the guest spends.
 */
async function AddOnOffer({
  qrToken,
  venueId,
  excludeId,
}: {
  qrToken: string
  venueId: string
  excludeId?: string
}) {
  const candidates = await db.menuItem.findMany({
    where: {
      venueId,
      active: true,
      isHero: false,
      category: { in: ['desserts', 'beverages', 'sides'] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  })

  const top = candidates
    .map((m) => ({ item: m, contribution: m.pricePaise - m.foodCostPaise }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)

  if (top.length === 0) return null

  return (
    <>
      <h2 className="text-xl font-semibold">{en.guest.addOn.heading}</h2>
      <p className="mt-1 text-sm text-muted">{en.guest.addOn.subhead}</p>
      <div className="mt-4 grid gap-3">
        {top.map(({ item }) => (
          <form
            key={item.id}
            action={async (formData: FormData) => {
              'use server'
              await requestAddOn(qrToken, formData)
            }}
          >
            <input type="hidden" name="menuItemId" value={item.id} />
            <button
              type="submit"
              className="flex min-h-14 w-full items-center justify-between rounded-xl border-2 border-line bg-warm px-4 text-left text-lg active:border-accent active:bg-accent-soft"
            >
              <span>{item.name}</span>
              <span className="text-muted">{formatPaise(item.pricePaise)}</span>
            </button>
          </form>
        ))}
      </div>
    </>
  )
}
