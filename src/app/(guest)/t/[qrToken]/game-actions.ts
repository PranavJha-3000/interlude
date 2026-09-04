'use server'

import { db } from '@/lib/db'
import { readGuestSessionId, setGuestSessionCookie } from '@/lib/session'
import { getVenueConfig, resolveScan, roundEndsAtMs } from '@/lib/service'
import { guestPaysPaise } from '@/lib/money'
import { decideAndWriteAward, previewTopPrize } from '@/lib/prize-award'
import { recordEvent } from '@/lib/events'
import {
  getMenuForGame,
  markPairShown,
  openOrResumeTableRun,
  runStateOf,
  saveRunState,
  toLadderConfig,
} from '@/lib/table-run'
import { dealPair, isCorrect, pairKey, pairSeedFor, type Pair } from '@/core/game/pairing'
import {
  applyAnswer,
  canStartRun,
  canTakePrize,
  endRun,
  startRun,
  takePrize,
} from '@/core/game/run'

/**
 * Beat the Kitchen, played through server actions (§4).
 *
 * **Every answer is a server round trip, and that is not an oversight.** In the
 * climb this replaced, the prices were printed on the menu on the table, so
 * sending them to the phone leaked nothing and the whole run could be played
 * locally. Here the answer *is* the secret — "which one do more people order
 * here" is not written anywhere a guest can see — and there is real money on
 * getting it right. Ship the pair with its answer attached and the game is
 * solvable with the browser's developer tools.
 *
 * So the phone is told the two dishes and nothing else. It learns which was
 * correct only after it has committed to one.
 */

export interface AnswerOutcome {
  ok: boolean
  correct?: boolean
  /** The dish that was in fact the higher seller, revealed after the tap. */
  answerId?: string
  streak?: number
  currentRung?: number
  livesRemaining?: number
  /** Present while the run continues. */
  nextPair?: PairView | null
  endedReason?: string | null
  canTake?: boolean
  /**
   * What the rung screen may name, when this answer reached a rung. The same
   * pure engine call the claim will make, read-only; null when the pool is
   * empty or the kill switch is on — the screen then banks the rung without
   * promising an item it cannot deliver.
   */
  rungPrize?: RungPrizeView | null
}

export interface RungPrizeView {
  itemName: string
  /** What the guest would pay, already computed. Zero means on the house. */
  paysPaise: number
  pricePaise: number
}

/** A pair as the phone is allowed to see it — the answer is not in here. */
export interface PairView {
  index: number
  left: { id: string; name: string; photoUrl: string | null }
  right: { id: string; name: string; photoUrl: string | null }
  basis: 'SALES' | 'CHEF'
}

function toView(
  pair: Pair,
  index: number,
  byId: Map<string, { name: string; photoUrl: string | null }>
): PairView {
  const left = byId.get(pair.leftId)!
  const right = byId.get(pair.rightId)!
  return {
    index,
    left: { id: pair.leftId, name: left.name, photoUrl: left.photoUrl },
    right: { id: pair.rightId, name: right.name, photoUrl: right.photoUrl },
    basis: pair.basis,
  }
}

/**
 * Consent, then the run.
 *
 * Nothing above the consent tap writes a row (§7.3). `TableRun` is opened here
 * rather than on page load for exactly that reason — it is the first write, and
 * it happens after the guest has agreed to it.
 */
export async function giveConsentAndOpen(qrToken: string): Promise<void> {
  const now = Date.now()
  const scan = await resolveScan(qrToken)
  if (scan.kind !== 'OK') return

  const config = await getVenueConfig(scan.venueId)
  const ladder = toLadderConfig(config)

  const run = await openOrResumeTableRun(scan.serviceId, scan.tableId, ladder)

  const existing = await readGuestSessionId()
  if (existing) {
    const live = await db.deviceSession.findUnique({ where: { id: existing } })
    if (live && live.tableRunId === run.id) return
  }

  const device = await db.deviceSession.create({
    data: { tableRunId: run.id, consentAt: new Date(now) },
  })
  await setGuestSessionCookie(device.id)

  const context = {
    serviceId: scan.serviceId,
    arm: scan.arm,
    tableRunId: run.id,
    deviceSessionId: device.id,
  }
  await recordEvent('SESSION_OPEN', context)
  await recordEvent('CONSENT_GIVEN', context)
}

