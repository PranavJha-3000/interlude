'use client'

import { useActionState } from 'react'
import { en } from '@/strings/en'
import { saveRoleCodes, type RoleCodesState } from './pin-actions'

/**
 * The role codes, set during onboarding and changeable later in settings.
 *
 * A client component with `useActionState` for the same reason `StaffPins` is:
 * the saved/error answer comes back from the action, and a plain server form
 * would lose it in a redirect.
 */

const initial: RoleCodesState = { saved: false }

export function RoleCodes() {
  const [state, action, pending] = useActionState(saveRoleCodes, initial)
  const s = en.onboarding.staff

  return (
    <section className="mt-8 rounded-2xl border border-line bg-warm p-5">
      <h2 className="text-lg font-semibold">{s.codesHeading}</h2>
      <p className="mt-2 text-sm text-muted">{s.codesBody}</p>

      {state.saved && <p className="mt-4 text-sm text-good">{s.codesSaved}</p>}
      {state.saved === false && state.error === 'LENGTH' && (
        <p className="mt-4 text-sm text-bad">{s.codesInvalid}</p>
      )}

      <form action={action} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="adminCode" className="block text-sm text-muted">
            {s.codesAdminLabel}
          </label>
          <input
            id="adminCode"
            name="adminCode"
            type="text"
            autoComplete="off"
            required
            minLength={4}
            maxLength={12}
            className="mt-1 min-h-12 w-full rounded-xl border border-line bg-paper px-3 font-mono text-lg tracking-widest"
          />
        </div>
        <div>
          <label htmlFor="staffCode" className="block text-sm text-muted">
            {s.codesStaffLabel}
          </label>
          <input
            id="staffCode"
            name="staffCode"
            type="text"
            autoComplete="off"
            required
            minLength={4}
            maxLength={12}
            className="mt-1 min-h-12 w-full rounded-xl border border-line bg-paper px-3 font-mono text-lg tracking-widest"
          />
        </div>

        <p className="text-sm text-muted sm:col-span-2">{s.codesHelp}</p>

        <button
          type="submit"
          disabled={pending}
          className="min-h-12 rounded-xl border-2 border-line px-5 text-sm font-semibold disabled:opacity-60 sm:col-span-2"
        >
          {pending ? en.common.loading : s.codesSave}
        </button>
      </form>
    </section>
  )
}