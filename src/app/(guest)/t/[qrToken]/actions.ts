'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { readGuestSessionId, setGuestSessionCookie } from '@/lib/session'
import {
  armForTable,
  getActiveVetoes,
  getConcededSoFarPaise,
  getKitchenLoad,
  getLatestOrderFire,
  getVenueConfig,
  resolveScan,
  serviceClockMinute,
  toRoundConfig,
} from '@/lib/service'
import { decidePrizePool } from '@/core/prize-engine'
import {
  computeRoundWindow,
  decideOutcome,
  scoreRound,
  selectQuestions,
  type QuizQuestionInput,
} from '@/core/mechanics/kitchen-round'

/**
 * Guest actions. Each one re-resolves the scan and re-checks the arm, so a
 * control table cannot reach any of them by replaying a request.
 */

export async function giveConsent(qrToken: string): Promise<void> {
  const now = Date.now()
  const scan = await resolveScan(qrToken, now)
  if (scan.kind !== 'OK') return

  const existing = await readGuestSessionId()
  if (existing) {
    const live = await db.guestSession.findUnique({ where: { id: existing } })
    if (live && live.serviceId === scan.serviceId) return
  }

  const arm = await armForTable(scan.serviceId, scan.tableId, now)
  if (arm !== 'TREATMENT') return

  // Nothing above this point wrote a row. The consent tap is the first write —
  // DPDP purpose limitation, PLATFORM.md §7.
  const session = await db.guestSession.create({
    data: {
      tableId: scan.tableId,
      serviceId: scan.serviceId,
      armAtScan: arm,
      consentAt: new Date(now),
    },
  })

  await setGuestSessionCookie(session.id)
  revalidatePath(`/t/${qrToken}`)
}

export async function startRound(qrToken: string): Promise<void> {
  const now = Date.now()
  const scan = await resolveScan(qrToken, now)
  if (scan.kind !== 'OK') return

  const sessionId = await readGuestSessionId()
  if (!sessionId) return

  const session = await db.guestSession.findUnique({
    where: { id: sessionId },
    include: { plays: true },
  })
  if (!session || session.serviceId !== scan.serviceId) return
  // One round per session in wave 1. A second would need its own depth budget.
  if (session.plays.length > 0) return

  const config = await getVenueConfig(scan.venueId)
  const roundConfig = toRoundConfig(config)

  const fire = await getLatestOrderFire(scan.serviceId, scan.tableId)
  const window = computeRoundWindow(now, fire?.estReadyAt.getTime() ?? null, roundConfig)

  const pack = await db.quizPack.findFirst({
    where: { OR: [{ venueId: scan.venueId }, { venueId: null }], active: true },
    include: { questions: true },
  })
  if (!pack || pack.questions.length === 0) return

  const pool: QuizQuestionInput[] = pack.questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    options: q.options as string[],
    answerIndex: q.answerIndex,
    difficulty: q.difficulty,
    orderHint: q.orderHint,
  }))
  const chosen = selectQuestions(pool, session.id, roundConfig)

  await db.play.create({
    data: {
      guestSessionId: session.id,
      mechanic: 'KITCHEN_ROUND',
      quizPackId: pack.id,
      // Server-issued. The client never decides when the round ends.
      endsAt: new Date(window.endsAtMs),
      maxScore: chosen.length,
      answers: chosen.map((q) => ({ questionId: q.id, given: null })),
    },
  })

  revalidatePath(`/t/${qrToken}`)
}

export async function submitRound(qrToken: string, formData: FormData): Promise<void> {
  const now = Date.now()
  const scan = await resolveScan(qrToken, now)
  if (scan.kind !== 'OK') return

  const sessionId = await readGuestSessionId()
  if (!sessionId) return

  const play = await db.play.findFirst({
    where: { guestSessionId: sessionId, completedAt: null },
    orderBy: { startedAt: 'desc' },
  })
  if (!play) return

  const config = await getVenueConfig(scan.venueId)
  const roundConfig = toRoundConfig(config)

  const recorded = play.answers as Array<{ questionId: string; given: number | null }>
  const questions = await db.quizQuestion.findMany({
    where: { id: { in: recorded.map((a) => a.questionId) } },
  })
  const byId = new Map(questions.map((q) => [q.id, q]))

  const ordered: QuizQuestionInput[] = recorded
    .map((a) => byId.get(a.questionId))
    .filter((q): q is NonNullable<typeof q> => Boolean(q))
    .map((q) => ({
      id: q.id,
      prompt: q.prompt,
      options: q.options as string[],
      answerIndex: q.answerIndex,
      difficulty: q.difficulty,
      orderHint: q.orderHint,
    }))

  const given = recorded.map((a) => {
    const raw = formData.get(`q_${a.questionId}`)
    const n = raw === null ? null : Number(raw)
    return n === null || Number.isNaN(n) ? null : n
  })

  const scored = scoreRound(ordered, given)
  // The window is rebuilt from the stored endsAt, so a slow network cannot
  // shorten the round and a tampered client cannot lengthen it.
  const window = { endsAtMs: play.endsAt.getTime(), durationSec: 0, clampedByKitchen: false }
  const outcome = decideOutcome(scored, now, window, roundConfig)

  await db.play.update({
    where: { id: play.id },
    data: {
      completedAt: new Date(now),
      score: scored.score,
      outcome,
      answers: recorded.map((a, i) => ({ questionId: a.questionId, given: given[i] ?? null })),
    },
  })

  await awardFor(play.id, scan.venueId, scan.serviceId, outcome, now)
  revalidatePath(`/t/${qrToken}`)
}

