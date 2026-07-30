import Link from 'next/link'
import { PASSWORD_MIN_LENGTH } from '@/lib/password'
import { en } from '@/strings/en'
import { signUp } from './actions'

export const dynamic = 'force-dynamic'

const ERRORS: Record<string, string> = {
  invalid_email: en.signup.invalidEmail,
  weak_password: en.signup.weakPassword(PASSWORD_MIN_LENGTH),
  email_taken: en.signup.emailTaken,
  rate_limited: en.signup.rateLimited,
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const message = error ? ERRORS[error] : undefined

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold">{en.signup.heading}</h1>
      <p className="mt-3 text-lg text-muted">{en.signup.body}</p>

      {message && <p className="mt-6 text-sm text-bad">{message}</p>}

      <form action={signUp} className="mt-8">
        <label htmlFor="email" className="block text-sm text-muted">
          {en.signup.emailLabel}
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
          {en.signup.passwordLabel}
        </label>
        {/*
          `minLength` is a courtesy that saves a round trip, not the rule.
          `signUpWithPassword` re-checks it, because anything can post here.
        */}
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          className="mt-2 min-h-14 w-full rounded-xl border border-line bg-paper px-4 text-lg"
        />
        <p className="mt-2 text-sm text-muted">{en.signup.weakPassword(PASSWORD_MIN_LENGTH)}</p>

        <button
          type="submit"
          className="mt-6 min-h-14 w-full rounded-xl bg-ink px-5 text-lg font-semibold text-paper"
        >
          {en.signup.submit}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        <Link href="/signin" className="underline">
          {en.signup.haveAccount}
        </Link>
      </p>
    </main>
  )
}
