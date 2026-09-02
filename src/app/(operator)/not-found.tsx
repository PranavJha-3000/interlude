import Link from 'next/link'
import { en } from '@/strings/en'

/** Operator 404 fallback, inside the signed-in nav shell. */
export default function OperatorNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold">{en.common.notFoundHeading}</h1>
      <p className="mt-3 text-lg text-muted">{en.common.notFoundBody}</p>
      <Link
        href="/dash"
        className="mt-8 inline-flex min-h-14 items-center rounded-xl bg-ink px-6 text-lg font-semibold text-paper"
      >
        {en.common.back} to dashboard
      </Link>
    </main>
  )
}
