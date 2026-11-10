/**
 * Pure helpers for Beat the Kitchen's menu ranking.
 *
 * Kept apart from `table-run.ts` (which has a DB dependency) so that:
 * - the dashboard and unit tests can import them without pulling in db
 * - the re-export from `table-run.ts` gives the I/O layer a single seam
 *
 * The helpers mirror the pairing engine's ranking logic: trailingSales > 0 wins,
 * then explicit chefRank, then the default category/name sort — keeping the
 * dashboard's readiness labels in sync with what the game actually runs.
 */

import type { GameItem } from '@/core/game/pairing'

/**
 * What kind of ranking data this venue's menu has for Beat the Kitchen.
 *
 * Used by `/dash/games` to surface an honest note beside the game: an operator
 * whose menu is on the auto-default order should know the game is running on
 * a placeholder and be one click away from taking control.
 */
export type RankingReadiness =
  | { kind: 'TOO_FEW' }
  | { kind: 'SALES' }
  | { kind: 'CHEF' }
  | { kind: 'DEFAULT' }

/**
 * Inspect the live (active) menu and say what the game would actually run on.
 *
 * Pure — no DB, no side effects.  The page passes the rows in; this says what
 * the engine would do.  Order of precedence matches `rankingFor` in the
 * pairing engine: any real sales count wins, then any explicit chef rank, then
 * the default-fallback path.
 */
export function rankingReadiness(
  items: ReadonlyArray<{
    active: boolean
    trailingSales: number
    chefRank: number | null
  }>
): RankingReadiness {
  const active = items.filter((i) => i.active)
  if (active.length < 2) return { kind: 'TOO_FEW' }
  if (active.some((i) => i.trailingSales > 0)) return { kind: 'SALES' }
  if (active.some((i) => i.chefRank !== null)) return { kind: 'CHEF' }
  return { kind: 'DEFAULT' }
}

/**
 * Assign chef ranks to a menu in three cases:
 *
 * 1. **Real sales exist** (`trailingSales > 0` anywhere) — untouched; the
 *    pairing engine ranks by sales.
 * 2. **Every active item has an explicit chef rank** — untouched; the operator
 *    owns the list.
 * 3. **No ranks, or only some items ranked** — every unranked item gets a
 *    rank.  With zero explicit ranks we derive 1..N from the
 *    (category asc, name asc) sort; with a partial list we number unranked
 *    dishes after the highest explicit rank so no dish drops out of pairing.
 *
 * Rule 3 is what keeps a fresh venue playable immediately *and* stops a
 * partially-edited list from dead-ending the game: a single dish left blank
 * would otherwise vanish from every pair and, with one ranked item left, the
 * table would land back on "This game is unavailable".
 *
 * Never overwrites an explicit rank, never invents numbers a server could not
 * defend in a question, and leaves sales-ranked venues completely alone.
 */
export function assignDefaultChefRanks(items: readonly GameItem[]): GameItem[] {
  // Real sales data always wins — never touch a venue that has any.
  if (items.some((i) => i.unitsSold > 0)) return [...items]

  // Full explicit list — the operator owns it.
  if (items.every((i) => i.chefRank !== null)) return [...items]

  const byCategoryThenName = (a: GameItem, b: GameItem) => {
    const cat = a.category.localeCompare(b.category)
    if (cat !== 0) return cat
    return a.name.localeCompare(b.name)
  }

  // Zero explicit ranks — derive 1..N, deterministic per menu.
  if (items.every((i) => i.chefRank === null)) {
    const sorted = [...items].sort(byCategoryThenName)
    return sorted.map((item, index) => ({ ...item, chefRank: index + 1 }))
  }

  // Partial list — keep the operator's ranks, fill the rest starting after the
  // highest one.  Unranked dishes get numbers in category/name order.
  const maxRank = Math.max(
    ...items.map((i) => i.chefRank ?? 0),
  )
  const unranked = items
    .filter((i) => i.chefRank === null)
    .sort(byCategoryThenName)
  let next = maxRank + 1
  const fill = new Map(unranked.map((i) => [i, { ...i, chefRank: next++ }]))
  return items.map((i) => (i.chefRank !== null ? i : fill.get(i)!))
}
