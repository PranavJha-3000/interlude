import { describe, expect, it } from 'vitest'
import {
  applyAnswer,
  canStartRun,
  canTakePrize,
  endRun,
  grantLife,
  newRun,
  offeredLifeActions,
  startRun,
  takePrize,
  type LadderConfig,
  type LifeAction,
} from './run'

/**
 * §4.3 — the part the spec says makes the table argue.
 *
 * The tests worth reading are the gamble ones: a wrong answer has to cost
 * something a guest already had, or pushing on is free and there is nothing to
 * argue about.
 */

const CONFIG: LadderConfig = {
  rungs: 6,
  startingLives: 2,
  gamblePenaltyRungs: 1,
  lifeForAddOn: true,
  lifeForPhone: true,
  lifeForFeedback: true,
}

/** Play n correct answers from a fresh run. */
function climbTo(rung: number, config = CONFIG) {
  let state = startRun(newRun(config))
  for (let i = 0; i < rung; i++) state = applyAnswer(state, true, config).state
  return state
}

describe('the ladder', () => {
  it('advances a rung per correct answer', () => {
    const r = applyAnswer(startRun(newRun(CONFIG)), true, CONFIG)

    expect(r.state.streak).toBe(1)
    expect(r.state.currentRung).toBe(1)
    expect(r.rungReached).toBe(1)
  })

  it('does not run past the top of the ladder', () => {
    const state = climbTo(CONFIG.rungs + 3)

    expect(state.currentRung).toBe(CONFIG.rungs)
  })

  it('ends the run on clearing the top rung, because there is nothing left to push for', () => {
    let state = startRun(newRun(CONFIG))
    let last = applyAnswer(state, true, CONFIG)
    for (let i = 0; i < CONFIG.rungs; i++) {
      last = applyAnswer(state, true, CONFIG)
      state = last.state
    }

    expect(last.endedReason).toBe('PRIZE_TAKEN')
  })

  it('honours a venue with a shorter ladder', () => {
    const short = { ...CONFIG, rungs: 3 }

    expect(climbTo(10, short).currentRung).toBe(3)
  })
})

describe('the gamble (§4.3)', () => {
  it('a wrong answer costs rungs the table had already banked', () => {
    // This is the rule. Without it, pushing on is free.
    const banked = climbTo(4)
    const r = applyAnswer(banked, false, CONFIG)

    expect(banked.currentRung).toBe(4)
    expect(r.state.currentRung).toBe(3)
    expect(r.endedReason).toBe('WRONG_ANSWER')
  })

  it('honours a venue that sets a harsher penalty', () => {
    const harsh = { ...CONFIG, gamblePenaltyRungs: 3 }

    expect(applyAnswer(climbTo(4, harsh), false, harsh).state.currentRung).toBe(1)
  })

  it('never drops below the bottom of the ladder', () => {
    const r = applyAnswer(climbTo(1), false, { ...CONFIG, gamblePenaltyRungs: 5 })

    expect(r.state.currentRung).toBe(0)
  })

  it('offers no consolation — losing from rung one leaves nothing', () => {
    // "Win and you get it; lose and you get nothing."
    const r = applyAnswer(climbTo(1), false, CONFIG)

    expect(canTakePrize(r.state)).toBe(false)
  })

  it('resets the streak but not the rung on a correct-then-wrong sequence', () => {
    const r = applyAnswer(climbTo(3), false, CONFIG)

    expect(r.state.streak).toBe(0)
    expect(r.state.currentRung).toBe(2)
  })
})

describe('taking the prize', () => {
  it('is only offered once the table is on a rung', () => {
    expect(canTakePrize(newRun(CONFIG))).toBe(false)
    expect(canTakePrize(climbTo(1))).toBe(true)
  })

  it('spends the rung, so pushing on is never free', () => {
    // Banking at three and resuming from three would remove the choice.
    expect(takePrize(climbTo(3)).currentRung).toBe(0)
  })
})