/** Spend a life and begin. Refused when the table has none left (§4.3). */
export async function beginRun(qrToken: string): Promise<AnswerOutcome> {
  const now = Date.now()
  const scan = await resolveScan(qrToken)
  if (scan.kind !== 'OK') return { ok: false }

  const deviceId = await readGuestSessionId()
  if (!deviceId) return { ok: false }

  const device = await db.deviceSession.findUnique({
    where: { id: deviceId },
    include: { tableRun: true },
  })
  if (!device || device.spentAt) return { ok: false }

  const config = await getVenueConfig(scan.venueId)
  const state = runStateOf(device.tableRun)

  if (!canStartRun(state)) return { ok: false }

  // The food is the clock, and the kitchen is done — a life must not be spent
  // on a round that is already over. The page renders the arrived screen; this
  // guard covers the tap that races it.
  const endsAt = await roundEndsAtMs(scan, config)
  if (endsAt !== null && now > endsAt) {
    return { ok: false, endedReason: 'FOOD_ARRIVED' }
  }

  // A menu with no defensible, unseen pair is a configuration state, not a
  // failed game. Check before consuming a table life; previously this was
  // discovered only after `startRun`, leaving the guest on the generic error.
  const menu = await getMenuForGame(scan.venueId)
  if (
    !dealPair(
      menu,
      { gapRatio: config.pairGapRatio },
      device.tableRun.pairsShown,
      pairSeedFor(device.tableRunId, device.tableRun.pairsShown.length)
    )
  ) {
    return { ok: false, endedReason: 'NO_AVAILABLE_PAIR' }
  }

  const started = startRun(state)
  await saveRunState(device.tableRunId, started)

  const context = {
    serviceId: scan.serviceId,
    arm: scan.arm,
    tableRunId: device.tableRunId,
    deviceSessionId: device.id,
  }
  await recordEvent('RUN_START', context, { rung: started.currentRung })

  const next = await dealNext(scan.venueId, device.tableRunId, config.pairGapRatio)
  if (next) {
    await recordEvent('PAIR_SHOWN', context, {
      higherId: next.pair.higherId,
      lowerId: next.pair.lowerId,
      gapRatio: next.pair.gapRatio,
      basis: next.pair.basis,
    })
  }

  return {
    ok: true,
    streak: started.streak,
    currentRung: started.currentRung,
    livesRemaining: started.livesRemaining,
    nextPair: next?.view ?? null,
    canTake: canTakePrize(started),
  }
}

/** Deal the next unseen pair for this table, or null if there is none left. */
async function dealNext(venueId: string, tableRunId: string, gapRatio: number) {
  const [menu, run] = await Promise.all([
    getMenuForGame(venueId),
    db.tableRun.findUniqueOrThrow({ where: { id: tableRunId } }),
  ])

  const index = run.pairsShown.length
  const pair = dealPair(menu, { gapRatio }, run.pairsShown, pairSeedFor(tableRunId, index))
  if (!pair) return null

  await markPairShown(tableRunId, pairKey(pair.higherId, pair.lowerId))

  const byId = new Map(menu.map((m) => [m.id, { name: m.name, photoUrl: m.photoUrl }]))
  return { pair, view: toView(pair, index, byId) }
}

/**
 * One tap.
 *
 * The pair is re-dealt from its seed rather than trusted from the client, for
 * the same reason the climb replayed its hands: what the phone says it was
 * asked is worth nothing. Dealing is a pure function of (menu, seed, shown), so
 * the server can reconstruct exactly the pair it presented.
 */
