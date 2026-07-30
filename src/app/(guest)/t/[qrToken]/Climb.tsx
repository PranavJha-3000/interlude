'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { en } from '@/strings/en'
import {
  dealHand,
  handSeedFor,
  isHandCleared,
  type ClimbConfig,
  type ClimbItemInput,
} from '@/core/mechanics/climb'

/**
 * The climb. One of only two client components in the app.
 *
 * Two things are local and one is not. The countdown animates locally but its
 * truth is `endsAtMs`, issued by the server (PLATFORM.md §11) — clock skew, a
 * locked screen and a switched app all resolve correctly on return because we
 * recompute from the absolute timestamp rather than decrementing a counter.
 * Scoring is also local, so a cleared rung lands instantly instead of costing a
 * round trip through a restaurant's wifi; the server re-deals every hand and
 * re-scores at submit, and it is the only authority on the award.
 *
 * Hands are dealt *here*, by the same pure function the server replays with.
 * Nothing about a hand crosses the network in either direction — which keeps
 * the payload flat no matter how long the kitchen takes, and makes
 * client/server agreement structural instead of a wire format to keep in sync.
 */

interface Attempt {
  rung: number
  ids: string[]
}

export function Climb({
  menu,
  seedId,
  config,
  endsAtMs,
  serverNowMs,
  action,
}: {
  menu: ClimbItemInput[]
  seedId: string
  config: ClimbConfig
  endsAtMs: number
  serverNowMs: number
  action: (formData: FormData) => void
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const submittedRef = useRef(false)

  const [rung, setRung] = useState(1)
  const [tries, setTries] = useState(0)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [flash, setFlash] = useState<'CLEARED' | 'MISSED' | null>(null)
  const [left, setLeft] = useState(Math.max(0, Math.round((endsAtMs - serverNowMs) / 1000)))
  const [handLeft, setHandLeft] = useState(config.handSec)
  const handLeftRef = useRef(config.handSec)
  const skewRef = useRef<number | null>(null)

  const priceOf = useMemo(() => new Map(menu.map((m) => [m.id, m.pricePaise])), [menu])
  const nameOf = useMemo(() => new Map(menu.map((m) => [m.id, m.name])), [menu])
  const hand = useMemo(
    () => dealHand(menu, handSeedFor(seedId, tries), rung, config),
    [menu, seedId, tries, rung, config]
  )

  /**
   * The guest's arrangement of the current ladder.
   *
   * Held with the hand it belongs to and reconciled during render rather than
   * reset from an effect. A new hand must never open holding the previous
   * hand's order, and an effect that fixes it up afterwards paints the wrong
   * order first — briefly showing the guest an arrangement they did not make.
   */
  const handKey = `${rung}:${tries}`
  const [arrangement, setArrangement] = useState<{ key: string; ids: string[] }>({
    key: '',
    ids: [],
  })
  const order = arrangement.key === handKey ? arrangement.ids : (hand?.itemIds ?? [])

  const submit = () => {
    if (submittedRef.current) return
    submittedRef.current = true
    formRef.current?.requestSubmit()
  }

  function record(ids: string[], cleared: boolean) {
    setAttempts((a) => [...a, { rung, ids }])
    setFlash(cleared ? 'CLEARED' : 'MISSED')
    setTimeout(() => {
      setFlash(null)
      handLeftRef.current = config.handSec
      setHandLeft(config.handSec)
      if (cleared) {
        if (rung >= config.rungs) {
          // Topped out. Submitting now is the right move: there is nothing left
          // to climb and the guest should not sit watching a dead clock.
          submit()
          return
        }
        setRung((r) => r + 1)
        setTries(0)
      } else {
        setTries((t) => t + 1)
      }
    }, 700)
  }

  function miss() {
    if (!hand || flash) return
    record([], false)
  }

  function tapPair(id: string) {
    if (!hand || flash) return
    record([id], isHandCleared(hand, [id], priceOf))
  }

  function lockLadder() {
    if (!hand || flash) return
    record(order, isHandCleared(hand, order, priceOf))
  }

  function move(index: number, delta: number) {
    const to = index + delta
    if (to < 0 || to >= order.length) return
    const next = [...order]
    ;[next[index], next[to]] = [next[to]!, next[index]!]
    setArrangement({ key: handKey, ids: next })
  }

  useEffect(() => {
    // The client clock can be wrong by minutes, so measure against the server's
    // own "now" rather than trusting Date.now() outright.
    //
    // The clock is read inside the timer callback, never in render or an effect
    // body — the first paint has to be deterministic or hydration mismatches,
    // and it is the reason `left` is seeded from the two props instead. Skew is
    // therefore measured one tick after mount, which errs a quarter-second in
    // the guest's favour. Harmless: the server re-checks `endsAt` on submit and
    // is the only authority on whether they beat the kitchen.
    const tick = () => {
      if (skewRef.current === null) skewRef.current = serverNowMs - Date.now()
      const remaining = Math.max(0, Math.ceil((endsAtMs - (Date.now() + skewRef.current)) / 1000))
      setLeft(remaining)
      if (remaining === 0) submit()
    }

    const id = setInterval(tick, 250)
    return () => clearInterval(id)
    // `submit` closes over refs only, so it is stable; re-running this on every
    // state change would restart the interval four times a second.
  }, [endsAtMs, serverNowMs])

  // The per-hand clock, and it is a separate clock on purpose: running out of
  // time on a hand costs the guest that hand, never the run.
  //
  // The count is mirrored in a ref so expiry can be handled inside the timer
  // callback. Deciding it from an effect that watches the rendered value would
  // be a side effect in render's shadow; deciding it inside a state updater
  // would fire twice under StrictMode and burn two attempts for one timeout.
  useEffect(() => {
    if (flash || !hand) return
    const id = setInterval(() => {
      const next = Math.max(0, handLeftRef.current - 1)
      handLeftRef.current = next
      setHandLeft(next)
      if (next === 0) miss()
    }, 1000)
    return () => clearInterval(id)
    // `miss` is recreated every render but only ever reads `hand` and `flash`,
    // both of which are dependencies here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash, hand])

  const urgent = left <= 15
  const handPct = Math.max(0, Math.min(100, (handLeft / config.handSec) * 100))

  return (
    <form ref={formRef} action={action} className="flex min-h-dvh flex-col">
      <input type="hidden" name="attempts" value={JSON.stringify(attempts)} />

      <div className="sticky top-0 z-10 bg-paper px-5 pt-5 pb-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">
            {en.guest.climb.rungCounter(rung, config.rungs)}
          </span>
          <span
            className={`font-mono text-2xl font-semibold tabular-nums ${urgent ? 'text-accent' : 'text-ink'}`}
            aria-live="off"
          >
            {en.guest.climb.foodIn(left)}
          </span>
        </div>

        {/* The ladder. Cleared rungs stay filled, so progress is visible at a
            glance rather than being a number the guest has to read. */}
        <div className="mt-3 flex gap-1.5">
          {Array.from({ length: config.rungs }, (_, i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full ${i < rung - 1 ? 'bg-accent' : i === rung - 1 ? 'bg-ink' : 'bg-line'}`}
            />
          ))}
        </div>

        {/* Per-hand time. Deliberately quieter than the run clock — this one
            running out costs a hand, not the climb. */}
        <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-muted"
            style={{ width: `${handPct}%`, transition: 'width 1s linear' }}
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col px-5 pb-8">
        {flash ? (
          <div className="flex flex-1 flex-col items-center justify-center">
            <p
              className={`text-3xl font-semibold ${flash === 'CLEARED' ? 'text-accent' : 'text-muted'}`}
              role="status"
            >
              {flash === 'CLEARED' ? en.guest.climb.cleared : en.guest.climb.missed}
            </p>
            <p className="mt-2 text-sm text-muted">
              {flash === 'CLEARED' ? en.guest.climb.clearedNote : en.guest.climb.missedNote}
            </p>
          </div>
        ) : !hand ? (
          <p className="py-10 text-center text-muted">{en.common.loading}</p>
        ) : hand.kind === 'PAIR' ? (
          <>
            <h1 className="mt-6 text-2xl leading-snug font-semibold text-balance">
              {en.guest.climb.pairPrompt}
            </h1>
            <div className="mt-6 grid gap-3">
              {hand.itemIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => tapPair(id)}
                  className="min-h-16 rounded-xl border-2 border-line bg-warm px-4 py-3 text-left text-lg active:border-accent active:bg-accent-soft"
                >
                  {nameOf.get(id)}
                </button>
              ))}
            </div>
            <p className="mt-6 text-sm text-muted">{en.guest.climb.menuHint}</p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-2xl leading-snug font-semibold text-balance">
              {en.guest.climb.ladderPrompt}
            </h1>
            <ol className="mt-6 grid gap-2">
              {order.map((id, i) => (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-xl border-2 border-line bg-warm py-2 pr-2 pl-3"
                >
                  <span className="font-mono text-sm text-muted">{i + 1}</span>
                  <span className="flex-1 text-lg">{nameOf.get(id)}</span>
                  {/* Arrows, not drag. A drag target is unusable one-handed on a
                      phone held at a dinner table, and undoable by accident. */}
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={en.guest.climb.moveUp(nameOf.get(id) ?? '')}
                    className="min-h-11 min-w-11 rounded-lg border border-line text-lg disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === order.length - 1}
                    aria-label={en.guest.climb.moveDown(nameOf.get(id) ?? '')}
                    className="min-h-11 min-w-11 rounded-lg border border-line text-lg disabled:opacity-30"
                  >
                    ↓
                  </button>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-muted">{en.guest.climb.menuHint}</p>
            <div className="flex-1" />
            <button
              type="button"
              onClick={lockLadder}
              className="mt-6 min-h-14 w-full rounded-xl bg-accent px-6 text-lg font-medium text-paper"
            >
              {en.guest.climb.lockIn}
            </button>
          </>
        )}
      </div>
    </form>
  )
}
