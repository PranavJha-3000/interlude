import { describe, expect, it } from 'vitest'
import {
  computeRoundWindow,
  decideOutcome,
  isRoundWorthStarting,
  minutesUntilReady,
  scoreRound,
  secondsRemaining,
  selectQuestions,
  type QuizQuestionInput,
  type RoundConfig,
} from './kitchen-round'

const config: RoundConfig = {
  quizLengthSec: 75,
  countdownBufferSec: 60,
  quizQuestionCount: 8,
  winThresholdPct: 70,
}

const NOW = 1_700_000_000_000

function pool(n: number): QuizQuestionInput[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `q${String(i).padStart(2, '0')}`,
    prompt: `Question ${i}`,
    options: ['a', 'b', 'c', 'd'],
    answerIndex: i % 4,
    difficulty: 1,
    orderHint: i,
  }))
}

describe('the round can never outlast the food', () => {
  it('runs the full quiz length when the food is far away', () => {
    const w = computeRoundWindow(NOW, NOW + 20 * 60_000, config)
    expect(w.durationSec).toBe(75)
    expect(w.clampedByKitchen).toBe(false)
  })

  it('ends a buffer before the plate lands when the food is close', () => {
    const w = computeRoundWindow(NOW, NOW + 90_000, config)
    expect(w.endsAtMs).toBe(NOW + 90_000 - 60_000)
    expect(w.durationSec).toBe(30)
    expect(w.clampedByKitchen).toBe(true)
  })

  it('falls back to the full length when there is no timer at all', () => {
    const w = computeRoundWindow(NOW, null, config)
    expect(w.durationSec).toBe(75)
    expect(w.clampedByKitchen).toBe(false)
  })

  it('never returns a negative duration when the food is already late', () => {
    const w = computeRoundWindow(NOW, NOW - 10 * 60_000, config)
    expect(w.durationSec).toBe(0)
  })

  it('declines to start a round too short to enjoy', () => {
    const w = computeRoundWindow(NOW, NOW + 65_000, config)
    expect(isRoundWorthStarting(w)).toBe(false)
  })
})

describe('question selection is deterministic (a refresh resumes the same round)', () => {
  it('returns the identical set for the same seed', () => {
    const p = pool(40)
    const a = selectQuestions(p, 'session-abc', config)
    const b = selectQuestions(p, 'session-abc', config)
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id))
  })

  it('does not depend on the order the pool arrived in', () => {
    const p = pool(40)
    const a = selectQuestions(p, 'session-abc', config)
    const b = selectQuestions([...p].reverse(), 'session-abc', config)
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id))
  })

  it('gives different tables different questions', () => {
    const p = pool(40)
    const a = selectQuestions(p, 'session-abc', config).map((q) => q.id)
    const b = selectQuestions(p, 'session-xyz', config).map((q) => q.id)
    expect(a).not.toEqual(b)
  })

  it('never repeats a question inside one round', () => {
    const p = pool(40)
    for (const seed of ['a', 'b', 'c', 'longer-session-id', '42']) {
      const ids = selectQuestions(p, seed, config).map((q) => q.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('returns the whole pool rather than failing when it is smaller than the round', () => {
    const ids = selectQuestions(pool(3), 'seed', config).map((q) => q.id)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
  })

  it('returns nothing for an empty pool instead of throwing', () => {
    expect(selectQuestions([], 'seed', config)).toEqual([])
  })
})

describe('scoring', () => {
  const qs = pool(4)

  it('counts only exact matches', () => {
    const s = scoreRound(qs, [0, 1, 2, 3])
    expect(s.score).toBe(4)
    expect(s.maxScore).toBe(4)
  })

  it('treats an unanswered question as wrong, not an error', () => {
    const s = scoreRound(qs, [0, null, undefined as unknown as null, 3])
    expect(s.score).toBe(2)
    expect(s.wrongIds).toHaveLength(2)
  })

  it('treats a short answer array as unanswered', () => {
    const s = scoreRound(qs, [0])
    expect(s.score).toBe(1)
    expect(s.maxScore).toBe(4)
  })
})

describe('outcome is a pure function of skill (PLATFORM.md §7)', () => {
  const qs = pool(10)
  const window = computeRoundWindow(NOW, null, config)

  it('wins at or above the configured threshold', () => {
    const scored = scoreRound(qs, qs.map((q, i) => (i < 7 ? q.answerIndex : 99)))
    expect(scored.score).toBe(7)
    expect(decideOutcome(scored, NOW + 1000, window, config)).toBe('WIN')
  })

  it('loses just below the threshold', () => {
    const scored = scoreRound(qs, qs.map((q, i) => (i < 6 ? q.answerIndex : 99)))
    expect(decideOutcome(scored, NOW + 1000, window, config)).toBe('LOSE')
  })

  it('loses a perfect round submitted after the countdown', () => {
    const scored = scoreRound(qs, qs.map((q) => q.answerIndex))
    expect(decideOutcome(scored, window.endsAtMs + 1, window, config)).toBe('LOSE')
  })

  it('returns the same verdict every time for the same inputs', () => {
    const scored = scoreRound(qs, qs.map((q, i) => (i < 7 ? q.answerIndex : 99)))
    const verdicts = new Set(
      Array.from({ length: 100 }, () => decideOutcome(scored, NOW + 1000, window, config))
    )
    expect(verdicts.size).toBe(1)
  })

  it('honours a changed threshold rather than a hardcoded one', () => {
    const scored = scoreRound(qs, qs.map((q, i) => (i < 5 ? q.answerIndex : 99)))
    expect(decideOutcome(scored, NOW + 1000, window, config)).toBe('LOSE')
    expect(decideOutcome(scored, NOW + 1000, window, { ...config, winThresholdPct: 50 })).toBe(
      'WIN'
    )
  })
})

describe('display helpers', () => {
  it('counts down and floors at zero', () => {
    const w = computeRoundWindow(NOW, null, config)
    expect(secondsRemaining(NOW, w)).toBe(75)
    expect(secondsRemaining(NOW + 74_000, w)).toBe(1)
    expect(secondsRemaining(NOW + 999_000, w)).toBe(0)
  })

  it('rounds the wait to whole minutes', () => {
    expect(minutesUntilReady(NOW, NOW + 7 * 60_000)).toBe(7)
    expect(minutesUntilReady(NOW, NOW - 60_000)).toBe(0)
  })
})
