import 'server-only'

import { db } from '@/lib/db'

/**
 * The review funnel's two writes.
 *
 * A second module now writes `ReviewPrompt` rows, so it gets the same blindness
 * as the screen: `interlude/review-funnel-isolation` forbids it from importing
 * prize, game, loyalty or identity state. A helper that could read a win could
 * be given an `if (won)` around the write, and from then on the funnel would
 * silently be measuring winners rather than tables — while still looking like a
 * funnel (§7.2).
 *
 * Both are idempotent upserts on `ReviewPrompt.tableRunId`, which is why that
 * column gained a unique constraint. The guest surface polls, so a screen that
 * created a row per render would have inflated "shown" by however long a table
 * left the page open.
 */

/**
 * The prompt's entry link rendered — the top of the funnel.
 *
 * Called from the guest page rather than the review screen, deliberately. Before
 * this, `shownAt` was written when a guest *opened* `/review`, which meant the
 * funnel had no denominator: every row that existed had already converted, and
 * the tables that saw the link and ignored it were invisible.
 */
export async function markReviewShown(tableRunId: string, serviceId: string): Promise<void> {
  await db.reviewPrompt.upsert({
    where: { tableRunId },
    update: {},
    create: { tableRunId, serviceId },
  })
}

/**
 * The guest opened the review screen.
 *
 * `updateMany` with `openedAt: null` rather than a plain update, so a reload
 * does not move the timestamp to the most recent visit.
 */
export async function markReviewOpened(tableRunId: string): Promise<void> {
  await db.reviewPrompt.updateMany({
    where: { tableRunId, openedAt: null },
    data: { openedAt: new Date() },
  })
}

export interface ReviewFunnelCounts {
  shown: number
  opened: number
  handedOff: number
}

/** The three counts for one service. Counts only — there is no rating to read. */
export async function reviewFunnelFor(serviceId: string): Promise<ReviewFunnelCounts> {
  const [shown, opened, handedOff] = await Promise.all([
    db.reviewPrompt.count({ where: { serviceId } }),
    db.reviewPrompt.count({ where: { serviceId, openedAt: { not: null } } }),
    db.reviewPrompt.count({ where: { serviceId, handedOffAt: { not: null } } }),
  ])
  return { shown, opened, handedOff }
}
