'use client'

import { useEffect, useRef, useState } from 'react'
import { en } from '@/strings/en'

/**
 * The only part of the guest flow that needs client JavaScript.
 *
 * The countdown animates locally but its truth is `endsAtMs`, issued by the
 * server (PLATFORM.md §11). Clock skew, a locked screen and a switched app all
 * resolve correctly on return because we recompute from the absolute
 * timestamp rather than decrementing a counter.
 */

export interface RoundQuestion {
  id: string
  prompt: string
  options: string[]
}

export function Round({
  questions,
  endsAtMs,
  serverNowMs,
  action,
}: {
  questions: RoundQuestion[]
  endsAtMs: number
  serverNowMs: number
  action: (formData: FormData) => void
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const submittedRef = useRef(false)

  const total = Math.max(0, Math.round((endsAtMs - serverNowMs) / 1000))
  const [left, setLeft] = useState(total)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({})

  useEffect(() => {
    // The client clock can be wrong by minutes, so measure from the server's
    // own "now" rather than trusting Date.now() outright. Reading the clock
    // here rather than during render also keeps the first paint deterministic,
    // so there is nothing to mismatch on hydration.
    //
    // This offset absorbs network and hydration time too, which errs a second
    // or so in the guest's favour. Harmless: the server re-checks `endsAt` on
    // submit and is the only authority on whether they beat the kitchen.
    const skew = serverNowMs - Date.now()

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endsAtMs - (Date.now() + skew)) / 1000))
      setLeft(remaining)
      if (remaining === 0 && !submittedRef.current) {
        submittedRef.current = true
        // Time is up: submit whatever the guest has. Arriving late is a loss,
        // not an error, and the server decides which.
        formRef.current?.requestSubmit()
      }
    }

    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [endsAtMs, serverNowMs])

  const question = questions[index]
  const isLast = index === questions.length - 1
  const pct = total > 0 ? Math.max(0, Math.min(100, (left / total) * 100)) : 0
  const urgent = left <= 10

  function choose(questionId: string, optionIndex: number) {
    setAnswers((a) => ({ ...a, [questionId]: optionIndex }))
    if (isLast) {
      if (!submittedRef.current) {
        submittedRef.current = true
        setTimeout(() => formRef.current?.requestSubmit(), 120)
      }
    } else {
      setTimeout(() => setIndex((i) => i + 1), 120)
    }
  }

  return (
    <form ref={formRef} action={action} className="flex min-h-dvh flex-col">
      {Object.entries(answers).map(([qid, value]) => (
        <input key={qid} type="hidden" name={`q_${qid}`} value={value} />
      ))}

      <div className="sticky top-0 z-10 bg-paper px-5 pt-5 pb-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">
            {en.guest.round.questionCounter(index + 1, questions.length)}
          </span>
          <span
            className={`text-2xl font-semibold tabular-nums ${urgent ? 'text-accent' : 'text-ink'}`}
            aria-live="off"
          >
            {en.guest.round.timeLeft(left)}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className={`h-full rounded-full ${urgent ? 'bg-accent' : 'bg-ink'}`}
            style={{ width: `${pct}%`, transition: 'width 250ms linear' }}
          />
        </div>
      </div>

      {question ? (
        <div className="flex flex-1 flex-col px-5 pb-8">
          <h1 className="mt-6 text-2xl leading-snug font-semibold text-balance">
            {question.prompt}
          </h1>
          <div className="mt-6 grid gap-3">
            {question.options.map((option, i) => (
              <button
                key={i}
                type="button"
                onClick={() => choose(question.id, i)}
                className="min-h-14 rounded-xl border-2 border-line bg-warm px-4 py-3 text-left text-lg active:border-accent active:bg-accent-soft"
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="px-5 py-10 text-center text-muted">{en.common.loading}</p>
      )}
    </form>
  )
}
