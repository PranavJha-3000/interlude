import Link from 'next/link'
import { en } from '@/strings/en'
import { signIn } from './actions'

export const dynamic = 'force-dynamic'

/**
 * `bad` covers a wrong password, an unknown address and a malformed one alike.
 * The link codes are still here because `/signin/verify` still redirects to
 * this page: the magic link is dormant in the UI, not switched off.
 */
const ERRORS: Record<string, string> = {
  bad: en.signin.badCredentials,
  rate_limited: en.signin.rateLimited,
  invalid_email: en.signin.invalidEmail,
  expired: en.signin.linkExpired,
  already_used: en.signin.linkUsed,
  unknown: en.signin.linkUnknown,
  missing: en.signin.linkUnknown,
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const message = error ? ERRORS[error] : undefined

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold">{en.signin.heading}</h1>
      <p className="mt-3 text-lg text-muted">{en.signin.body}</p>

      {message && <p className="mt-6 text-sm text-bad">{message}</p>}

      <form action={signIn} className="mt-8">
        <label htmlFor="email" className="block text-sm text-muted">
          {en.signin.emailLabel}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-2 min-h-14 w-full rounded-xl border border-line bg-paper px-4 text-lg"
        />

        <label htmlFor="password" className="mt-6 block text-sm text-muted">
          {en.signin.passwordLabel}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-2 min-h-14 w-full rounded-xl border border-line bg-paper px-4 text-lg"
        />

        <button
          type="submit"
          className="mt-6 min-h-14 w-full rounded-xl bg-ink px-5 text-lg font-semibold text-paper"
        >
          {en.signin.submit}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        <Link href="/signup" className="underline">
          {en.signin.noAccount}
        </Link>
      </p>
    </main>
  )
}
