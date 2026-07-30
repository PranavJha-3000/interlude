import Link from 'next/link'
import { BRAND } from '@/brand'
import { en } from '@/strings/en'
import { operatorFontVars } from './fonts'

/**
 * The operator front door.
 *
 * `/` is an operator surface (UI-SPEC.md §3) but it lives at the root rather
 * than inside `(operator)`, because that group's layout renders the signed-in
 * nav shell and this page is read by someone who has never signed in. So it
 * applies the operator type identity itself, from the shared `fonts` module.
 * Nothing under `(guest)` may do the same.
 *
 * Server component, zero client JS — the whole page is one document.
 */
export default function LandingPage() {
  return (
    <div className={`${operatorFontVars} surface-operator min-h-dvh`}>
      <main className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-24">
        <p className="text-xs tracking-[0.18em] text-muted uppercase">{en.landing.eyebrow}</p>

        {/* The hero is a two-column grid on desktop and stacks on mobile. The
            decision card is not an illustration of the argument, it *is* the
            argument, so it gets equal width rather than sitting below the
            fold. */}
        <div className="mt-8 grid gap-12 lg:grid-cols-2 lg:items-start lg:gap-16">
          <div>
            <h1 className="font-display text-[2.75rem] leading-[1.08] text-balance sm:text-6xl">
              {en.landing.heading}
            </h1>

            <p className="mt-7 max-w-prose text-lg leading-relaxed text-ink-warm text-pretty">
              {en.landing.body}
            </p>

            {/* The one accent fill on the page. UI-SPEC.md §5 reserves the
                accent for a single primary action per surface; every other
                control here is ink or a border. */}
            <Link
              href="/signin"
              className="mt-9 inline-flex min-h-14 items-center rounded-xl bg-accent px-8 text-lg font-medium text-paper"
            >
              {en.landing.cta}
            </Link>

            <div className="mt-12 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-line bg-warm p-5">
                <p className="leading-relaxed">{en.landing.forGuests}</p>
              </div>
              <div className="rounded-2xl border border-line bg-warm p-5">
                <p className="leading-relaxed">{en.landing.forYou}</p>
              </div>
            </div>
          </div>

          <DecisionCard />
        </div>

        <section className="mt-24 border-t border-line pt-12">
          <h2 className="font-display text-3xl">{en.landing.stepsHeading}</h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {en.landing.steps.map((step) => (
              <li key={step.n}>
                <span className="font-mono text-sm tracking-wider text-accent">{step.n}</span>
                <h3 className="mt-2 text-lg font-medium">{step.title}</h3>
                <p className="mt-2 leading-relaxed text-muted text-pretty">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <p className="mt-20 max-w-prose text-sm leading-relaxed text-muted">{en.landing.honesty}</p>

        <footer className="mt-16 border-t border-line pt-6 text-xs text-muted">
          {BRAND.name} — {BRAND.tagline}
        </footer>
      </main>
    </div>
  )
}

/**
 * A rendered fragment of the prize engine's audit trail — the same
 * `{ item, reason }` shape `decidePrizePool` emits and `/pass` already
 * displays, and the same shape that gets snapshotted to `PrizePool` per
 * service.
 *
 * The refused column is deliberately louder than the cleared one: item names
 * are struck through and dropped to `muted`, while the reasons stay in full
 * ink. What sells this to an owner is not that it gives things away, it is
 * that it can tell them exactly what it refused to give away and why.
 *
 * The rows are hardcoded copy from `en.ts`, not live data. Rendering a real
 * venue's pool here would publish a customer's menu, food costs and margin
 * fences on a public page.
 */
function DecisionCard() {
  const card = en.landing.decisionCard

  return (
    <figure className="rounded-2xl border border-line bg-warm p-6 sm:p-7">
      <figcaption className="flex items-baseline justify-between gap-4">
        <span className="font-mono text-sm text-ink-warm">{card.title}</span>
        <span className="rounded-full border border-line px-2.5 py-0.5 text-[0.6875rem] tracking-widest text-muted uppercase">
          {card.stamp}
        </span>
      </figcaption>

      <section className="mt-7">
        <h2 className="text-xs tracking-[0.16em] uppercase">
          {card.clearedHeading}
          <span className="ml-2 tracking-normal text-muted normal-case">{card.clearedNote}</span>
        </h2>
        <ul className="mt-3">
          {card.cleared.map((row) => (
            <li key={row.item} className="border-t border-line py-3">
              <p className="font-medium">{row.item}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted">{row.why}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-7">
        <h2 className="text-xs tracking-[0.16em] uppercase">
          {card.refusedHeading}
          <span className="ml-2 tracking-normal text-muted normal-case">{card.refusedNote}</span>
        </h2>
        <ul className="mt-3">
          {card.refused.map((row) => (
            <li key={row.item} className="border-t border-line py-3">
              <p className="text-muted line-through">{row.item}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-ink-warm">{row.why}</p>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-7 border-t border-line pt-5 text-sm leading-relaxed text-muted">
        {card.footnote}
      </p>
    </figure>
  )
}
