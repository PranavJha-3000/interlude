'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  claimMiniGamePrize,
  loadMysteryBrief,
  submitMystery,
  type MysteryBriefView,
} from './mini-actions'
import { miniGames } from '@/strings/mini-games'

/**
 * Game 3 — Mystery Customer.
 *
 * A brief is drawn deterministically from venue configuration (budget,
 * craving, preference, appetite), the guest fills each course slot from real
 * menu options, and scoring is pure core arithmetic explained point by
 * point. No character simulation, no movement, no physics.
 */
export function MysteryCustomerGame({ qrToken }: { qrToken: string }) {
  const router = useRouter()
  const [brief, setBrief] = useState<MysteryBriefView | null>(null)
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [result, setResult] = useState<Awaited<ReturnType<typeof submitMystery>> | null>(null)
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()

  // Same deterministic-board rule as Secret Recipe: the profile derives from
  // the table's run identity, so a reload shows the same customer.
  useEffect(() => {
    let live = true
    startTransition(async () => {
      let loaded
      try {
        loaded = await loadMysteryBrief(qrToken)
      } catch {
        if (live) setFailed(true)
        return
      }
      if (!live) return
      if (!loaded.ok || !loaded.courses?.length) setFailed(true)
      else setBrief(loaded)
    })
    return () => {
      live = false
    }
  }, [qrToken])

  function choose(slot: string, itemId: string) {
    if (pending || result) return
    setChoice((c) => ({ ...c, [slot]: itemId }))
  }

  function change(slot: string) {
    if (pending || result) return
    setChoice((c) => {
      const next = { ...c }
      delete next[slot]
      return next
    })
  }

  function serve() {
    if (!brief || pending || result) return
    startTransition(async () => {
      let scored
      try {
        scored = await submitMystery(qrToken, ...brief.courses.map((c) => choice[c.slot]))
      } catch {
        setFailed(true)
        return
      }
      if (!scored.ok) setFailed(true)
      else setResult(scored)
    })
  }

  const [claiming, setClaiming] = useState(false)

  // Claim through the one shared door, then navigate client-side — the
  // form-action redirect variant stranded guests on a pending button when the
  // router dropped the action's response (award already written). Same
  // rationale as SecretRecipeGame's `claim`.
  async function claim() {
    if (claiming) return
    setClaiming(true)
    try {
      const ok = await claimMiniGamePrize(qrToken, 'MYSTERY_CUSTOMER')
      if (!ok) {
        setFailed(true)
        return
      }
      // Hard assignment — same soft-nav drop seen in SecretRecipeGame's claim.
      window.location.assign(`/t/${qrToken}`)
    } catch {
      setClaiming(false)
    }
  }

  if (failed) {
    return (
      <Frame>
        <p className="text-lg text-loss">{miniGames.common.error}</p>
        <a href={`/t/${qrToken}`} className="mt-4 text-base underline underline-offset-4">
          {miniGames.common.back}
        </a>
      </Frame>
    )
  }

  if (!brief) {
    return (
      <Frame>
        <p className="font-mono text-sm text-muted tabular-nums">{miniGames.common.loading}</p>
      </Frame>
    )
  }

  if (result && result.ok) {
    return (
      <Frame>
        <p className="text-xs font-medium tracking-widest text-muted uppercase">
          {miniGames.mysteryCustomer.resultEyebrow}
        </p>
        <h1 className="mt-2 text-3xl leading-tight font-semibold text-balance">
          {result.headline}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">{result.explanation}</p>

        <ul className="mt-5 grid gap-1">
          {result.meal.map((m, i) => (
            <li key={`${m.slotLabel}-${i}`} className="flex items-baseline justify-between gap-3">
              <span className="text-base">
                <span className="mr-2 text-sm text-muted">{m.slotLabel}</span>
                {m.name}
              </span>
              <span className="font-mono text-sm text-muted tabular-nums">{m.priceLabel}</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 font-mono text-lg font-medium tabular-nums">{result.scoreLine}</p>

        {/* The interesting combinations worth remembering — core derives
            these; they are explanation, not marketing. */}
        {result.highlights.length > 0 && (
          <ul className="mt-4 grid gap-1 text-sm text-muted">
            {result.highlights.map((h, i) => (
              <li key={i}>· {h}</li>
            ))}
          </ul>
        )}

        <div className="mt-auto pt-8">
          {/* Same awaited-claim-then-replace as Secret Recipe — see the comment
              on `claim` in SecretRecipeGame for why this is not a form redirect. */}
          <button
            type="button"
            onClick={claim}
            disabled={claiming}
            className="min-h-14 w-full rounded-xl bg-ink px-5 text-lg font-semibold text-paper active:opacity-80 disabled:opacity-60"
          >
            {claiming ? miniGames.common.loading : miniGames.mysteryCustomer.claimCta}
          </button>
        </div>
      </Frame>
    )
  }

  // First course slot still unfilled — that is where the guest is.
  const current = brief.courses.find((c) => !(c.slot in choice)) ?? null
  const done = current === null

  return (
    <Frame>
      <header className="flex items-baseline justify-between">
        <p className="text-xs font-medium tracking-widest text-muted uppercase">
          {miniGames.mysteryCustomer.title}
        </p>
        <button
          type="button"
          onClick={() => router.push(`/t/${qrToken}`)}
          className="text-sm text-muted underline underline-offset-4"
        >
          {miniGames.common.back}
        </button>
      </header>

      <h1 className="mt-2 text-2xl leading-tight font-semibold text-balance">
        {miniGames.mysteryCustomer.heading}
      </h1>
      <p className="mt-2 text-base leading-relaxed text-muted">{miniGames.mysteryCustomer.howTo}</p>

      {/* The brief. Server-derived, deterministic per table. */}
      <dl className="mt-5 grid gap-2 rounded-xl border-2 border-line px-4 py-3">
        {brief.rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-sm text-muted">{r.label}</dt>
            <dd className="text-right text-base font-medium">{r.value}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-sm text-muted">{miniGames.mysteryCustomer.budgetLabel}</dt>
          <dd className="text-right font-mono text-base font-medium tabular-nums">
            {brief.budgetLine}
          </dd>
        </div>
      </dl>

      <div className="mt-6 grid gap-6">
        {brief.courses.map((course) => {
          const chosenId = choice[course.slot]
          const chosen = chosenId ? course.options.find((o) => o.id === chosenId) : null
          return (
            <section key={course.slot}>
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide">{course.label}</h2>
                {chosen && !done && (
                  <button
                    type="button"
                    onClick={() => change(course.slot)}
                    className="text-sm text-muted underline underline-offset-4"
                  >
                    {miniGames.mysteryCustomer.change}
                  </button>
                )}
              </div>
              {chosen ? (
                <p className="mt-2 text-lg font-medium">{chosen.name}</p>
              ) : (
                <div role="group" aria-label={course.label} className="mt-2 grid gap-2">
                  {course.options.map((o) => {
                    const on = choice[course.slot] === o.id
                    return (
                      <button
                        key={o.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => choose(course.slot, o.id)}
                        className={`flex min-h-14 items-center justify-between rounded-xl border-2 px-4 text-left transition-colors ${
                          on ? 'border-ink bg-ink text-paper' : 'border-line active:border-ink'
                        }`}
                      >
                        <span className="text-base font-medium">{o.name}</span>
                        <span
                          className={`ml-3 shrink-0 font-mono text-sm tabular-nums ${
                            on ? '' : 'text-muted'
                          }`}
                        >
                          {o.priceLabel}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
      </div>

      <div className="mt-auto pt-8">
        <button
          type="button"
          disabled={!done || pending}
          onClick={serve}
          className="min-h-14 w-full rounded-xl bg-ink px-5 text-lg font-semibold text-paper active:bg-accent disabled:opacity-60"
        >
          {miniGames.mysteryCustomer.serveCta}
        </button>
      </div>
    </Frame>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">{children}</main>
  )
}
