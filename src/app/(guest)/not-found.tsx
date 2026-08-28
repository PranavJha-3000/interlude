import { en } from '@/strings/en'

/**
 * Guest 404 — the venue/table picker, a spent token, or a typo in a printed
 * code. Rendered inside `(guest)/layout.tsx`, so it inherits the clay ground.
 */
export default function GuestNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 py-8 text-center">
      <h1 className="text-3xl leading-tight font-semibold text-balance">{en.guest.notFound.heading}</h1>
      <p className="mt-3 text-lg leading-relaxed text-muted text-pretty">{en.guest.notFound.body}</p>
    </main>
  )
}
