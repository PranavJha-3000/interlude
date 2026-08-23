import Link from 'next/link'
import { BRAND } from '@/brand'
import { en } from '@/strings/en'
import { formatPaise } from '@/lib/money'
import { decidePrizePool, type MenuItemInput, type PrizeRuleInput } from '@/core/prize-engine'
import { DEFAULT_RANKING_WEIGHTS } from '@/core/prize-engine/default-rules'
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
            clearing panel is not an illustration of the argument, it *is* the
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

            {/* The one accent fill on the page — the third of the ledger's
                four uses (REVAMP-BRIEF.md Part 2). Everything else here is
                ink or a border. */}
            <Link
              href="/signup"
              className="mt-9 inline-flex min-h-14 items-center rounded-xl bg-accent px-8 text-lg font-medium text-paper"
            >
              {en.landing.cta}
            </Link>
            <p className="mt-4 max-w-prose text-sm leading-relaxed text-muted">
              {en.landing.reassurance}
            </p>

            <div className="mt-12 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-line bg-warm p-5">
                <p className="leading-relaxed">{en.landing.forGuests}</p>
              </div>
              <div className="rounded-2xl border border-line bg-warm p-5">
                <p className="leading-relaxed">{en.landing.forYou}</p>
              </div>
            </div>
          </div>

          <ClearingPanel />
        </div>

        <section className="mt-24 border-t border-line pt-12">
          <h2 className="text-2xl font-semibold">{en.landing.stepsHeading}</h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {en.landing.steps.map((step) => (
              <li key={step.n}>
                <span className="font-mono text-sm tracking-wider text-muted tabular-nums">
                  {step.n}
                </span>
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
 * A demonstration menu, fed through the real engine on every render.
 *
 * The clearing panel used to be handwritten rows; now `decidePrizePool` runs
 * live and the reasons on the card are the engine's own strings. The menu is
 * demonstration data by necessity, not laziness — a real venue's pool on a
 * public page would publish that customer's menu, food costs and margin
 * fences (PLATFORM.md §7 tenancy) — and every number below is illustrative
 * input to a pure function, never product behaviour.
 */
const DEMO_MENU: MenuItemInput[] = [
  { id: 'butter-chicken', name: 'Butter chicken', category: 'mains', pricePaise: 42000, foodCostPaise: 18000, marginTier: 'MID', prepBurden: 'HIGH', requiresKitchenWork: true, isHero: true, active: true },
  { id: 'gulab-jamun', name: 'Gulab jamun', category: 'desserts', pricePaise: 17900, foodCostPaise: 3800, marginTier: 'HIGH', prepBurden: 'LOW', requiresKitchenWork: false, isHero: false, active: true },
  { id: 'masala-chai', name: 'Masala chai', category: 'beverages', pricePaise: 9000, foodCostPaise: 900, marginTier: 'HIGH', prepBurden: 'LOW', requiresKitchenWork: false, isHero: false, active: true },
  { id: 'paneer-tikka', name: 'Paneer tikka', category: 'starters', pricePaise: 26000, foodCostPaise: 12000, marginTier: 'MID', prepBurden: 'MEDIUM', requiresKitchenWork: true, isHero: false, active: true },
  { id: 'tandoori-chicken', name: 'Tandoori chicken', category: 'mains', pricePaise: 38000, foodCostPaise: 15000, marginTier: 'MID', prepBurden: 'HIGH', requiresKitchenWork: true, isHero: false, active: true },
  { id: 'rogan-josh', name: 'Rogan josh', category: 'mains', pricePaise: 45000, foodCostPaise: 21000, marginTier: 'MID', prepBurden: 'HIGH', requiresKitchenWork: true, isHero: false, active: true },
  { id: 'kulfi', name: 'Kulfi', category: 'desserts', pricePaise: 12000, foodCostPaise: 3000, marginTier: 'HIGH', prepBurden: 'LOW', requiresKitchenWork: false, isHero: false, active: true },
]

const DEMO_RULES: PrizeRuleInput[] = [
  // Deliberately deeper than the demo's 40% cap, so the panel shows the cap
  // refusing a rule the "restaurant" wrote — the fence outranking the policy.
  { id: 'demo-kulfi-free', priority: 10, label: 'kulfi on the house', mechanic: 'BEAT_THE_KITCHEN', outcome: 'WIN', menuItemId: 'kulfi', window: 'ANY', kind: 'FREE' },
  { id: 'demo-quarter-off', priority: 100, label: 'a quarter off anything', mechanic: 'BEAT_THE_KITCHEN', outcome: 'WIN', window: 'ANY', kind: 'PERCENT_OFF', percentOff: 25 },
]

function ClearingPanel() {
  const card = en.landing.decisionCard
  const nameOf = new Map(DEMO_MENU.map((m) => [m.id, m.name]))

  // The same pure call the pass, the prizes page and the claim make.
  const pool = decidePrizePool({
    menu: DEMO_MENU,
    velocity: [
      { itemId: 'gulab-jamun', unitsSold: 0, daysSinceLastSale: 4 },
      { itemId: 'masala-chai', unitsSold: 2, daysSinceLastSale: 1 },
      { itemId: 'paneer-tikka', unitsSold: 6, daysSinceLastSale: 1 },
      { itemId: 'kulfi', unitsSold: 1, daysSinceLastSale: 2 },
    ],
    kitchenLoad: 'AMBER',
    chefVetoes: ['tandoori-chicken'],
    depthCaps: { perItemPct: 40, perServicePaise: 120000 },
    mechanic: 'BEAT_THE_KITCHEN',
    outcome: 'WIN',
    prizeRules: DEMO_RULES,
    rankingWeights: DEFAULT_RANKING_WEIGHTS,
    concededSoFarPaise: 0,
    serviceClockMinute: 1120, // 6:40pm, matching the card's title
    peakStartMinute: 1140,
    peakEndMinute: 1380,
  })

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
          {pool.entries.map((e) => (
            <li key={e.itemId} className="border-t border-line py-3">
              <p className="font-medium">
                {nameOf.get(e.itemId)}
                <span className="ml-2 font-mono text-sm text-muted tabular-nums">
                  {e.kind === 'FREE'
                    ? formatPaise(0)
                    : e.kind === 'PERCENT_OFF'
                      ? `−${e.percentOff}%`
                      : formatPaise(e.fixedPricePaise ?? 0)}
                </span>
              </p>
              {/* The engine's own sentence, in the mono — the system talking. */}
              <p className="mt-0.5 font-mono text-sm leading-relaxed text-muted">{e.reason}</p>
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
          {pool.excluded.map((r) => (
            <li key={r.itemId} className="border-t border-line py-3">
              <p className="text-muted line-through">{nameOf.get(r.itemId)}</p>
              <p className="mt-0.5 font-mono text-sm leading-relaxed text-ink-warm">{r.reason}</p>
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