export async function answerPair(
  qrToken: string,
  pairIndex: number,
  chosenId: string
): Promise<AnswerOutcome> {
  const now = Date.now()
  const scan = await resolveScan(qrToken)
  if (scan.kind !== 'OK') return { ok: false }

  const deviceId = await readGuestSessionId()
  if (!deviceId) return { ok: false }

  const device = await db.deviceSession.findUnique({
    where: { id: deviceId },
    include: { tableRun: true },
  })
  if (!device || device.spentAt) return { ok: false }

  const config = await getVenueConfig(scan.venueId)
  const ladder = toLadderConfig(config)

  const context = {
    serviceId: scan.serviceId,
    arm: scan.arm,
    tableRunId: device.tableRunId,
    deviceSessionId: device.id,
  }

  // The clock is enforced here, not on the phone (§4.6). An answer that lands
  // after the food is due is not judged — the run ends the way it was always
  // designed to end, with the banked rung intact and the streak released.
  const endsAt = await roundEndsAtMs(scan, config)
  if (endsAt !== null && now > endsAt) {
    const ended = endRun(runStateOf(device.tableRun), 'FOOD_ARRIVED')
    await saveRunState(device.tableRunId, ended.state)
    await recordEvent('RUN_END', context, { reason: 'FOOD_ARRIVED' })
    await db.deviceSession.update({ where: { id: device.id }, data: { spentAt: new Date(now) } })
    await recordEvent('DEVICE_SPENT', context)

    return {
      ok: true,
      streak: ended.state.streak,
      currentRung: ended.state.currentRung,
      livesRemaining: ended.state.livesRemaining,
      nextPair: null,
      endedReason: 'FOOD_ARRIVED',
      canTake: canTakePrize(ended.state),
    }
  }

  const menu = await getMenuForGame(scan.venueId)

  // Re-deal the pair this index refers to, from the same inputs that produced
  // it. `pairsShown` already contains it, so it is excluded from its own deal —
  // hence the slice back to the state as it was when the pair was dealt.
  const shownBefore = device.tableRun.pairsShown.slice(0, pairIndex)
  const pair = dealPair(
    menu,
    { gapRatio: config.pairGapRatio },
    shownBefore,
    pairSeedFor(device.tableRunId, pairIndex)
  )
  if (!pair) return { ok: false }

  const correct = isCorrect(pair, chosenId)
  const result = applyAnswer(runStateOf(device.tableRun), correct, ladder)
  await saveRunState(device.tableRunId, result.state)

  await recordEvent('ANSWER', context, {
    correct,
    chosenId,
    higherId: pair.higherId,
    gapRatio: pair.gapRatio,
  })
  if (result.rungReached) {
    await recordEvent('RUNG_REACHED', context, { rung: result.rungReached })
  }

  // The rung screen names its prize from the same engine the claim will run.
  // Killed means no award will be written, so nothing is promised.
  let rungPrize: RungPrizeView | null = null
  if (result.rungReached && !scan.killed) {
    const preview = await previewTopPrize(scan.venueId, scan.serviceId, now)
    if (preview) {
      rungPrize = {
        itemName: preview.itemName,
        paysPaise: guestPaysPaise(
          preview.kind,
          preview.pricePaise,
          preview.percentOff ?? undefined,
          preview.fixedPricePaise ?? undefined
        ),
        pricePaise: preview.pricePaise,
      }
    }
  }

  if (result.endedReason) {
    await recordEvent('RUN_END', context, { reason: result.endedReason })
    await db.deviceSession.update({
      where: { id: device.id },
      data: { spentAt: new Date(now) },
    })
    await recordEvent('DEVICE_SPENT', context)

    return {
      ok: true,
      correct,
      answerId: pair.higherId,
      streak: result.state.streak,
      currentRung: result.state.currentRung,
      livesRemaining: result.state.livesRemaining,
      nextPair: null,
      endedReason: result.endedReason,
      canTake: canTakePrize(result.state),
      rungPrize,
    }
  }

  const next = await dealNext(scan.venueId, device.tableRunId, config.pairGapRatio)
  if (next) {
    await recordEvent('PAIR_SHOWN', context, {
      higherId: next.pair.higherId,
      lowerId: next.pair.lowerId,
      gapRatio: next.pair.gapRatio,
      basis: next.pair.basis,
    })
  } else {
    // The menu ran out of questions this table can be asked. Ending the run is
    // the correct behaviour — §4.2 refuses to relax the gap ratio to keep a
    // game going, because the next question would be one staff cannot defend.
    await recordEvent('RUN_END', context, { reason: 'ABANDONED', cause: 'no_pairs_left' })
    await db.deviceSession.update({ where: { id: device.id }, data: { spentAt: new Date(now) } })
  }

  return {
    ok: true,
    correct,
    answerId: pair.higherId,
    streak: result.state.streak,
    currentRung: result.state.currentRung,
    livesRemaining: result.state.livesRemaining,
    nextPair: next?.view ?? null,
    endedReason: next ? null : 'ABANDONED',
    canTake: canTakePrize(result.state),
    rungPrize,
  }
}

/**
 * Stop here and claim the rung.
 *
 * This is where the engine finally runs. The rung says the table *earned*
 * something; the engine decides *what*, inside the venue's fences — vetoes,
 * kitchen load, depth caps — and writes both the award and its reason.
 *
 * Two refusals are deliberate and both leave the guest whole rather than
 * staring at an error:
 *
 * - **The kill switch** (§7.4) stops awards without stopping the game. The run
 *   is still spent and still measured; there is simply nothing to hand over.
 * - **An empty pool** means the fences left nothing offerable. The venue's
 *   zero-kitchen fallback covers it, because §5 is explicit that a pool of
 *   nothing must never reach a guest screen.
 */
export async function claimPrize(qrToken: string): Promise<{ ok: boolean; code?: string }> {
  const now = Date.now()
  const scan = await resolveScan(qrToken)
  if (scan.kind !== 'OK') return { ok: false }

  const deviceId = await readGuestSessionId()
  if (!deviceId) return { ok: false }

  const device = await db.deviceSession.findUnique({
    where: { id: deviceId },
    include: { tableRun: true },
  })
  if (!device) return { ok: false }

  const state = runStateOf(device.tableRun)
  if (!canTakePrize(state)) return { ok: false }

  const context = {
    serviceId: scan.serviceId,
    arm: scan.arm,
    tableRunId: device.tableRunId,
    deviceSessionId: device.id,
  }

  // Spend the rung and the device first, whatever the engine says next. A
  // failure to find a prize must not leave a run that can be claimed twice.
  await recordEvent('PRIZE_TAKEN', context, { rung: state.currentRung })
  await saveRunState(device.tableRunId, takePrize(state))
  await db.deviceSession.update({ where: { id: device.id }, data: { spentAt: new Date(now) } })
  await recordEvent('RUN_END', context, { reason: 'PRIZE_TAKEN' })

  if (scan.killed) return { ok: true }

  const award = await decideAndWriteAward({
    venueId: scan.venueId,
    serviceId: scan.serviceId,
    tableRunId: device.tableRunId,
    nowMs: now,
    purpose: { kind: 'GAME', mechanic: 'BEAT_THE_KITCHEN', rung: state.currentRung },
  })
  return award ? { ok: true, code: award.code ?? undefined } : { ok: true }
}
