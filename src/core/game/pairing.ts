import { hashToRange } from '@/core/mechanics/hash'

/**
 * Beat the Kitchen — which two dishes to show (§4.2).
 *
 * Pure and deterministic. The seed comes from the table run, so a pair can be
 * reproduced from the recorded inputs months later when someone disputes it —
 * which is what "no chance, anywhere" means in practice (§7.1), and why
 * `Math.random` is banned by lint in this directory.
 *
 * **The pairing rule is the load-bearing part of this file.** A pair is only
 * eligible when the higher seller outsells the lower by at least the venue's
 * configured ratio. There is real money on a wrong answer: a guest who loses a
 * dessert on what looks to them like a coin flip will argue with a server, and
 * the server has to be able to defend the answer out loud, immediately, without
 * looking anything up. A close pair cannot be defended, so it is never asked.
 */

export interface GameItem {
  id: string
  name: string
  category: string
  photoUrl: string | null
  /** Units sold in the venue's configured window. */
  unitsSold: number
  /** The chef's ordering, lower being more popular. Used only without sales. */
  chefRank: number | null
  active: boolean
}

export interface PairingConfig {
  /** Higher seller must exceed the lower by at least this multiple. */
  gapRatio: number
}

/** Where the ranking came from. The guest-facing question copy depends on it. */
export type RankingBasis = 'SALES' | 'CHEF'

export interface Pair {
  /** The correct answer — the item more people order here. */
  higherId: string
  lowerId: string
  /** Presentation order. Deterministic, so the answer is not always on one side. */
  leftId: string
  rightId: string
  /** How many times the higher outsells the lower. Never shown to the guest. */
  gapRatio: number
  basis: RankingBasis
}

/**
 * A stable key for "this pair has been shown", order-independent.
 *
 * Table-level, not device-level (§4.2): the second guest at a table inherits
 * the streak, so re-asking them the first guest's questions would hand them a
 * free rung.
 */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

/**
 * Can these two be asked?
 *
 * Zero is contagious on purpose: an item that has never sold gives a ratio of
 * infinity against another that has never sold, which is not a defensible
 * question — it is two dishes nobody orders. Both must have sold something.
 */
export function isEligiblePair(a: GameItem, b: GameItem, config: PairingConfig): boolean {
  if (a.id === b.id) return false
  if (!a.active || !b.active) return false

  const hi = Math.max(a.unitsSold, b.unitsSold)
  const lo = Math.min(a.unitsSold, b.unitsSold)
  if (lo <= 0) return false

  return hi / lo >= config.gapRatio
}

/**
 * Every pair this menu can defend, in a deterministic order.
 *
 * Built eagerly rather than by sampling. A menu is tens of items, so the
 * quadratic is nothing, and having the whole set makes "no repeats" and "we ran
 * out of questions" exact rather than probabilistic.
 */
export function eligiblePairs(
  items: readonly GameItem[],
  config: PairingConfig
): Array<{ higherId: string; lowerId: string; gapRatio: number }> {
  const sorted = [...items].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
  const out: Array<{ higherId: string; lowerId: string; gapRatio: number }> = []

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!
      const b = sorted[j]!
      if (!isEligiblePair(a, b, config)) continue

      const higher = a.unitsSold >= b.unitsSold ? a : b
      const lower = higher === a ? b : a
      out.push({
        higherId: higher.id,
        lowerId: lower.id,
        gapRatio: lower.unitsSold === 0 ? Infinity : higher.unitsSold / lower.unitsSold,
      })
    }
  }

  return out
}

/**
 * Rank by the chef's ordering when there is no sales history.
 *
 * The ranks are turned into synthetic counts so one pairing rule serves both
 * bases — but the basis is reported, because §4.2 forbids presenting a guess as
 * data and the question copy has to change.
 */
export function fromChefRanking(items: readonly GameItem[]): GameItem[] {
  const ranked = items.filter((i) => i.chefRank !== null)
  const worst = ranked.reduce((m, i) => Math.max(m, i.chefRank!), 0)

  return items.map((i) =>
    i.chefRank === null
      ? { ...i, unitsSold: 0 }
      : { ...i, unitsSold: (worst - i.chefRank + 1) ** 2 }
  )
}

/** Sales if the venue has any, otherwise the chef's list — and say which. */
export function rankingFor(items: readonly GameItem[]): { items: GameItem[]; basis: RankingBasis } {
  const hasSales = items.some((i) => i.unitsSold > 0)
  if (hasSales) return { items: [...items], basis: 'SALES' }
  return { items: fromChefRanking(items), basis: 'CHEF' }
}

/**
 * Deal the next pair for a table.
 *
 * Returns null when the menu has no defensible pair left that this table has
 * not already seen — a real state, and one the caller must handle by ending the
 * run rather than by relaxing the gap ratio. Loosening the rule to keep a game
 * going is precisely the trade §4.2 refuses.
 */
export function dealPair(
  items: readonly GameItem[],
  config: PairingConfig,
  alreadyShown: readonly string[],
  seed: string
): Pair | null {
  const { items: ranked, basis } = rankingFor(items)
  const pool = eligiblePairs(ranked, config)
  if (pool.length === 0) return null

  const seen = new Set(alreadyShown)
  const fresh = pool.filter((p) => !seen.has(pairKey(p.higherId, p.lowerId)))
  if (fresh.length === 0) return null

  const pick = fresh[hashToRange(seed, fresh.length)]!

  // Which side the answer falls on is its own decision, or the correct dish
  // would sit under the same thumb every time and the game would be solvable
  // without reading it. `hashToRange`, not `% 2`: FNV-1a's lowest bit is the
  // byte parity of the seed, which for `${runId}:${index}:side` alternates
  // with the index — the answer would swap sides on a schedule.
  const answerOnLeft = hashToRange(`${seed}:side`, 2) === 0

  return {
    higherId: pick.higherId,
    lowerId: pick.lowerId,
    leftId: answerOnLeft ? pick.higherId : pick.lowerId,
    rightId: answerOnLeft ? pick.lowerId : pick.higherId,
    gapRatio: pick.gapRatio,
    basis,
  }
}

/** The seed for one question. Derived from the run, so it is reproducible. */
export function pairSeedFor(tableRunId: string, questionIndex: number): string {
  return `${tableRunId}:${questionIndex}`
}

/** Did the guest tap the dish more people order? */
export function isCorrect(pair: Pair, chosenId: string): boolean {
  return chosenId === pair.higherId
}
