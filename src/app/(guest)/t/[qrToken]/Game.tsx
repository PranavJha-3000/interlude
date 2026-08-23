'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { en } from '@/strings/en'
import { formatPaise } from '@/lib/money'
import {
  answerPair,
  claimPrize,
  type AnswerOutcome,
  type PairView,
  type RungPrizeView,
} from './game-actions'

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
 * trip reads as suspense rather than as lag.
 *
 * The rung gate is the product's one staged moment (REVAMP-BRIEF.md Part 5):
 * reaching a rung stops play, freezes the countdown's display for the beat,
 * names the prize the engine would give right now, and puts the choice — take
 * it, or push with the downside stated. Everything else is a discrete state.
 */

interface Props {
  qrToken: string
  firstPair: PairView
  endsAtMs: number | null
  firedAtMs: number | null
  streak: number
  currentRung: number
  rungs: number
  /** What a wrong answer costs, for the push button's downside line. */
  penaltyRungs: number
}

type Phase = 'asking' | 'revealing' | 'rung' | 'over'

/** The verdict-hold token from globals.css, read once. Reading time, not animation. */
function revealHoldMs(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--duration-reveal-hold')
  const n = parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? n : 900
}

/** Two haptics exist in the whole product; both live here. None on a wrong answer. */
function buzz(ms: number) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    // Not supported (iOS Safari). The craft never depends on it.
  }
}

export function Game({
  qrToken,
  firstPair,
  endsAtMs,
  firedAtMs,
  streak: initialStreak,
  currentRung: initialRung,
  rungs,
  penaltyRungs,
}: Props) {
  const router = useRouter()
  const [pair, setPair] = useState<PairView | null>(firstPair)
  const [nextPair, setNextPair] = useState<PairView | null>(null)
  const [streak, setStreak] = useState(initialStreak)
  const [rung, setRung] = useState(initialRung)
  const [canTake, setCanTake] = useState(initialRung > 0)
  const [phase, setPhase] = useState<Phase>('asking')
  const [chosen, setChosen] = useState<string | null>(null)
  const [answerId, setAnswerId] = useState<string | null>(null)
  const [ended, setEnded] = useState<string | null>(null)
  const [rungPrize, setRungPrize] = useState<RungPrizeView | null>(null)
  const [droppedRungs, setDroppedRungs] = useState(0)
  const [offline, setOffline] = useState(false)
  const [, startTransition] = useTransition()

  function onTap(id: string) {
    if (phase !== 'asking' || !pair) return
    setChosen(id)
    setPhase('revealing')
    setOffline(false)
    buzz(10)

    const index = pair.index
    startTransition(async () => {
      let result: AnswerOutcome
      try {
        result = await answerPair(qrToken, index, id)
      } catch {
        // Venue wifi. The tap is undone, the round waits, nothing is lost —
        // the server never saw it.
        setOffline(true)
        setPhase('asking')
        setChosen(null)
        return
      }
      if (!result.ok) {
        setPhase('asking')
        setChosen(null)
        return
      }

      // The server ended the run on its own clock — the food is due. No
      // verdict to reveal: the answer was not judged.
      if (result.endedReason === 'FOOD_ARRIVED') {
        setStreak(result.streak ?? 0)
        setRung(result.currentRung ?? 0)
        setCanTake(Boolean(result.canTake))
        setEnded('FOOD_ARRIVED')
        setPhase('over')
        return
      }

      const prevRung = rung
      setAnswerId(result.answerId ?? null)
      setStreak(result.streak ?? 0)
      setRung(result.currentRung ?? 0)
      setCanTake(Boolean(result.canTake))

      // Hold the reveal long enough to read, then move on. A correct answer
      // that vanishes instantly is a correct answer nobody enjoyed.
      window.setTimeout(() => {
        const reachedRung =
          result.correct && (result.currentRung ?? 0) > prevRung && (result.currentRung ?? 0) > 0

        if (reachedRung) {
          // The one staged moment. The countdown display freezes for the
          // gate; truth stays server-side and resumes untouched.
          buzz(25)
          setRungPrize(result.rungPrize ?? null)
          setNextPair(result.nextPair ?? null)
          setEnded(result.endedReason ?? null)
          setPhase('rung')
          setChosen(null)
          setAnswerId(null)
          return
        }

        if (result.endedReason) {
          setDroppedRungs(result.correct ? 0 : Math.max(0, prevRung - (result.currentRung ?? 0)))
          setEnded(result.endedReason)
          setPhase('over')
          return
        }

        setPair(result.nextPair ?? null)
        setChosen(null)
        setAnswerId(null)
        setPhase('asking')
      }, revealHoldMs())
    })
  }

  function takeIt() {
    startTransition(async () => {
      try {
        await claimPrize(qrToken)
      } catch {
        setOffline(true)
        return
      }
      // The server owns the won screen — re-render lands on it.
      router.refresh()
    })
  }

  function pushOn() {
    if (ended) {
      // Topping the ladder ends the run with nothing left to push for; the
      // gate offered only Take. Guarded here in case of a stray tap.
      return
    }
    setPair(nextPair)
    setNextPair(null)
    setRungPrize(null)
    setPhase(nextPair ? 'asking' : 'over')
    if (!nextPair) setEnded('ABANDONED')
  }

  if (phase === 'rung') {
    return (
      <RungGate
        rung={rung}
        rungs={rungs}
        prize={rungPrize}
        penaltyRungs={penaltyRungs}
        topped={ended === 'PRIZE_TAKEN' || !nextPair}
        offline={offline}
        onTake={takeIt}
        onPush={pushOn}
      />
    )
  }

  if (phase === 'over' || !pair) {
    return (
      <Outcome
        rung={rung}
        rungs={rungs}
        canTake={canTake}
        reason={ended}
        droppedRungs={droppedRungs}
        offline={offline}
        onClaim={takeIt}
      />
    )
  }

  return (
    <div className="flex min-h-dvh flex-col px-5 py-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">{en.guest.game.heading}</h1>
        <Countdown endsAtMs={endsAtMs} />
      </header>

      <p className="mt-1 font-mono text-sm text-muted tabular-nums">
        {en.guest.game.streak(streak)} · {en.guest.game.rung(rung, rungs)}
      </p>
      {firedAtMs !== null && (
        <p className="mt-1 font-mono text-xs text-muted tabular-nums">
          {en.guest.game.fired(clockTime(firedAtMs))}
        </p>
      )}

      <p className="mt-6 text-lg">
        {pair.basis === 'SALES' ? en.guest.game.question : en.guest.game.questionChef}
      </p>

      {offline && <p className="mt-2 text-sm text-loss">{en.common.offline}</p>}

      {/* The two largest tap targets in the product, separated by real dead
          space — a mis-tap must not be a lost dessert (Part 5). */}
      <div className="mt-4 grid flex-1 grid-rows-2 gap-6">
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
    </div>
  )
}

