import Link from 'next/link'
import { BRAND } from '@/brand'
import { en } from '@/strings/en'

/**
 * The operator front door.
 *
 * Deliberately a skeleton — the palette is under review and UI-SPEC.md is not
 * settled, so this locks structure and copy and nothing else. Server component,
 * zero client JS.
 */
export default function LandingPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-20">
      <p className="text-xs tracking-widest text-muted uppercase">{en.landing.eyebrow}</p>

      <h1 className="mt-6 text-4xl leading-tight font-semibold text-balance">
        {en.landing.heading}
      </h1>

      <p className="mt-6 text-lg leading-relaxed text-muted text-pretty">{en.landing.body}</p>

      <section className="mt-12 grid gap-4">
        <div className="rounded-2xl border border-line bg-warm p-5">
          <p className="text-lg leading-relaxed">{en.landing.forGuests}</p>
        </div>
        <div className="rounded-2xl border border-line bg-warm p-5">
          <p className="text-lg leading-relaxed">{en.landing.forYou}</p>
        </div>
      </section>

      <p className="mt-10 max-w-prose text-sm leading-relaxed text-muted">{en.landing.honesty}</p>

      <Link
        href="/signin"
        className="mt-10 inline-flex min-h-14 items-center rounded-xl bg-ink px-8 text-lg font-semibold text-paper"
      >
        {en.landing.cta}
      </Link>

      <footer className="mt-20 text-xs text-muted">
        {BRAND.name} — {BRAND.tagline}
      </footer>
    </main>
  )
}
