'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { en } from '@/strings/en'
import { beginRun, claimPrize, type PairView } from './game-actions'
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
 * dropped mid-ladder with no explanation. An inherited rung can be taken from
 * here without playing, because claiming costs no life and a stranded rung is
 * a prize the table already earned.
 */
export function StartRun({
  qrToken,
  venueName,
  tableLabel,
  endsAtMs,
  firedAtMs,
  rungs,
  penaltyRungs,
  streak,
  currentRung,
  livesRemaining,
}: {
  qrToken: string
  venueName: string
  tableLabel: string
  endsAtMs: number | null
  firedAtMs: number | null
  rungs: number
  penaltyRungs: number
  streak: number
  currentRung: number
  livesRemaining: number
}) {
  const router = useRouter()
  const [pair, setPair] = useState<PairView | null>(null)
  const [state, setState] = useState({ streak, currentRung })
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  if (pair) {
    return (
      <Game
        qrToken={qrToken}
        firstPair={pair}
        endsAtMs={endsAtMs}
        firedAtMs={firedAtMs}
        streak={state.streak}
        currentRung={state.currentRung}
        rungs={rungs}
        penaltyRungs={penaltyRungs}
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

      <p className="mt-4 font-mono text-sm text-muted tabular-nums">
        {en.guest.start.lives(livesRemaining)}
      </p>

      {failed && <p className="mt-4 text-base text-loss">{en.common.genericError}</p>}

      <div className="mt-auto pt-8">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              let result
              try {
                result = await beginRun(qrToken)
              } catch {
                setFailed(true)
                return
              }
              if (!result.ok || !result.nextPair) {
                // The kitchen may have finished while this screen sat open —
                // the server refuses to spend a life on a round that is over,
                // and the page it re-renders says why.
                if (result?.endedReason === 'FOOD_ARRIVED') {
                  router.refresh()
                  return
                }
                setFailed(true)
                return
              }
              setState({
                streak: result.streak ?? 0,
                currentRung: result.currentRung ?? 0,
              })
              setPair(result.nextPair)
            })
          }
          className="min-h-14 w-full rounded-xl bg-ink px-5 text-lg font-semibold text-paper active:bg-accent disabled:opacity-60"
        >
          {pending ? en.common.loading : en.guest.start.begin}
        </button>

        {currentRung > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await claimPrize(qrToken)
                } catch {
                  setFailed(true)
                  return
                }
                router.refresh()
              })
            }
            className="transition-state mt-3 min-h-14 w-full rounded-xl border-2 border-line px-5 text-lg font-medium active:border-ink"
          >
            {en.guest.start.takeInstead(currentRung)}
          </button>
        )}
      </div>
    </main>
  )
}
