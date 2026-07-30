import { en } from '@/strings/en'
import { requestLink } from './actions'

export const dynamic = 'force-dynamic'

const ERRORS: Record<string, string> = {
  expired: en.signin.linkExpired,
  already_used: en.signin.linkUsed,
  unknown: en.signin.linkUnknown,
  missing: en.signin.linkUnknown,
  invalid_email: en.signin.invalidEmail,
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>
}) {
  const { sent, error } = await searchParams
  const message = error ? ERRORS[error] : undefined

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold">{en.signin.heading}</h1>

      {sent ? (
        <div className="mt-8 rounded-2xl border border-line bg-warm p-5">
          <p className="text-lg leading-relaxed">{en.signin.sent}</p>
          <p className="mt-3 text-sm text-muted">{en.signin.sentAgain}</p>
        </div>
      ) : (
        <>
          <p className="mt-3 text-lg text-muted">{en.signin.body}</p>

          {message && <p className="mt-6 text-sm text-bad">{message}</p>}

          <form action={requestLink} className="mt-8">
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
            <button
              type="submit"
              className="mt-4 min-h-14 w-full rounded-xl bg-ink px-5 text-lg font-semibold text-paper"
            >
              {en.signin.submit}
            </button>
          </form>
        </>
      )}
    </main>
  )
}
