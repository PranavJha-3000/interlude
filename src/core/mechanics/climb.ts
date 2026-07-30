/**
 * #5 Kitchen-timed round, the climb (PLATFORM.md §4).
 *
 * Replaces the food-trivia quiz. Three things were wrong with it, and only the
 * third was cosmetic:
 *
 * 1. **It was 75 seconds against a 12-minute prep.** The guest finished, put the
 *    phone down, and went back to waiting — which is the exact problem the
 *    product exists to solve. A run now lasts as long as the food does.
 * 2. **We wrote the questions.** Twenty rows of generic food trivia, identical
 *    at every venue, and every new restaurant either inherited ours or had to
 *    author a bank nobody has time to author. The climb is dealt from the
 *    venue's own `MenuItem` rows — the content is the menu, so it costs an
 *    operator nothing and it is different at every restaurant by construction.
 * 3. **It asked people to know things.** A guest who does not know which lentil
 *    is in dal makhani feels stupid in front of the person they came with. The
 *    answers here are printed on the menu on their table. It is a race, not a
 *    test.
 *
 * Pure logic, no I/O, no clock, no randomness. Every "now" is an argument, and
 * every hand is a pure function of (menu, seed, rung), so a run is fully
 * reproducible from its recorded inputs — which is what lets us settle a
 * dispute at the table without guessing, and what keeps the ESLint ban on
 * `Math.random` in this directory satisfiable rather than merely enforced.
 */

import { hashString } from './hash'

export interface ClimbItemInput {
  id: string
  name: string
  pricePaise: number
}

export interface ClimbConfig {
  /** How many rungs the ladder has. Venue config, never a constant. */
  rungs: number
  /** Seconds a single hand is worth attempting. Display only — see below. */
  handSec: number
  /** Below this much cooking time left, do not start a run at all. */
  minRunSec: number
}

/** Tap the dearer of two dishes. One tap, and the fast rungs are these. */
export interface PairHand {
  kind: 'PAIR'
  rung: number
  /** Presented in this order. Never sorted by price — that would be the answer. */
  itemIds: [string, string]
}

/** Put three-to-five dishes in price order, cheapest first. */
export interface LadderHand {
  kind: 'LADDER'
  rung: number
  /** Presented in this (scrambled) order. */
  itemIds: string[]
}

export type Hand = PairHand | LadderHand
export type HandKind = Hand['kind']

/**
 * How long does this run last?
 *
 * The whole point: the run ends when the food is nearly down, not after a fixed
 * length. A slow kitchen is not a worse experience here, it is a longer climb —
 * which is the only honest way to compensate a guest for a wait, and it is why
 * the countdown is issued as an absolute server timestamp rather than a
 * duration (PLATFORM.md §11). Clock skew and a suspended tab cannot desync it.
 *
 * `estReadyAtMs === null` means the kitchen gave us no estimate. We do not
 * invent one — an unbounded run whose prize ladder never resolves is worse than
 * no run — so the caller gets `null` and shows the no-estimate copy.
 */
export function computeRunWindow(
  nowMs: number,
  estReadyAtMs: number | null,
  countdownBufferSec: number
): { endsAtMs: number; durationSec: number } | null {
  if (estReadyAtMs === null) return null

  const endsAtMs = estReadyAtMs - countdownBufferSec * 1000
  const durationSec = Math.max(0, Math.round((endsAtMs - nowMs) / 1000))
  return { endsAtMs, durationSec }
}

/**
 * Is there enough cooking time left to be worth starting?
 * A run that ends on rung one is a worse experience than no run at all.
 */
export function isRunWorthStarting(durationSec: number, config: ClimbConfig): boolean {
  return durationSec >= config.minRunSec
}

/**
 * How many items does the ladder at this rung hold?
 *
 * Odd rungs are pairs, so this is only meaningful for even ones. Growth is
 * deliberately slow — six dishes is already at the edge of what fits on a phone
 * above the fold, and a hand that scrolls is a hand that gets abandoned.
 */
export function ladderSizeForRung(rung: number): number {
  return 3 + Math.floor((rung - 1) / 2)
}

/** Odd rungs are the fast ones. Keeps the rhythm from flattening out. */
export function handKindForRung(rung: number): HandKind {
  return rung % 2 === 1 ? 'PAIR' : 'LADDER'
}

