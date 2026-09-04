import { redirect } from 'next/navigation'
import { en } from '@/strings/en'
import { readPendingRoleSession } from '@/lib/operator-session'
import { selectRole } from './action'

export const dynamic = 'force-dynamic'

/**
 * The second step of the two-step login: the role code.
 *
 * Reachable only while a pending session exists — which is proof, in cookie
 * form, that the email and password were just verified. Without one this page
 * is `/signin`, because a code without a verified password is a door with no
 * wall around it.
 */
const ERRORS: Record<string, string> = {
  wrong: en.signin.code.wrongCode,
}

export default async function RoleCodePage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>
}) {
  const pending = await readPendingRoleSession()
  if (!pending) redirect('/signin')
  if (!pending.venueId) redirect('/onboarding')

  const { e } = await searchParams
  const message = e ? ERRORS[e] : undefined

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold">{en.signin.code.heading}</h1>
      <p className="mt-3 text-lg text-muted">{en.signin.code.body}</p>

      {message && <p className="mt-6 text-sm text-bad">{message}</p>}

      <form action={selectRole} className="mt-8">
        <label htmlFor="code" className="block text-sm text-muted">
          {en.signin.code.label}
        </label>
        <input
          id="code"
          name="code"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          required
          className="mt-2 min-h-14 w-full rounded-xl border border-line bg-paper px-4 text-2xl tracking-widest"
        />

        <button
          type="submit"
          className="mt-6 min-h-14 w-full rounded-xl bg-ink px-5 text-lg font-semibold text-paper active:scale-[0.99]"
        >
          {en.signin.code.submit}
        </button>
      </form>
    </main>
  )
}