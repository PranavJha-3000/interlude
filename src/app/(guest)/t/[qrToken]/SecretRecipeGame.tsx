'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  attemptRecipe,
  claimMiniGamePrize,
  loadSecretRecipe,
  type RecipeItemView,
} from './mini-actions'
import { miniGames } from '@/strings/mini-games'

/**
 * Game 2 — Secret Recipe.
 *
 * Tap a few ingredients, try the combination, get told immediately whether it
 * unlocks something real off this venue's menu. All judgement lives in
 * `core/games/secret-recipe` behind server actions; this screen renders only
 * what the server returns, so nothing the kitchen hasn't priced can be
 * unlocked by poking at the client.
 */
export function SecretRecipeGame({ qrToken }: { qrToken: string }) {
  const router = useRouter()
  const [items, setItems] = useState<RecipeItemView[] | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [missAt, setMissAt] = useState(0)
  const [attempts, setAttempts] = useState(0)
  const [solved, setSolved] = useState<{ name: string; blurb: string } | null>(null)
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()

  // The puzzle is derived deterministically from the table's run on the
  // server, so reloading mid-session keeps the same board rather than dealing
  // a fresh one out of nowhere.
  useEffect(() => {
    let live = true
    startTransition(async () => {
      let result
      try {
        result = await loadSecretRecipe(qrToken)
      } catch {
        if (live) setFailed(true)
        return
      }
      if (!live) return
      if (!result.ok || !Array.isArray(result.items)) setFailed(true)
      else setItems(result.items)
    })
    return () => {
      live = false
    }
  }, [qrToken])

  function toggle(id: string) {
    if (solved || pending) return
    setMissAt(0)
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 4 ? [...p, id] : p))
  }

  function submit() {
    if (picked.length === 0 || pending) return
    startTransition(async () => {
      let result
      try {
        result = await attemptRecipe(qrToken, picked)
      } catch {
        setFailed(true)
        return
      }
      setAttempts((n) => n + 1)
      setPicked([])
      if (result.status === 'SOLVED') setSolved({ name: result.name, blurb: result.blurb })
      else setMissAt(attempts + 1)
    })
  }

  const [claiming, setClaiming] = useState(false)

  // Claim through the one shared door, then navigate client-side. A form-action
  // redirect was tried here and stranded guests on a pending button when the
  // router dropped the action's response — the award existed, the screen never
  // moved. An awaited action plus `router.replace` has no such silent drop: if
  // navigation fails, the catch says so.
  async function claim() {
    if (claiming) return
    setClaiming(true)
    try {
      const ok = await claimMiniGamePrize(qrToken, 'SECRET_RECIPE')
      if (!ok) {
        setFailed(true)
        return
      }
      // A hard assignment, not `router.replace`: the soft navigation was
      // observed to drop on the floor here — award written, button spinning
      // forever. One full round-trip is worth a claim that always lands.
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

  if (!items) {
    return (
      <Frame>
        <p className="font-mono text-sm text-muted tabular-nums">{miniGames.common.loading}</p>
      </Frame>
    )
  }

  if (solved) {
    return (
      <Frame>
        <p className="text-xs font-medium tracking-widest text-muted uppercase">
          {miniGames.secretRecipe.solvedEyebrow}
        </p>
        <h1 className="mt-2 font-display text-3xl leading-tight text-balance">{solved.name}</h1>
        {/* Accent block: the reveal. Same single-accent discipline as the
            won screen — discovery is the product moment here. */}
        <p className="mt-4 rounded-xl bg-accent px-4 py-3 text-base leading-relaxed font-medium">
          {solved.blurb}
        </p>
        <p className="mt-3 text-sm text-muted">{miniGames.secretRecipe.solvedNote}</p>
        <div className="mt-auto pt-8">
          {/* Claim is the awaited shared action, then a client-side replace —
              see `claim` above for why this is not a form-action redirect. */}
          <button
            type="button"
            onClick={claim}
            disabled={claiming}
            className="min-h-12 w-full rounded-xl bg-ink px-4 text-base font-semibold text-paper active:opacity-80 disabled:opacity-60"
          >
            {claiming ? miniGames.common.loading : miniGames.secretRecipe.claimCta}
          </button>
          <p className="mt-3 text-center text-xs text-muted">{miniGames.secretRecipe.claimNote}</p>
        </div>
      </Frame>
    )
  }

  return (
    <Frame>
      <header className="flex items-baseline justify-between">
        <p className="text-xs font-medium tracking-widest text-muted uppercase">
          {miniGames.secretRecipe.title}
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
        {miniGames.secretRecipe.heading}
      </h1>
      <p className="mt-2 text-base leading-relaxed text-muted">{miniGames.secretRecipe.howTo}</p>

      <div
        role="group"
        aria-label={miniGames.secretRecipe.pickGroupLabel}
        className="mt-6 grid grid-cols-2 gap-2"
      >
        {items.map((it) => {
          const on = picked.includes(it.id)
          return (
            <button
              key={it.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(it.id)}
              className={`min-h-20 rounded-xl border-2 px-3 py-2 text-left text-base font-medium transition-colors ${
                on ? 'border-ink bg-ink text-paper' : 'border-line active:border-ink'
              }`}
            >
              {it.label}
            </button>
          )
        })}
      </div>

      {/* Immediate, lightweight miss feedback — same slot every time, gone on
          the next tap. Attempts stay open within the session. */}
      <div aria-live="polite" className="mt-4 min-h-12">
        {missAt > 0 && !pending && (
          <p className="rounded-xl border-2 border-line px-4 py-2 text-sm text-loss">
            {miniGames.secretRecipe.missLine(missAt)}
          </p>
        )}
      </div>

      <div className="mt-auto pt-6">
        <button
          type="button"
          disabled={picked.length === 0 || pending}
          onClick={submit}
          className="min-h-14 w-full rounded-xl bg-ink px-5 text-lg font-semibold text-paper active:bg-accent disabled:opacity-60"
        >
          {picked.length > 0
            ? miniGames.secretRecipe.tryCta(picked.length)
            : miniGames.secretRecipe.pickFirst}
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