/**
 * How long is this hand worth attempting?
 *
 * `handSec` is the budget for a pair — one tap, two dishes. A ladder cannot
 * have the same budget: the guest is hunting prices on a paper menu, and five
 * dishes at twenty-five seconds is not hard, it is impossible. Everyone would
 * stall on the same rung and the top of the ladder would never be reached by
 * anyone, which looks like difficulty and is actually a bug.
 *
 * Eight seconds per dish beyond the pair. The run clock still bounds the whole
 * thing, so a generous hand budget costs the venue nothing — it just means a
 * guest gets fewer, fairer hands out of the same wait.
 */
export function handSecondsFor(hand: Hand, config: ClimbConfig): number {
  return config.handSec + Math.max(0, hand.itemIds.length - 2) * 8
}

/**
 * How many distinct hands exist per rung before they repeat.
 *
 * A missed hand is re-dealt rather than ending the run, so the guest needs more
 * than one hand per rung — otherwise a retry is the same hand with the answer
 * already known. Four is enough that repeats are rare inside one run, and small
 * enough that `handSeedFor` stays a cheap modulo on both sides.
 */
export const HANDS_PER_RUNG = 4

/**
 * The seed for the nth attempt at a rung.
 *
 * The client deals its own hands with `dealHand` and the server re-deals them
 * to score. They agree because they call the same function on the same seed —
 * a structural guarantee rather than a wire format someone has to keep in sync,
 * and the reason no hand is ever sent over the network in either direction.
 */
export function handSeedFor(sessionId: string, attempt: number): string {
  return `${sessionId}#${attempt % HANDS_PER_RUNG}`
}

/**
 * Deal the hand for a rung.
 *
 * Difficulty is **price spread**, and it narrows as the climb goes on. At rung
 * one the dishes are drawn from opposite ends of the menu and the answer is
 * obvious at a glance; by the top rung they are adjacent in price and the guest
 * has to actually read the menu on their table. That is the escalation, and it
 * comes free from data the venue has already entered — there is no difficulty
 * field for anyone to tune, and nothing to get wrong at onboarding.
 *
 * Returns `null` when the venue's menu is too small to deal a fair hand, which
 * is a real case for a café with four items and must not throw at the table.
 */
export function dealHand(
  menu: ClimbItemInput[],
  seed: string,
  rung: number,
  config: ClimbConfig
): Hand | null {
  const kind = handKindForRung(rung)
  const size = kind === 'PAIR' ? 2 : ladderSizeForRung(rung)

  // One item per distinct price. Two dishes at ₹180 make a hand with no right
  // answer, and the guest is the one who finds that out.
  const distinct = distinctByPrice(menu)
  if (distinct.length < size) return null

  const h = hashString(`${seed}:${rung}`)

  // Stride is the gap, in price rank, between the dishes in a hand. It runs
  // from "as wide as the menu allows" at rung one down to 1 — adjacent prices —
  // at the top rung.
  const maxStride = Math.max(1, Math.floor((distinct.length - 1) / (size - 1)))
  const progress = config.rungs <= 1 ? 1 : (rung - 1) / (config.rungs - 1)
  const stride = Math.max(1, Math.round(maxStride - progress * (maxStride - 1)))

  const span = (size - 1) * stride
  const offset = h % Math.max(1, distinct.length - span)

  const picked: ClimbItemInput[] = []
  for (let i = 0; i < size; i++) picked.push(distinct[offset + i * stride]!)

  const shown = scramble(picked, h)
  if (kind === 'PAIR') {
    return { kind: 'PAIR', rung, itemIds: [shown[0]!.id, shown[1]!.id] }
  }
  return { kind: 'LADDER', rung, itemIds: shown.map((i) => i.id) }
}

/**
 * Did the guest clear this hand?
 *
 * `answer` is the ids in the order the guest left them: for a pair, the one
 * they tapped; for a ladder, their arrangement cheapest-first. An answer that
 * does not name exactly the hand's own items is a failed hand, not an error —
 * a guest whose food arrived mid-tap still gets a result.
 */
export function isHandCleared(
  hand: Hand,
  answer: readonly string[],
  priceOf: ReadonlyMap<string, number>
): boolean {
  if (hand.kind === 'PAIR') {
    if (answer.length !== 1) return false
    const [a, b] = hand.itemIds
    const pa = priceOf.get(a)
    const pb = priceOf.get(b)
    if (pa === undefined || pb === undefined) return false
    const dearer = pa >= pb ? a : b
    return answer[0] === dearer
  }

  if (answer.length !== hand.itemIds.length) return false
  if (!sameSet(answer, hand.itemIds)) return false

  let prev = -Infinity
  for (const id of answer) {
    const p = priceOf.get(id)
    if (p === undefined) return false
    // Non-strict: two dishes at the same price may sit either way round. The
    // deal avoids duplicate prices, but a menu edit mid-service could land one
    // here, and the guest must not be marked wrong for our race.
    if (p < prev) return false
    prev = p
  }
  return true
}