/** "8:12 pm" — the guest's own wall clock for the fired line. */
function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
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
          ? 'border-ink bg-ground-cotton'
          : state === 'dimmed'
            ? 'border-line opacity-40'
            : 'border-line bg-ground-cotton active:bg-accent-soft'

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={state !== 'idle'}
      className={`relative flex min-h-32 w-full items-end overflow-hidden rounded-2xl border-2 p-4 text-left transition-state ${tone}`}
    >
      {/* A missing photo is a typographic card of the same size and weight —
          never a broken image and never a placeholder icon (§10). */}
      {/* A plain <img>, not next/image. These are the venue's own photos at
          unknown origins, the route is the one with a measured payload budget,
          and the optimiser would add a round trip per dish on restaurant wifi. */}
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
 * `prefers-reduced-motion` it becomes a static remaining figure that refreshes
 * only when the guest looks back at the tab — accurate without ticking.
 *
 * Hitting zero hands control back to the server: a refresh renders the
 * arrived screen, and the server actions refuse a late answer independently.
 */
function Countdown({ endsAtMs }: { endsAtMs: number | null }) {
  const router = useRouter()
  const [remaining, setRemaining] = useState<number | null>(null)
  const reduced = useRef(false)
  const expired = useRef(false)

  useEffect(() => {
    if (endsAtMs === null) return
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const tick = () => {
      const left = Math.max(0, Math.round((endsAtMs - Date.now()) / 1000))
      setRemaining(left)
      if (left <= 0 && !expired.current) {
        expired.current = true
        router.refresh()
      }
    }
    tick()

    if (reduced.current) {
      document.addEventListener('visibilitychange', tick)
      return () => document.removeEventListener('visibilitychange', tick)
    }

    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [endsAtMs, router])

  if (endsAtMs === null)
    return <span className="font-mono text-sm text-muted">{en.guest.game.untimed}</span>
  if (remaining === null) return null

  const mm = Math.floor(remaining / 60)
  const ss = String(remaining % 60).padStart(2, '0')
  return <span className="font-mono text-xl tabular-nums">{`${mm}:${ss}`}</span>
}

/**
 * The rung gate — the one orchestrated moment (Part 5). One beat, no bounce,
 * no celebration: the prize is named, the choice is put, the downside is
 * stated without softening.
 */
function RungGate({
  rung,
  rungs,
  prize,
  penaltyRungs,
  topped,
  offline,
  onTake,
  onPush,
}: {
  rung: number
  rungs: number
  prize: RungPrizeView | null
  penaltyRungs: number
  topped: boolean
  offline: boolean
  onTake: () => void
  onPush: () => void
}) {
  return (
    <div className="flex min-h-dvh flex-col px-5 py-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-3xl leading-tight font-semibold">{en.guest.rung.heading(rung)}</h1>
        <p className="font-mono text-sm text-muted tabular-nums">{`${rung}/${rungs}`}</p>
      </header>

      <div className="mt-10">
        {prize ? (
          <>
            <p className="text-2xl leading-tight font-semibold">{prize.itemName}</p>
            {/* Accent use one of four: the won price beside the struck menu
                price (Part 2). Mono is for figures — "On the house" is words
                and keeps the body face. */}
            <p className="mt-2 flex items-baseline gap-3">
              {prize.paysPaise === 0 ? (
                <span className="text-3xl font-semibold text-accent">{en.guest.won.free}</span>
              ) : (
                <span className="font-mono text-3xl font-medium text-accent tabular-nums">
                  {formatPaise(prize.paysPaise)}
                </span>
              )}
              <span className="font-mono text-lg text-muted tabular-nums line-through">
                {formatPaise(prize.pricePaise)}
              </span>
            </p>
            <p className="mt-1 text-sm text-muted">{en.guest.won.tonightOnly}</p>
          </>
        ) : (
          <p className="text-2xl leading-tight font-semibold">{en.guest.rung.banked(rung)}</p>
        )}
      </div>

      {offline && <p className="mt-4 text-sm text-loss">{en.common.offline}</p>}

      <div className="mt-auto pt-8">
        <button
          type="button"
          onClick={onTake}
          className="min-h-14 w-full rounded-xl bg-ink px-5 text-lg font-semibold text-paper active:bg-accent"
        >
          {en.guest.rung.take}
        </button>
        {!topped && (
          <>
            <button
              type="button"
              onClick={onPush}
              className="transition-state mt-3 min-h-14 w-full rounded-xl border-2 border-line px-5 text-lg font-medium active:border-ink"
            >
              {en.guest.rung.push(Math.min(rung + 1, rungs))}
            </button>
            <p className="mt-2 text-center text-sm text-muted">
              {en.guest.rung.pushDownside(penaltyRungs)}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/** The run is over — the kitchen won, the questions ran out, or the food is due. */
function Outcome({
  rung,
  rungs,
  canTake,
  reason,
  droppedRungs,
  offline,
  onClaim,
}: {
  rung: number
  rungs: number
  canTake: boolean
  reason: string | null
  droppedRungs: number
  offline: boolean
  onClaim: () => void
}) {
  const arrived = reason === 'FOOD_ARRIVED'

  return (
    <div className="flex min-h-dvh flex-col justify-center px-5 py-8">
      <h1 className="text-3xl leading-tight font-semibold text-balance">
        {arrived ? en.guest.arrived.heading : en.guest.game.lostHeading}
      </h1>
      <p className="mt-3 text-lg leading-relaxed text-muted">
        {arrived
          ? canTake
            ? en.guest.arrived.bodyHeld
            : en.guest.arrived.body
          : en.guest.game.lostBody}
      </p>

      {!arrived && droppedRungs > 0 && (
        <p className="mt-2 text-base text-muted">{en.guest.game.lostCost(droppedRungs)}</p>
      )}
      {reason === 'ABANDONED' && (
        <p className="mt-2 text-sm text-muted">{en.guest.game.outOfPairs}</p>
      )}
      {!arrived && !canTake && (
        <p className="mt-8 text-base text-muted">{en.guest.game.enjoy}</p>
      )}

      {offline && <p className="mt-4 text-sm text-loss">{en.common.offline}</p>}

      {canTake && (
        <div className="mt-8">
          <button
            type="button"
            onClick={onClaim}
            className="min-h-14 w-full rounded-xl bg-ink px-5 text-lg font-semibold text-paper active:bg-accent"
          >
            {en.guest.game.claim}
          </button>
          <p className="mt-2 text-center font-mono text-sm text-muted tabular-nums">
            {en.guest.game.rung(rung, rungs)}
          </p>
        </div>
      )}
    </div>
  )
}
