/**
 * The ladder, the streak, the lives and the gamble (§4.3, §4.4).
 *
 * Pure. Every function takes the table's state and returns the next one, so the
 * whole mechanic can be played out in a test without a database — and so the
 * one genuinely contentious rule in the product, *what a wrong answer costs*,
 * is written in one place where it can be read and argued with.
 *
 * The unit throughout is the **table**, never the phone. A device is only a
 * life being spent; the streak, the rung and the pairs already asked all belong
 * to the run, which is what lets the next person pick up where the last one
 * stopped. That inheritance is the mechanic, not a convenience.
 */

export interface LadderConfig {
  /** Rungs on the ladder, and the most prizes one run can put in play. */
  rungs: number
  /** Runs a table starts with, before it has to earn more. */
  startingLives: number
  /** How far a wrong answer drops the table while pushing on. */
  gamblePenaltyRungs: number
  lifeForAddOn: boolean
  lifeForPhone: boolean
  lifeForFeedback: boolean
}

export interface RunState {
  /** Consecutive correct answers standing right now. */
  streak: number
  /** Highest rung the table currently holds. A prize is taken from here. */
  currentRung: number
  livesRemaining: number
}

export type LifeAction = 'ADDON_CONFIRMED' | 'PHONE_SUBMITTED' | 'FEEDBACK_SUBMITTED'

export type RunEndReason = 'WRONG_ANSWER' | 'FOOD_ARRIVED' | 'ABANDONED' | 'TIMEOUT' | 'PRIZE_TAKEN'

export interface AnswerResult {
  state: RunState
  correct: boolean
  /** Set when this answer put the table on a new rung. */
  rungReached: number | null
  /** Set when the run is over. */
  endedReason: RunEndReason | null
}

/** A table that has never played. */
export function newRun(config: LadderConfig): RunState {
  return { streak: 0, currentRung: 0, livesRemaining: config.startingLives }
}

/**
 * Is there a run available to start?
 *
 * Lives are finite and equal, and deliberately do not scale with party size
 * (§4.3): a table of two has fewer phones than a table of four, and that
 * asymmetry is what makes people deliberate and pull someone else in.
 */
export function canStartRun(state: RunState): boolean {
  return state.livesRemaining > 0
}

/** Spend one life. Called when a device actually begins a run, not on scan. */
export function startRun(state: RunState): RunState {
  if (!canStartRun(state)) return state
  return { ...state, livesRemaining: state.livesRemaining - 1, streak: 0 }
}

/**
 * One answer.
 *
 * Correct advances the streak and, if it clears the table's high-water mark, the
 * rung with it. Wrong ends the run and **costs the table rungs it had already
 * banked** — there is no protected floor and no consolation prize (§4.3). That
 * is the whole gamble: pushing on is only interesting because declining to push
 * is a real alternative.
 */
export function applyAnswer(state: RunState, correct: boolean, config: LadderConfig): AnswerResult {
  if (!correct) {
    const dropped = Math.max(0, state.currentRung - config.gamblePenaltyRungs)
    return {
      state: { ...state, streak: 0, currentRung: dropped },
      correct: false,
      rungReached: null,
      endedReason: 'WRONG_ANSWER',
    }
  }

  const streak = state.streak + 1
  // The rung is a high-water mark, so a second guest inheriting a rung-3 table
  // does not have to re-climb three rungs to be back where the table was.
  const currentRung = Math.min(config.rungs, Math.max(state.currentRung, streak))
  const rungReached = currentRung > state.currentRung ? currentRung : null

  return {
    state: { ...state, streak, currentRung },
    correct: true,
    rungReached,
    // Clearing the top rung ends the run: there is nothing left to push for.
    endedReason: currentRung >= config.rungs ? 'PRIZE_TAKEN' : null,
  }
}

/** Is the table at a rung where it may stop and take something? */
export function canTakePrize(state: RunState): boolean {
  return state.currentRung > 0
}

/**
 * Take the prize at the current rung and stop.
 *
 * The rung is spent: banking at three and carrying on from three would make
 * pushing free, and the choice at every rung is the only thing that makes the
 * table argue.
 */
export function takePrize(state: RunState): RunState {
  return { ...state, streak: 0, currentRung: 0 }
}

/** End a run for a reason that is not an answer — food landed, tab closed. */
export function endRun(
  state: RunState,
  reason: RunEndReason
): { state: RunState; reason: RunEndReason } {
  // Food arriving is the designed ending, not a failure, so it costs nothing.
  // The table keeps its rung and can still claim it.
  return { state: { ...state, streak: 0 }, reason }
}

/** Is this action switched on at this venue (§4.4)? */
export function lifeActionEnabled(action: LifeAction, config: LadderConfig): boolean {
  switch (action) {
    case 'ADDON_CONFIRMED':
      return config.lifeForAddOn
    case 'PHONE_SUBMITTED':
      return config.lifeForPhone
    case 'FEEDBACK_SUBMITTED':
      return config.lifeForFeedback
  }
}

/**
 * Grant a life for one of the three earning actions.
 *
 * The add-on life is granted on **staff confirmation, never on request**
 * (§4.4) — otherwise the life is bought by tapping a button, and the behaviour
 * the product exists to cause is not the behaviour being rewarded.
 *
 * Each action grants at most one life per run, or a table could refresh its way
 * to unlimited plays through the same tap.
 */
export function grantLife(
  state: RunState,
  action: LifeAction,
  alreadyEarned: readonly LifeAction[],
  config: LadderConfig
): { state: RunState; granted: boolean } {
  if (!lifeActionEnabled(action, config)) return { state, granted: false }
  if (alreadyEarned.includes(action)) return { state, granted: false }

  return { state: { ...state, livesRemaining: state.livesRemaining + 1 }, granted: true }
}

/**
 * What the spent-device screen offers (§4.5).
 *
 * The most-seen failure state on night one, and it must read as an instruction
 * rather than a wall — so this returns what is still *available*, not merely
 * the fact that nothing is.
 */
export function offeredLifeActions(
  alreadyEarned: readonly LifeAction[],
  config: LadderConfig
): LifeAction[] {
  const all: LifeAction[] = ['ADDON_CONFIRMED', 'PHONE_SUBMITTED', 'FEEDBACK_SUBMITTED']
  return all.filter((a) => lifeActionEnabled(a, config) && !alreadyEarned.includes(a))
}
