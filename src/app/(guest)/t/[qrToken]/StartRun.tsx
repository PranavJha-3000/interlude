'use client'

import { useState, useTransition } from 'react'
import { en } from '@/strings/en'
import { beginRun, type PairView } from './game-actions'
import { Game } from './Game'

/**
 * The moment before the run starts.
 *
 * Separate from `Game` because starting spends one of the table's lives, and a
 * life is not something to spend on a page load. The guest taps to begin, the
 * server deducts and deals the first pair, and only then does the round exist.
 *
 * It also gives the table its standing before committing — a second guest
 * picking up a phone should see what they are inheriting rather than being
 * dropped mid-ladder with no explanation.
 */
export function StartRun({
  qrToken,
  venueName,
  tableLabel,
  endsAtMs,
  rungs,
  streak,
  currentRung,
  livesRemaining,
}: {
  qrToken: string
  venueName: string
  tableLabel: string
  endsAtMs: number | null
  rungs: number
  streak: number
  currentRung: number
  livesRemaining: number
}) {
  const [pair, setPair] = useState<PairView | null>(null)
  const [state, setState] = useState({ streak, currentRung, canTake: currentRung > 0 })
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  if (pair) {
    return (
      <Game
        qrToken={qrToken}
        firstPair={pair}
        endsAtMs={endsAtMs}
        streak={state.streak}
        currentRung={state.currentRung}
        rungs={rungs}
        canTake={state.canTake}
      />
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">
      <header className="mb-8 flex items-baseline justify-between">
        <p className="text-xs tracking-widest text-muted uppercase">{venueName}</p>
        <p className="font-mono text-xs text-muted tabular-nums">{tableLabel}</p>
      </header>

      <h1 className="text-3xl leading-tight font-semibold text-balance">{en.guest.game.heading}</h1>
      <p className="mt-3 text-lg leading-relaxed text-muted text-pretty">
        {currentRung > 0
          ? en.guest.start.inherited(currentRung, rungs)
          : en.guest.start.fresh(rungs)}
      </p>

      <p className="mt-4 font-mono text-sm text-muted">{en.guest.start.lives(livesRemaining)}</p>

      {failed && <p className="mt-4 text-base text-loss">{en.common.genericError}</p>}

      <div className="mt-auto pt-8">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await beginRun(qrToken)
              if (!result.ok || !result.nextPair) {
                setFailed(true)
                return
              }
              setState({
                streak: result.streak ?? 0,
                currentRung: result.currentRung ?? 0,
                canTake: Boolean(result.canTake),
              })
              setPair(result.nextPair)
            })
          }
          className="min-h-14 w-full rounded-xl bg-ink px-5 text-lg font-semibold text-paper active:bg-accent disabled:opacity-60"
        >
          {pending ? en.common.loading : en.guest.start.begin}
        </button>
      </div>
    </main>
  )
}
