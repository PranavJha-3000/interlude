'use client'

import Link from 'next/link'
import { en } from '@/strings/en'

/**
 * Operator error boundary — a dashed line into the launch-critical /dash page
 * should be recoverable, not a frozen 500. Rendered inside the operator nav
 * shell via `(operator)/layout.tsx`.
 */
export default function OperatorError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold">{en.common.genericError}</h1>
      <div className="mt-8 flex w-full flex-col gap-3">
        <button
          onClick={reset}
          className="min-h-14 w-full rounded-xl bg-ink px-5 text-lg font-semibold text-paper"
        >
          {en.common.retry}
        </button>
        <Link
          href="/dash"
          className="min-h-14 rounded-xl border-2 border-line px-5 text-lg font-medium leading-[3.5rem]"
        >
          {en.common.back} to dashboard
        </Link>
      </div>
    </main>
  )
}
