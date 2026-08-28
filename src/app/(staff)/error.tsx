'use client'

import { en } from '@/strings/en'

/** Staff/floor error boundary — the mounted tablet must not sit on a blank 500. */
export default function StaffError({ reset }: { reset: () => void }) {
  return (
    <main className="surface-staff flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-xs text-center">
        <h1 className="text-2xl font-semibold">{en.common.genericError}</h1>
        <button
          onClick={reset}
          className="mt-6 min-h-14 w-full rounded-xl bg-staff-ink px-5 text-lg font-semibold text-staff-ground"
        >
          {en.common.retry}
        </button>
      </div>
    </main>
  )
}
