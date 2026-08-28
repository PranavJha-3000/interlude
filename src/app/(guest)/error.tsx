'use client'

import { en } from '@/strings/en'

/**
 * Guest error boundary. The whole guest surface is server-rendered state
 * machines, so an uncaught throw strands a phone on a blank frame — give it a
 * reset rather than a 500. Inherits the clay ground from the group layout.
 */
export default function GuestError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 py-8 text-center">
      <h1 className="text-3xl leading-tight font-semibold text-balance">{en.guest.error.heading}</h1>
      <p className="mt-3 text-lg leading-relaxed text-muted text-pretty">{en.guest.error.body}</p>
      <button
        onClick={reset}
        className="mt-8 min-h-14 w-full rounded-xl bg-ink px-5 text-lg font-semibold text-paper active:bg-accent"
      >
        {en.common.retry}
      </button>
    </main>
  )
}
