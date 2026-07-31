'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { en } from '@/strings/en'
import { answerPair, claimPrize, type AnswerOutcome, type PairView } from './game-actions'

/**
 * The round (§9.1).
 *
 * The only client component on the guest route, and it earns its place: two
 * dish cards, a streak, and a countdown that has to tick. Everything else on
 * this route is server-rendered.
 *
 * Each tap is a server action because the answer is the secret — see the note
 * at the top of `game-actions.ts`. The phone shows the tap as committed
 * immediately and reveals the verdict when the server answers, so the round
 * trip reads as suspense rather than as lag. That framing is not a trick: the
 * pause is genuinely the moment before finding out.
 */

interface Props {
  qrToken: string
  firstPair: PairView
  endsAtMs: number | null
  streak: number
  currentRung: number
  rungs: number
  canTake: boolean
}

type Phase = 'asking' | 'revealing' | 'over'

export function Game({
  qrToken,
  firstPair,
  endsAtMs,
  streak: initialStreak,
  currentRung: initialRung,
  rungs,
  canTake: initialCanTake,
}: Props) {
  const [pair, setPair] = useState<PairView | null>(firstPair)
  const [streak, setStreak] = useState(initialStreak)
  const [rung, setRung] = useState(initialRung)
  const [canTake, setCanTake] = useState(initialCanTake)
  const [phase, setPhase] = useState<Phase>('asking')
  const [chosen, setChosen] = useState<string | null>(null)
  const [answerId, setAnswerId] = useState<string | null>(null)
  const [ended, setEnded] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function onTap(id: string) {
    if (phase !== 'asking' || !pair) return
    setChosen(id)
    setPhase('revealing')

    const index = pair.index
    startTransition(async () => {
      const result: AnswerOutcome = await answerPair(qrToken, index, id)
      if (!result.ok) {
        setPhase('asking')
        setChosen(null)
        return
      }

      setAnswerId(result.answerId ?? null)
      setStreak(result.streak ?? 0)
      setRung(result.currentRung ?? 0)
      setCanTake(Boolean(result.canTake))

      // Hold the reveal long enough to read, then move on. A correct answer
      // that vanishes instantly is a correct answer nobody enjoyed.
      window.setTimeout(() => {
        if (result.endedReason) {
          setEnded(result.endedReason)
          setPhase('over')
          return
        }
        setPair(result.nextPair ?? null)
        setChosen(null)
        setAnswerId(null)
        setPhase('asking')
      }, 900)
    })
  }

  if (phase === 'over' || !pair) {
    return (
      <Outcome
        qrToken={qrToken}
        rung={rung}
        rungs={rungs}
        canTake={canTake}
        reason={ended}
        streak={streak}
      />
    )
  }

  return (
    <div className="flex min-h-dvh flex-col px-5 py-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">{en.guest.game.heading}</h1>
        <Countdown endsAtMs={endsAtMs} />
      </header>

      <p className="mt-1 font-mono text-sm text-muted">
        {en.guest.game.streak(streak)} · {en.guest.game.rung(rung, rungs)}
      </p>

      <p className="mt-6 text-lg">
        {pair.basis === 'SALES' ? en.guest.game.question : en.guest.game.questionChef}
      </p>

      <div className="mt-4 grid flex-1 grid-rows-2 gap-3">
        {[pair.left, pair.right].map((dish) => (
          <DishCard
            key={dish.id}
            dish={dish}
            state={
              phase === 'asking'
                ? 'idle'
                : answerId === null
                  ? chosen === dish.id
                    ? 'committed'
                    : 'dimmed'
                  : dish.id === answerId
                    ? 'right'
                    : chosen === dish.id
                      ? 'wrong'
                      : 'dimmed'
            }
            onTap={() => onTap(dish.id)}
          />
        ))}
      </div>

      {canTake && phase === 'asking' && (
        <form action={() => claimPrize(qrToken).then(() => window.location.reload())}>
          <button
            type="submit"
            className="mt-4 min-h-14 w-full rounded-xl border border-ink/25 text-base font-medium"
          >
            {en.guest.game.takeIt(rung)}
          </button>
        </form>
      )}
    </div>
  )
}