describe('lives and inheritance (§4.3)', () => {
  it('spends one life per run', () => {
    const started = startRun(newRun(CONFIG))

    expect(started.livesRemaining).toBe(CONFIG.startingLives - 1)
  })

  it('refuses to start when the table is out of lives', () => {
    const spent = { streak: 0, currentRung: 2, livesRemaining: 0 }

    expect(canStartRun(spent)).toBe(false)
    expect(startRun(spent)).toEqual(spent)
  })

  it('the next person inherits the rung, and does not start at zero', () => {
    // The mechanic. A second phone picks the table up where the first left it.
    const afterFirstRun = applyAnswer(climbTo(3), false, CONFIG).state
    const second = startRun(afterFirstRun)

    expect(second.currentRung).toBe(2)
    expect(second.streak).toBe(0)
  })

  it('does not scale lives with party size — there is no party size here at all', () => {
    // Deliberate (§4.3): the asymmetry between a two-top and a four-top is what
    // makes people deliberate. If this ever takes a party size, that is a bug.
    expect(newRun(CONFIG).livesRemaining).toBe(CONFIG.startingLives)
    expect(newRun({ ...CONFIG, startingLives: 5 }).livesRemaining).toBe(5)
  })
})

describe('earning a life (§4.4)', () => {
  it('grants one for each of the three actions', () => {
    for (const action of [
      'ADDON_CONFIRMED',
      'PHONE_SUBMITTED',
      'FEEDBACK_SUBMITTED',
    ] as LifeAction[]) {
      const { state, granted } = grantLife(newRun(CONFIG), action, [], CONFIG)

      expect(granted).toBe(true)
      expect(state.livesRemaining).toBe(CONFIG.startingLives + 1)
    }
  })

  it('grants each action at most once per run', () => {
    // Otherwise a table refreshes its way to unlimited plays through one tap.
    const { state, granted } = grantLife(
      newRun(CONFIG),
      'ADDON_CONFIRMED',
      ['ADDON_CONFIRMED'],
      CONFIG
    )

    expect(granted).toBe(false)
    expect(state.livesRemaining).toBe(CONFIG.startingLives)
  })

  it('respects a venue switching one action off', () => {
    const noPhone = { ...CONFIG, lifeForPhone: false }
    const { granted } = grantLife(newRun(noPhone), 'PHONE_SUBMITTED', [], noPhone)

    expect(granted).toBe(false)
  })

  it('offers only what is still available on the spent-device screen', () => {
    const config = { ...CONFIG, lifeForFeedback: false }

    expect(offeredLifeActions(['ADDON_CONFIRMED'], config)).toEqual(['PHONE_SUBMITTED'])
  })

  it('offers nothing when every action is spent or disabled', () => {
    expect(
      offeredLifeActions(['ADDON_CONFIRMED', 'PHONE_SUBMITTED', 'FEEDBACK_SUBMITTED'], CONFIG)
    ).toEqual([])
  })
})

describe('ending a run for something other than an answer', () => {
  it('food arriving costs the table nothing — it is the designed ending', () => {
    // §6.2: a success wearing a failure's clothes. The rung survives and can
    // still be claimed.
    const { state, reason } = endRun(climbTo(3), 'FOOD_ARRIVED')

    expect(state.currentRung).toBe(3)
    expect(canTakePrize(state)).toBe(true)
    expect(reason).toBe('FOOD_ARRIVED')
  })

  it('abandonment likewise leaves the rung standing for the next person', () => {
    expect(endRun(climbTo(2), 'ABANDONED').state.currentRung).toBe(2)
  })
})

describe('purity', () => {
  it('never mutates the state it was given', () => {
    const before = climbTo(3)
    const snapshot = { ...before }

    applyAnswer(before, true, CONFIG)
    applyAnswer(before, false, CONFIG)
    takePrize(before)
    grantLife(before, 'ADDON_CONFIRMED', [], CONFIG)

    expect(before).toEqual(snapshot)
  })

  it('is deterministic', () => {
    const runs = Array.from({ length: 50 }, () => applyAnswer(climbTo(3), false, CONFIG))

    expect(new Set(runs.map((r) => JSON.stringify(r))).size).toBe(1)
  })
})