/**
 * One rung of the prize ladder — a whole dish, at a real depth, with the
 * engine's own reason attached.
 */
export interface PrizeRung {
  rung: number
  itemId: string
  valuePaise: number
  reason: string
}

/**
 * Turn the engine's pool into a ladder.
 *
 * The pool is already fenced, scored and reasoned by `decidePrizePool`; all
 * this does is sort it by what it concedes and hand out one entry per rung, so
 * climbing is worth more. Rung 1 is the cheapest thing the venue was willing to
 * put up, the top rung the dearest it allowed.
 *
 * **Every rung is one complete dish.** There is no partial win and no fraction
 * of a prize anywhere in this path: a guest who reaches rung three has won the
 * rung-three dish outright, and a guest who reaches none gets the consolation
 * pool, which is also a real item. Ties in value break by item id so the ladder
 * is stable across two calls with the same pool.
 */
export function buildPrizeLadder(
  entries: ReadonlyArray<{ itemId: string; valuePaise: number; reason: string }>,
  rungs: number
): PrizeRung[] {
  const sorted = [...entries].sort(
    (a, b) =>
      a.valuePaise - b.valuePaise || (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0)
  )
  return sorted.slice(0, Math.max(0, rungs)).map((e, i) => ({
    rung: i + 1,
    itemId: e.itemId,
    valuePaise: e.valuePaise,
    reason: e.reason,
  }))
}

/**
 * What did the run come to?
 *
 * A pure function of how far they climbed — no chance enters this path
 * (PLATFORM.md §7). Reaching no rung is a loss, and the guaranteed-value
 * consolation for it lives in the prize engine, not here.
 */
export function decideRun(
  rungsCleared: number,
  ladder: readonly PrizeRung[]
): { outcome: 'WIN' | 'LOSE'; reached: PrizeRung | null } {
  const capped = Math.min(rungsCleared, ladder.length)
  if (capped < 1) return { outcome: 'LOSE', reached: null }
  return { outcome: 'WIN', reached: ladder[capped - 1]! }
}

/** Seconds left in the run, clamped at zero. Display only — truth is `endsAtMs`. */
export function secondsRemaining(nowMs: number, endsAtMs: number): number {
  return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000))
}

// ---------------------------------------------------------------------------

function distinctByPrice(menu: ClimbItemInput[]): ClimbItemInput[] {
  const byPrice = new Map<number, ClimbItemInput>()
  // Sort first so "which duplicate survives" is a property of the data, not of
  // the order the database happened to return.
  const ordered = [...menu].sort(
    (a, b) => a.pricePaise - b.pricePaise || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )
  for (const item of ordered) if (!byPrice.has(item.pricePaise)) byPrice.set(item.pricePaise, item)
  return [...byPrice.values()]
}

/**
 * Deterministic shuffle. A rotation would leave the cheapest first half the
 * time.
 *
 * The final swap is not paranoia. A fair shuffle of three dishes lands on the
 * already-sorted order one hand in six, and a ladder dealt pre-sorted is one
 * the guest clears by touching nothing — we would be handing out the top rung
 * for free, roughly every sixth hand, and nobody would notice from the numbers.
 * Items in a hand always have distinct prices, so swapping the first two is
 * enough to break it.
 */
function scramble(items: ClimbItemInput[], h: number): ClimbItemInput[] {
  const out = [...items]
  // Fisher-Yates driven by a counter hash rather than an RNG, so the same seed
  // always deals the same hand and a refresh cannot reroll into an easier one.
  for (let i = out.length - 1; i > 0; i--) {
    const j = hashString(`${h}:${i}`) % (i + 1)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }

  if (out.length > 2 && isAscending(out)) {
    ;[out[0], out[1]] = [out[1]!, out[0]!]
  }
  return out
}

function isAscending(items: ClimbItemInput[]): boolean {
  for (let i = 1; i < items.length; i++) {
    if (items[i]!.pricePaise < items[i - 1]!.pricePaise) return false
  }
  return true
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const seen = new Set(b)
  for (const id of a) {
    if (!seen.delete(id)) return false
  }
  return seen.size === 0
}
