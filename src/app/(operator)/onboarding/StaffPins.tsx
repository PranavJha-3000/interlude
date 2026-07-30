'use client'

import { useActionState } from 'react'
import { en } from '@/strings/en'
import { generatePins, type PinState } from './pin-actions'
import { advanceStep } from './actions'

/**
 * The staff PINs, shown exactly once — at the moment they are minted.
 *
 * A client component because the PINs can only be rendered from the action's
 * *return value*: only their hash is stored, so a redirect would lose them and
 * a re-read could not recover them. `useActionState` is the one way to render
 * what a server action returned without putting a credential in a URL, in a
 * cookie, or in a plaintext column.
 *
 * This is an operator route, so the client JS costs nothing that matters — the
 * ≤15KB budget in CLAUDE.md is about the guest bundle, and nothing here is
 * imported by a guest surface.
 */

const initial: PinState = { issued: false }

export function StaffPins() {
  const [state, action, pending] = useActionState(generatePins, initial)

  if (!state.issued) {
    return (
      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className="mt-8 min-h-14 w-full rounded-xl bg-ink px-5 text-lg font-semibold text-paper disabled:opacity-60"
        >
          {pending ? en.common.loading : en.onboarding.staff.generate}
        </button>
      </form>
    )
  }

  return (
    <>
      <dl className="mt-8 rounded-2xl border border-line bg-warm p-5">
        <div className="flex items-baseline gap-4">
          <dt className="flex-1 text-lg">{en.onboarding.staff.floor}</dt>
          <dd className="font-mono text-3xl font-semibold tracking-widest">{state.floorPin}</dd>
        </div>
        <div className="mt-4 flex items-baseline gap-4">
          <dt className="flex-1 text-lg">{en.onboarding.staff.kitchen}</dt>
          <dd className="font-mono text-3xl font-semibold tracking-widest">{state.kitchenPin}</dd>
        </div>
      </dl>

      <p className="mt-4 text-sm text-muted">{en.onboarding.staff.warning}</p>

      <form action={advanceStep}>
        <input type="hidden" name="step" value="STAFF" />
        <button
          type="submit"
          className="mt-6 min-h-14 w-full rounded-xl bg-ink px-5 text-lg font-semibold text-paper"
        >
          {en.onboarding.staff.submit}
        </button>
      </form>
    </>
  )
}