/**
 * Both outcomes end in real value. A loss is a lesser depth, never a dead end
 * (TODO.md wave 1) — the guest who tried and missed still leaves with
 * something, which is the difference between a game and a disappointment.
 */
async function awardFor(
  playId: string,
  venueId: string,
  serviceId: string,
  outcome: 'WIN' | 'LOSE',
  nowMs: number
): Promise<void> {
  const [config, venue, load, vetoes, conceded] = await Promise.all([
    getVenueConfig(venueId),
    db.venue.findUniqueOrThrow({ where: { id: venueId }, select: { timezone: true } }),
    getKitchenLoad(venueId),
    getActiveVetoes(venueId),
    getConcededSoFarPaise(serviceId),
  ])

  const menu = await db.menuItem.findMany({ where: { venueId, active: true } })

  const pool = decidePrizePool({
    menu: menu.map((m) => ({
      id: m.id,
      name: m.name,
      category: m.category,
      pricePaise: m.pricePaise,
      foodCostPaise: m.foodCostPaise,
      marginTier: m.marginTier,
      prepBurden: m.prepBurden,
      requiresKitchenWork: m.requiresKitchenWork,
      isHero: m.isHero,
      active: m.active,
    })),
    velocity: menu.map((m) => ({ itemId: m.id, unitsSold: m.trailingSales })),
    kitchenLoad: load,
    chefVetoes: vetoes,
    depthCaps: {
      perItemPct: config.depthCapPerItemPct,
      perServicePaise: config.depthCapPerServicePaise,
    },
    mechanic: 'KITCHEN_ROUND',
    concededSoFarPaise: conceded,
    serviceClockMinute: serviceClockMinute(nowMs, venue.timezone),
    peakStartMinute: config.peakStartMinute,
    peakEndMinute: config.peakEndMinute,
    mysteryPlatePricePaise: config.mysteryPlatePricePaise,
  })

  // The whole decision is snapshotted, entries and exclusions with their
  // reasons. This is the operator's audit trail (PLATFORM.md §5).
  const snapshot = await db.prizePool.create({
    data: {
      serviceId,
      mechanic: 'KITCHEN_ROUND',
      kitchenLoad: load,
      // Prisma's Json input wants an index-signature shape; the engine returns
      // typed structs. Map explicitly rather than casting, so a field added to
      // PrizeEntry has to be considered here too instead of silently vanishing
      // from the operator's audit trail.
      entries: pool.entries.map((e) => ({
        itemId: e.itemId,
        mechanic: e.mechanic,
        kind: e.kind,
        valuePaise: e.valuePaise,
        costPaise: e.costPaise,
        depthPct: e.depthPct,
        reason: e.reason,
        score: e.score,
      })),
      excluded: pool.excluded.map((x) => ({ itemId: x.itemId, reason: x.reason })),
    },
  })

  const top = pool.entries[0]
  if (!top) return // Nothing offerable right now; the outcome screen says so.

  const item = menu.find((m) => m.id === top.itemId)
  if (!item) return

  const kind = outcome === 'WIN' ? top.kind : 'HALF_PRICE'
  const valuePaise =
    kind === 'FREE'
      ? item.pricePaise
      : kind === 'HALF_PRICE'
        ? Math.round(item.pricePaise / 2)
        : Math.max(0, item.pricePaise - config.mysteryPlatePricePaise)
  const foodCostPaise =
    kind === 'FREE' ? item.foodCostPaise : Math.max(0, item.foodCostPaise - valuePaise)

  await db.award.create({
    data: {
      playId,
      menuItemId: item.id,
      prizePoolId: snapshot.id,
      kind,
      valuePaise,
      foodCostPaise,
      reason: outcome === 'WIN' ? top.reason : `${top.reason} — consolation at half price`,
    },
  })
}

export async function requestAddOn(qrToken: string, formData: FormData): Promise<void> {
  const scan = await resolveScan(qrToken, Date.now())
  if (scan.kind !== 'OK') return

  const sessionId = await readGuestSessionId()
  if (!sessionId) return

  const menuItemId = String(formData.get('menuItemId') ?? '')
  if (!menuItemId) return

  const item = await db.menuItem.findFirst({
    where: { id: menuItemId, venueId: scan.venueId, active: true },
  })
  if (!item) return

  await db.addOnRequest.create({
    data: {
      guestSessionId: sessionId,
      menuItemId: item.id,
      qty: 1,
      // Snapshotted so a later menu edit cannot rewrite the dashboard's maths.
      pricePaise: item.pricePaise,
      foodCostPaise: item.foodCostPaise,
    },
  })

  revalidatePath(`/t/${qrToken}`)
}
