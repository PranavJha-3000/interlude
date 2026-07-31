'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { readGuestSessionId, setGuestSessionCookie } from '@/lib/session'
import {
  armForTable,
  getActiveVetoes,
  getConcededSoFarPaise,
  getEnabledGames,
  getKitchenLoad,
  getLatestOrderFire,
  getMenuForEngine,
  getPrizeRules,
  getVenueConfig,
  resolveScan,
  serviceClockMinute,
  toClimbConfig,
  getMenuForClimb,
} from '@/lib/service'
import { decidePrizePool } from '@/core/prize-engine'
import { parseRankingWeights } from '@/lib/prize-config'
import type { Mechanic } from '@/core/prize-engine'
import {
  buildPrizeLadder,
  computeRunWindow,
  dealHand,
  decideRun,
  isHandCleared,
  isRunWorthStarting,
  handSeedFor,
} from '@/core/mechanics/climb'

/**
 * Guest actions. Each one re-resolves the scan and re-checks the arm, so a
 * control table cannot reach any of them by replaying a request.
 */

export async function giveConsent(qrToken: string): Promise<void> {
  const now = Date.now()
  const scan = await resolveScan(qrToken)
  if (scan.kind !== 'OK') return

  const existing = await readGuestSessionId()
  if (existing) {
    const live = await db.guestSession.findUnique({ where: { id: existing } })
    if (live && live.serviceId === scan.serviceId) return
  }

  // A venue with no game switched on is closed to play, and the page renders
  // the closed screen rather than this form. Re-checked here anyway: the page
  // deciding not to show a button is not the same thing as the action refusing
  // to act, and a consent POST replayed against an all-off venue would
  // otherwise create the one row that venue is supposed to have none of.
  const enabled = await getEnabledGames(scan.venueId)
  if (enabled.length === 0) return

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

export async function startRound(qrToken: string, mechanic: Mechanic): Promise<void> {
  const now = Date.now()
  const scan = await resolveScan(qrToken)
  if (scan.kind !== 'OK') return

  // Re-checked here, not just in the page that rendered the form. A game the
  // operator switched off mid-service must not still be startable from a screen
  // that was rendered a minute earlier — every guest action in this file
  // re-resolves and re-validates for the same reason.
  const enabled = await getEnabledGames(scan.venueId)
  if (!enabled.includes(mechanic)) return

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
  const climbConfig = toClimbConfig(config)

  // The run is bounded by the food, not by a fixed length. No kitchen estimate
  // means no run: an unbounded climb whose ladder never resolves is worse than
  // none, and the page renders the "order first" copy instead.
  const fire = await getLatestOrderFire(scan.serviceId, scan.tableId, scan.venueId)
  const window = computeRunWindow(
    now,
    fire?.estReadyAt.getTime() ?? null,
    config.countdownBufferSec
  )
  if (!window) return
  if (!isRunWorthStarting(window.durationSec, climbConfig)) return

  // A venue whose menu is too thin to deal even the first hand cannot run the
  // climb. Checked here rather than at submit, so the guest is never dropped
  // into a game that cannot be played.
  const menu = await getMenuForClimb(scan.venueId)
  if (!dealHand(menu, handSeedFor(session.id, 0), 1, climbConfig)) return

  await db.play.create({
    data: {
      guestSessionId: session.id,
      mechanic,
      // Server-issued. The client never decides when the run ends.
      endsAt: new Date(window.endsAtMs),
      maxScore: climbConfig.rungs,
      answers: [],
    },
  })

  revalidatePath(`/t/${qrToken}`)
}

/** One submitted hand. `ids` is the guest's arrangement, cheapest first. */
interface ClimbAttempt {
  rung: number
  ids: string[]
}

/**
 * The client plays every hand locally and submits the lot. That is safe, and
 * for an unusual reason: **the prices are printed on the menu on the table.**
 * There is no secret to withhold, so sending dish prices to the phone leaks
 * nothing, and scoring locally is what makes each rung feel instant instead of
 * costing a round trip in a restaurant's wifi.
 *
 * What the client says it scored is still worth nothing. The server re-deals
 * every hand from the same seed — dealing is a pure function of (menu, seed,
 * rung), which is the whole reason it is — and replays the attempts in order.
 * Same trust model as the countdown: the animation is local, the truth is here.
 */
function replayClimb(
  attempts: ClimbAttempt[],
  menu: Awaited<ReturnType<typeof getMenuForClimb>>,
  sessionId: string,
  climbConfig: ReturnType<typeof toClimbConfig>
): number {
  const priceOf = new Map(menu.map((m) => [m.id, m.pricePaise]))
  let rung = 1
  let attemptsAtRung = 0
  let cleared = 0

  for (const a of attempts) {
    // Attempts must arrive in climbing order. A client that skips to rung six
    // stops being counted at the gap rather than being trusted or thrown at.
    if (a.rung !== rung) break
    if (rung > climbConfig.rungs) break

    const hand = dealHand(menu, handSeedFor(sessionId, attemptsAtRung), rung, climbConfig)
    if (!hand) break

    if (isHandCleared(hand, a.ids, priceOf)) {
      cleared = rung
      rung += 1
      attemptsAtRung = 0
    } else {
      attemptsAtRung += 1
    }
  }

  return cleared
}

export async function submitRound(qrToken: string, formData: FormData): Promise<void> {
  const now = Date.now()
  const scan = await resolveScan(qrToken)
  if (scan.kind !== 'OK') return

  const sessionId = await readGuestSessionId()
  if (!sessionId) return

  const play = await db.play.findFirst({
    where: { guestSessionId: sessionId, completedAt: null },
    orderBy: { startedAt: 'desc' },
  })
  if (!play) return

  const config = await getVenueConfig(scan.venueId)
  const climbConfig = toClimbConfig(config)

  const attempts = parseAttempts(formData.get('attempts'), climbConfig.rungs)
  const menu = await getMenuForClimb(scan.venueId)
  let cleared = replayClimb(attempts, menu, play.guestSessionId, climbConfig)

  // Anything submitted after the food was due does not count. Rebuilt from the
  // stored `endsAt`, so a slow network cannot shorten the run and a client with
  // its clock wound back cannot lengthen it. A small grace covers the round
  // trip of the auto-submit the countdown itself fires.
  if (now > play.endsAt.getTime() + LATE_SUBMIT_GRACE_MS) cleared = 0

  await db.play.update({
    where: { id: play.id },
    data: {
      completedAt: new Date(now),
      score: cleared,
      outcome: cleared >= 1 ? 'WIN' : 'LOSE',
      // Kept verbatim for replay and dispute: with the session id these
      // reproduce every hand exactly as it was dealt.
      answers: attempts.map((a) => ({ rung: a.rung, ids: a.ids })),
    },
  })

  await awardFor(play.id, scan.venueId, scan.serviceId, play.mechanic, cleared, climbConfig, now)
  revalidatePath(`/t/${qrToken}`)
}

/** Five seconds, to cover the round trip of the countdown's own auto-submit. */
const LATE_SUBMIT_GRACE_MS = 5_000

/**
 * Read the submitted hands.
 *
 * This is guest-controlled input arriving as JSON in a form field, so it is
 * parsed defensively and never thrown over: a malformed body is a run that
 * cleared nothing, not a 500 at the table. The length bound is what stops a
 * crafted body from making the replay loop do unbounded work.
 */
function parseAttempts(raw: FormDataEntryValue | null, rungs: number): ClimbAttempt[] {
  if (typeof raw !== 'string' || raw.length > 20_000) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const out: ClimbAttempt[] = []
  // A guest may retry a rung, so there are more attempts than rungs — but not
  // unboundedly more.
  for (const row of parsed.slice(0, rungs * 40)) {
    if (typeof row !== 'object' || row === null) continue
    const { rung, ids } = row as { rung?: unknown; ids?: unknown }
    if (typeof rung !== 'number' || !Number.isInteger(rung) || rung < 1 || rung > rungs) continue
    if (!Array.isArray(ids) || ids.length > 12) continue
    if (!ids.every((id): id is string => typeof id === 'string' && id.length <= 64)) continue
    out.push({ rung, ids })
  }
  return out
}

/**
 * Both outcomes end in real value. A loss is a lesser depth, never a dead end —
 * the guest who tried and missed still leaves with something, which is the
 * difference between a game and a disappointment.
 *
 * **How much lesser is the venue's decision, not ours.** The consolation used to
 * be a hardcoded half price here; it is now whichever `PrizeRule` the operator
 * wrote for `outcome: LOSE`, resolved by the same engine call as a win.
 */
async function awardFor(
  playId: string,
  venueId: string,
  serviceId: string,
  mechanic: Mechanic,
  rungsCleared: number,
  climbConfig: ReturnType<typeof toClimbConfig>,
  nowMs: number
): Promise<void> {
  const outcome: 'WIN' | 'LOSE' = rungsCleared >= 1 ? 'WIN' : 'LOSE'
  const [config, venue, load, vetoes, conceded, prizeRules, menuData] = await Promise.all([
    getVenueConfig(venueId),
    db.venue.findUniqueOrThrow({ where: { id: venueId }, select: { timezone: true } }),
    getKitchenLoad(venueId),
    getActiveVetoes(venueId),
    getConcededSoFarPaise(serviceId),
    getPrizeRules(venueId),
    getMenuForEngine(venueId),
  ])

  const menu = menuData.rows

  const pool = decidePrizePool({
    menu: menuData.engineMenu,
    velocity: menuData.velocity,
    kitchenLoad: load,
    chefVetoes: vetoes,
    depthCaps: {
      perItemPct: config.depthCapPerItemPct,
      perServicePaise: config.depthCapPerServicePaise,
    },
    mechanic,
    outcome,
    prizeRules,
    rankingWeights: parseRankingWeights(config.rankingWeights),
    concededSoFarPaise: conceded,
    serviceClockMinute: serviceClockMinute(nowMs, venue.timezone),
    peakStartMinute: config.peakStartMinute,
    peakEndMinute: config.peakEndMinute,
  })

  // The whole decision is snapshotted, entries and exclusions with their
  // reasons. This is the operator's audit trail (PLATFORM.md §5).
  const snapshot = await db.prizePool.create({
    data: {
      serviceId,
      mechanic,
      kitchenLoad: load,
      // Prisma's Json input wants an index-signature shape; the engine returns
      // typed structs. Map explicitly rather than casting, so a field added to
      // PrizeEntry has to be considered here too instead of silently vanishing
      // from the operator's audit trail.
      entries: pool.entries.map((e) => ({
        itemId: e.itemId,
        mechanic: e.mechanic,
        kind: e.kind,
        percentOff: e.percentOff ?? null,
        fixedPricePaise: e.fixedPricePaise ?? null,
        valuePaise: e.valuePaise,
        costPaise: e.costPaise,
        depthPct: e.depthPct,
        ruleId: e.ruleId,
        reason: e.reason,
        score: e.score,
      })),
      excluded: pool.excluded.map((x) => ({ itemId: x.itemId, reason: x.reason })),
    },
  })

  // The ladder *is* the pool, sorted by what it concedes and handed out one
  // entry per rung — so climbing is worth more, and every rung is one whole
  // dish rather than a fraction of one. A loss does not climb: it takes the
  // top of the consolation pool the engine returned for `outcome: LOSE`.
  const ladder = buildPrizeLadder(pool.entries, climbConfig.rungs)
  const { reached } = decideRun(rungsCleared, ladder)

  const top = reached
    ? pool.entries.find((e) => e.itemId === reached.itemId)
    : /* istanbul ignore next */ pool.entries[0]
  if (!top) return // Nothing offerable right now; the outcome screen says so.

  const item = menu.find((m) => m.id === top.itemId)
  if (!item) return

  // The engine already did this arithmetic against the venue's own rule. Doing
  // it again here is how the two drift — so the entry's numbers are what get
  // written, snapshotted so a later menu or rule edit cannot rewrite history.
  await db.award.create({
    data: {
      playId,
      menuItemId: item.id,
      prizePoolId: snapshot.id,
      kind: top.kind,
      percentOff: top.percentOff ?? null,
      fixedPricePaise: top.fixedPricePaise ?? null,
      ruleId: top.ruleId,
      valuePaise: top.valuePaise,
      foodCostPaise: top.costPaise,
      reason: top.reason,
    },
  })
}

export async function requestAddOn(qrToken: string, formData: FormData): Promise<void> {
  const scan = await resolveScan(qrToken)
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
