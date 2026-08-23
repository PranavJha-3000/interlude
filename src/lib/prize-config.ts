import { DEFAULT_RANKING_WEIGHTS, type RankingWeights } from '@/core/prize-engine'

/**
 * Reads `VenueConfig.rankingWeights` into the shape the engine takes.
 *
 * A `Json` column is whatever is in the row, and this one is edited by an
 * operator in `/dash/prizes`. So it is parsed rather than cast: a missing or
 * non-numeric field falls back to that field's seed, and the rest of the row is
 * still honoured. Refusing the whole object over one bad key would silently
 * revert a venue's tuning; refusing to render at all would take the guest
 * surface down over a typo in a back-office form.
 *
 * The one thing it will not do is invent a number that is not a number.
 */

const FIELDS = Object.keys(DEFAULT_RANKING_WEIGHTS) as (keyof RankingWeights)[]

export function parseRankingWeights(raw: unknown): RankingWeights {
  // A fresh object every time, never the shared seed — one caller mutating
  // what it was handed would change the starting ranking for every venue in
  // the process.
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_RANKING_WEIGHTS }
  }

  const row = raw as Record<string, unknown>
  const parsed = {} as RankingWeights

  for (const field of FIELDS) {
    const value = row[field]
    parsed[field] =
      typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_RANKING_WEIGHTS[field]
  }

  return parsed
}