function DishCard({
  dish,
  state,
  onTap,
}: {
  dish: { id: string; name: string; photoUrl: string | null }
  state: 'idle' | 'committed' | 'dimmed' | 'right' | 'wrong'
  onTap: () => void
}) {
  const tone =
    state === 'right'
      ? 'border-ink bg-ink text-paper'
      : state === 'wrong'
        ? 'border-loss text-loss'
        : state === 'committed'
          ? 'border-ink bg-warm'
          : state === 'dimmed'
            ? 'border-line opacity-40'
            : 'border-line bg-warm active:bg-accent-soft'

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={state !== 'idle'}
      className={`relative flex min-h-32 w-full items-end overflow-hidden rounded-2xl border-2 p-4 text-left transition-colors ${tone}`}
    >
      {/* A missing photo is a typographic card of the same size and weight —
          never a broken image and never a placeholder icon (§10). */}
      {/* A plain <img>, not next/image. These are the venue's own photos at
          unknown origins, the route is the one with a measured payload budget,
          and the optimiser would add a round trip per dish on restaurant wifi.
          eslint-disable-next-line @next/next/no-img-element */}
      {dish.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dish.photoUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-90"
        />
      )}
      <span
        className={`relative text-xl leading-tight font-semibold ${
          dish.photoUrl ? 'rounded-lg bg-ground-iron/70 px-2 py-1 text-ink-iron' : ''
        }`}
      >
        {dish.name}
      </span>
    </button>
  )
}

/**
 * The countdown, against a **server-issued end timestamp** (§4.6).
 *
 * Never a duration counted down locally: a suspended tab and a phone with the
 * wrong clock both desync that, and both are ordinary in a restaurant. Under
 * `prefers-reduced-motion` it degrades to a static remaining figure rather than
 * ticking.
 */
function Countdown({ endsAtMs }: { endsAtMs: number | null }) {
  const [remaining, setRemaining] = useState<number | null>(null)
  const reduced = useRef(false)

  useEffect(() => {
    if (endsAtMs === null) return
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const tick = () => setRemaining(Math.max(0, Math.round((endsAtMs - Date.now()) / 1000)))
    tick()
    if (reduced.current) return

    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [endsAtMs])

  if (endsAtMs === null)
    return <span className="font-mono text-sm text-muted">{en.guest.game.untimed}</span>
  if (remaining === null) return null

  const mm = Math.floor(remaining / 60)
  const ss = String(remaining % 60).padStart(2, '0')
  return <span className="font-mono text-lg tabular-nums">{`${mm}:${ss}`}</span>
}

/** Won, lost, or out of questions — and what happens next. */
function Outcome({
  qrToken,
  rung,
  rungs,
  canTake,
  reason,
  streak,
}: {
  qrToken: string
  rung: number
  rungs: number
  canTake: boolean
  reason: string | null
  streak: number
}) {
  const won = canTake && rung > 0

  return (
    <div className="flex min-h-dvh flex-col justify-center px-5 py-8">
      <h1 className="text-3xl font-semibold">
        {won ? en.guest.game.wonHeading : en.guest.game.lostHeading}
      </h1>
      <p className="mt-3 text-lg text-ink-warm">
        {won ? en.guest.game.wonBody(rung, rungs) : en.guest.game.lostBody}
      </p>
      <p className="mt-2 font-mono text-sm text-muted">
        {en.guest.game.streak(streak)} · {en.guest.game.rung(rung, rungs)}
      </p>

      {won ? (
        <form action={() => claimPrize(qrToken).then(() => window.location.reload())}>
          <button
            type="submit"
            className="mt-8 min-h-14 w-full rounded-xl bg-ink px-5 text-lg font-semibold text-paper active:bg-accent"
          >
            {en.guest.game.claim}
          </button>
        </form>
      ) : (
        <p className="mt-8 text-base text-muted">{en.guest.game.enjoy}</p>
      )}

      {reason === 'ABANDONED' && (
        <p className="mt-4 text-sm text-muted">{en.guest.game.outOfPairs}</p>
      )}
    </div>
  )
}
