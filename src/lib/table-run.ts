import 'server-only'

import { db } from '@/lib/db'
import { newRun, type LadderConfig, type RunState } from '@/core/game/run'
import type { GameItem } from '@/core/game/pairing'
import { assignDefaultChefRanks } from './games-ranking'

/**
 * The table run and its devices (§6.1).
 *
 * **The unit of play is the table.** A `TableRun` is opened once per table per
 * service and holds the streak, the rung, the lives and the pairs already
 * asked. A `DeviceSession` is one phone under it. The next guest to scan the
 * same tent resumes the table where the last one stopped, which is the whole
 * inheritance mechanic — and it only works because none of that state lives on
 * the phone.
 */

export function toLadderConfig(config: {
  ladderRungs: number
  startingLives: number
  gamblePenaltyRungs: number
  lifeForAddOn: boolean
  lifeForPhone: boolean
  lifeForFeedback: boolean
}): LadderConfig {
  return {
    rungs: config.ladderRungs,
    startingLives: config.startingLives,
    gamblePenaltyRungs: config.gamblePenaltyRungs,
    lifeForAddOn: config.lifeForAddOn,
    lifeForPhone: config.lifeForPhone,
    lifeForFeedback: config.lifeForFeedback,
  }
}

/**
 * Find the table's run for this service, opening one if this is the first scan.
 *
 * Idempotent on (service, table) — two phones scanning at the same moment must
 * produce one run, not two, or the table's streak forks and the second guest
 * inherits nothing. The unique constraint does the deciding; the catch handles
 * losing that race.
 */
export async function openOrResumeTableRun(
  serviceId: string,
  tableId: string,
  config: LadderConfig
) {
  const existing = await db.tableRun.findUnique({
    where: { serviceId_tableId: { serviceId, tableId } },
  })
  if (existing) return existing

  const fresh = newRun(config)
  try {
    return await db.tableRun.create({
      data: {
        serviceId,
        tableId,
        streak: fresh.streak,
        currentRung: fresh.currentRung,
        livesRemaining: fresh.livesRemaining,
      },
    })
  } catch {
    // Lost the race to another phone at the same table. Theirs is the run.
    return db.tableRun.findUniqueOrThrow({
      where: { serviceId_tableId: { serviceId, tableId } },
    })
  }
}

export function runStateOf(row: {
  streak: number
  currentRung: number
  livesRemaining: number
}): RunState {
  return {
    streak: row.streak,
    currentRung: row.currentRung,
    livesRemaining: row.livesRemaining,
  }
}

/** Persist a state the pure layer produced. */
export async function saveRunState(tableRunId: string, state: RunState) {
  return db.tableRun.update({
    where: { id: tableRunId },
    data: {
      streak: state.streak,
      currentRung: state.currentRung,
      livesRemaining: state.livesRemaining,
      lastSeenAt: new Date(),
    },
  })
}

/** Record that this table has now been asked this pair. Table-level (§4.2). */
export async function markPairShown(tableRunId: string, key: string) {
  return db.tableRun.update({
    where: { id: tableRunId },
    data: { pairsShown: { push: key } },
  })
}

// Re-export the pure ranking helpers from the standalone module so existing
// callers (`/dash/games`, `getMenuForGame` below) keep working.  The helpers
// live in their own file so unit tests can import them without pulling in db.
export { assignDefaultChefRanks, rankingReadiness } from './games-ranking'
export type { RankingReadiness } from './games-ranking'

/**
 * The menu as the game sees it.
 *
 * `unitsSold` is the imported trailing count — never a guess. When the venue has
 * no import and no explicit chef ranks, a default order is assigned from the
 * menu's category/name sort so the game is playable immediately.  The guest-facing
 * question still says "the chef reckons" — which is honest when the venue has
 * not yet supplied a real ranking.  The operator can override by setting
 * explicit chef ranks in /dash/menu.
 */
export async function getMenuForGame(venueId: string): Promise<GameItem[]> {
  const rows = await db.menuItem.findMany({
    where: { venueId, active: true },
    select: {
      id: true,
      name: true,
      category: true,
      photoUrl: true,
      trailingSales: true,
      chefRank: true,
      active: true,
    },
  })

  const items: GameItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    photoUrl: r.photoUrl,
    unitsSold: r.trailingSales,
    chefRank: r.chefRank,
    active: r.active,
  }))

  return assignDefaultChefRanks(items)
}

/** Which life-earning actions this run has already used (§4.4). */
export async function earnedLifeActions(tableRunId: string) {
  const rows = await db.event.findMany({
    where: { tableRunId, type: 'LIFE_EARNED' },
    select: { detail: true },
  })

  return rows
    .map((r) => (r.detail as { action?: string } | null)?.action)
    .filter(
      (a): a is 'ADDON_CONFIRMED' | 'PHONE_SUBMITTED' | 'FEEDBACK_SUBMITTED' =>
        a === 'ADDON_CONFIRMED' || a === 'PHONE_SUBMITTED' || a === 'FEEDBACK_SUBMITTED'
    )
}

// Pure, so it lives with the mechanics — re-exported here because this module
// is where its callers historically found it.
export { newRedemptionCode } from '@/core/mechanics/redemption-code'
