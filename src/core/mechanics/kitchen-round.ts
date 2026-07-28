/**
 * #5 Kitchen-timed round (PLATFORM.md §4).
 *
 * Pure logic, no I/O, no clock, no randomness. Every "now" is an argument, so
 * a round is fully reproducible from its recorded inputs — which is what lets
 * us settle a dispute at the table without guessing.
 */

export interface QuizQuestionInput {
  id: string
  prompt: string
  options: string[]
  answerIndex: number
  difficulty: number
  orderHint: number
}

export interface RoundConfig {
  quizLengthSec: number
  countdownBufferSec: number
  quizQuestionCount: number
  winThresholdPct: number
}

export interface RoundWindow {
  /** Server-issued. The client is never the authority (PLATFORM.md §11). */
  endsAtMs: number
  /** Seconds the guest actually gets, after clamping to the food's arrival. */
  durationSec: number
  /** True when the food arrives before a full-length round would finish. */
  clampedByKitchen: boolean
}

export type RoundOutcome = 'WIN' | 'LOSE'

/**
 * When does this round end?
 *
 * The guest is racing the kitchen, so the round can never outlast the food:
 * we end a buffer before the plate is expected, or after the configured quiz
 * length, whichever comes first. Returning an absolute timestamp — rather than
 * a duration — is what makes clock skew and tab-suspend harmless.
 */
export function computeRoundWindow(
  nowMs: number,
  estReadyAtMs: number | null,
  config: RoundConfig
): RoundWindow {
  const fullLengthEnd = nowMs + config.quizLengthSec * 1000

  if (estReadyAtMs === null) {
    return {
      endsAtMs: fullLengthEnd,
      durationSec: config.quizLengthSec,
      clampedByKitchen: false,
    }
  }

  const kitchenEnd = estReadyAtMs - config.countdownBufferSec * 1000
  const endsAtMs = Math.min(fullLengthEnd, kitchenEnd)
  const durationSec = Math.max(0, Math.round((endsAtMs - nowMs) / 1000))

  return {
    endsAtMs,
    durationSec,
    clampedByKitchen: kitchenEnd < fullLengthEnd,
  }
}

/**
 * Is there enough time left to be worth starting?
 * A five-second round is a worse experience than no round at all.
 */
export function isRoundWorthStarting(window: RoundWindow, minimumSec = 20): boolean {
  return window.durationSec >= minimumSec
}

/**
 * Pick the questions for a round.
 *
 * Deterministic: the same session id always draws the same questions, so a
 * refresh or a dropped connection resumes the identical round rather than
 * handing the guest an easier one. The rotation is a pure function of the
 * seed — there is no RNG here, and the lint rule in eslint.config.mjs makes
 * sure there never is.
 */
export function selectQuestions(
  pool: QuizQuestionInput[],
  seed: string,
  config: RoundConfig
): QuizQuestionInput[] {
  const count = Math.min(config.quizQuestionCount, pool.length)
  if (count === 0) return []

  // Stable base order first, so the input's own ordering cannot leak in.
  const ordered = [...pool].sort(
    (a, b) => a.orderHint - b.orderHint || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )

  // Rotate by a hash of the seed, then take a stride through the pool so two
  // adjacent tables do not get the same run of questions.
  const h = hashString(seed)
  const start = h % ordered.length
  const stride = 1 + (h % Math.max(1, ordered.length - 1))

  const picked: QuizQuestionInput[] = []
  const taken = new Set<number>()
  let i = start
  while (picked.length < count) {
    if (!taken.has(i)) {
      taken.add(i)
      picked.push(ordered[i]!)
    }
    i = (i + stride) % ordered.length
    // Stride can cycle before covering the pool; step on by one to continue.
    if (taken.size < ordered.length && taken.has(i) && picked.length < count) {
      i = (i + 1) % ordered.length
    }
  }
  return picked
}

/** FNV-1a. Small, stable across runs and platforms, and not a security hash. */
function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

export interface ScoredRound {
  score: number
  maxScore: number
  correctIds: string[]
  wrongIds: string[]
}

/**
 * Score a round. An unanswered question is wrong, never an error — a guest
 * whose food arrived mid-round still gets a result.
 */
export function scoreRound(
  questions: QuizQuestionInput[],
  answers: ReadonlyArray<number | null>
): ScoredRound {
  const correctIds: string[] = []
  const wrongIds: string[] = []

  questions.forEach((q, idx) => {
    const given = answers[idx]
    if (given !== undefined && given !== null && given === q.answerIndex) {
      correctIds.push(q.id)
    } else {
      wrongIds.push(q.id)
    }
  })

  return {
    score: correctIds.length,
    maxScore: questions.length,
    correctIds,
    wrongIds,
  }
}

/**
 * Win or lose — a pure function of the skill input and nothing else.
 * PLATFORM.md §7: no chance may enter this path.
 *
 * Finishing after the countdown is a loss, but the guest still leaves with
 * something; the guaranteed-value consolation lives in the prize engine, not
 * here.
 */
export function decideOutcome(
  scored: ScoredRound,
  completedAtMs: number,
  window: RoundWindow,
  config: RoundConfig
): RoundOutcome {
  if (completedAtMs > window.endsAtMs) return 'LOSE'
  if (scored.maxScore === 0) return 'LOSE'
  const pct = (scored.score / scored.maxScore) * 100
  return pct >= config.winThresholdPct ? 'WIN' : 'LOSE'
}

/** Seconds remaining, clamped at zero. For display only — truth is `endsAtMs`. */
export function secondsRemaining(nowMs: number, window: RoundWindow): number {
  return Math.max(0, Math.ceil((window.endsAtMs - nowMs) / 1000))
}

/** Minutes until the food lands, for the "about 7 minutes out" line. */
export function minutesUntilReady(nowMs: number, estReadyAtMs: number): number {
  return Math.max(0, Math.round((estReadyAtMs - nowMs) / 60000))
}
