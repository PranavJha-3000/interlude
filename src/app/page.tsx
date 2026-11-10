import type { Metadata } from 'next'
import Link from 'next/link'
import { Fraunces, Plus_Jakarta_Sans } from 'next/font/google'
import { BRAND } from '@/brand'
import { LandingEnhancements } from './landing-enhancements'
import { IndiaMap } from './IndiaMap'
import './landing.css'
import './landing-sections.css'

/**
 * The public front door — the `/` route Vercel and `npm run dev` serve.
 *
 * Warm cream ground, terracotta accent, soft rounded cards. Headlines are a
 * heavy Plus Jakarta Sans grotesk; Fraunces italic appears exactly once, on
 * the hero's accent word, as the single serif touch. The hero is a centred
 * headline over a field of abstract floating placeholders and a warm wash; below it a numbered
 * "how it works" strip, a "for restaurants" stat panel, two testimonials, a
 * dark CTA, and a minimal footer.
 *
 * Everything is scoped under `.lp` (see landing.css) so this page's reset and
 * palette never touch the operator/guest/staff surfaces that share the
 * document. The wordmark and every in-copy product name come from `BRAND` —
 * the name is a placeholder that lives in one file, so a rename stays one edit.
 */

// The two faces this page needs, loaded as CSS variables landing.css references
// via --font-display / --font-body. Fraunces carries its optical-size axis so
// the one italic accent word tightens the way the design intends. Neither is
// the operator `next/font` set — the landing owns its own type identity.
const fraunces = Fraunces({
  subsets: ['latin'],
  axes: ['opsz'],
  display: 'swap',
  variable: '--font-fraunces',
})
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-jakarta',
})

// This is the one public, indexable page. The root layout defaults every route
// to noindex (the operator/guest app is private); the marketing front door
// overrides that back to indexable.
export const metadata: Metadata = {
  title: `${BRAND.name}: Merchandising wait times`,
  description: `${BRAND.name} turns the minutes between ordering and eating into menu discovery: a quick, playful moment at the table that gets guests to order more and leave happier. No app, no login. Onboarding pilot restaurants now.`,
  robots: { index: true, follow: true },
}

export default function LandingPage() {
  return (
    <div id="top" className={`lp ${fraunces.variable} ${jakarta.variable}`}>
      {/* The `.ph` and `.reveal` entrance effects are gated on JS by
          `@media (scripting: enabled)` in landing.css — not by an inline
          <script> in this tree. React never executes a `<script>` element it
          re-creates on the client (client-side navigations), so a script-added
          class cannot survive an SPA visit; the CSS media query applies before
          first paint and degrades to visible content without JS. */}

      <a className="skip-link" href="#how">
        Skip to content
      </a>

      {/* ───────────────────────────  NAV  ─────────────────────────── */}
      <header className="nav" id="nav" data-nav>
        <div className="nav__inner container">
          <a className="nav__brand" href="#top" aria-label={`${BRAND.name} — home`}>
            {BRAND.name}
            {BRAND.beta && <span className="nav__beta">{BRAND.beta}</span>}
          </a>

          <div className="nav__actions">
            <Link className="nav__refer" href="/refer">
              Refer a Restaurant
            </Link>
            <Link className="btn btn--dark btn--sm" href="/signin">
              Log In
            </Link>
            <Link className="btn btn--primary btn--sm" href="/signup">
              Get Started
            </Link>
            <button
              className="nav__toggle"
              type="button"
              aria-label="Open menu"
              aria-expanded="false"
              aria-controls="nav-mobile"
              data-nav-toggle
            >
              <span></span>
              <span></span>
              <span></span>
            </button>
          </div>
        </div>

        <div className="nav__mobile" id="nav-mobile" data-nav-mobile hidden>
          <a href="#how">How it works</a>
          <a href="#forres">For restaurants</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <Link href="/refer">Refer a Restaurant</Link>
          <Link className="btn btn--dark" href="/signin">
            Log In
          </Link>
          <Link className="btn btn--primary" href="/signup">
            Get Started
          </Link>
        </div>
      </header>

      <main>
        {/* ───────────────────────────  HERO  ─────────────────────────── */}
        <section className="hero">
          {/* Product moment field — miniature, brand-true glimpses of what the
              product does (the Beat the Kitchen round, a reward ticket, a
              chef's pick, order and discovery pings) holding the reference's
              asymmetric scatter. aria-hidden, pointer-events:none, masked
              away from the headline, and hidden entirely below 60rem. */}
          <div className="hero__float" aria-hidden="true">
            <div className="ph ph--a">
              <div className="ph__card ph__card--media">
                <span className="ph__eyebrow">Play while you wait</span>
                <p className="ph__q">Which sells more here?</p>
                <span className="ph__chips">
                  <span className="ph__chip ph__chip--pick">Butter chicken</span>
                  <span className="ph__chip">Paneer tikka</span>
                </span>
                <span className="ph__timer">0:23</span>
              </div>
            </div>

            <div className="ph ph--b">
              <div className="ph__card">
                <span className="ph__glyph">🍰</span>
                <span className="ph__text">
                  <span className="ph__label">Added to order</span>
                  <span className="ph__sub">Tiramisu · ₹280</span>
                </span>
              </div>
            </div>

            <div className="ph ph--c">
              <div className="ph__card">
                <span className="ph__glyph">✨</span>
                <span className="ph__text">
                  <span className="ph__label">Discovered tonight</span>
                  <span className="ph__sub">+3 dishes</span>
                </span>
              </div>
            </div>

            <div className="ph ph--d">
              <div className="ph__card ph__card--media">
                <span className="ph__eyebrow">Reward unlocked</span>
                <span className="ph__code">FRIES-7Q</span>
                <span className="ph__caption">Show your server</span>
              </div>
            </div>

            <div className="ph ph--e">
              <div className="ph__card ph__card--media">
                <span className="ph__eyebrow">Chef&apos;s pick</span>
                <span className="ph__art">🍨</span>
                <span className="ph__dish">Tiramisu · ₹280</span>
                <span className="ph__add">+ Add to order</span>
              </div>
            </div>

            <div className="ph ph--f">
              <div className="ph__card">
                <span className="ph__glyph">🔍</span>
                <span className="ph__text">
                  <span className="ph__label">Secret Recipe</span>
                  <span className="ph__sub">Round won</span>
                </span>
              </div>
            </div>

            <div className="ph ph--g">
              <div className="ph__card">
                <span className="ph__glyph">🎮</span>
                <span className="ph__text">
                  <span className="ph__label">Beat the Kitchen</span>
                  <span className="ph__sub">0:23 on the clock</span>
                </span>
              </div>
            </div>

            <div className="ph ph--h">
              <div className="ph__card ph__card--stack">
                <span className="ph__row">
                  <span className="ph__glyph">🔥</span>
                  <span className="ph__text">
                    <span className="ph__label">Beat the Kitchen</span>
                    <span className="ph__sub">Table 12 on a streak</span>
                  </span>
                </span>
                <span className="ph__row">
                  <span className="ph__glyph">🎁</span>
                  <span className="ph__text">
                    <span className="ph__label">Reward claimed</span>
                    <span className="ph__sub">Free fries</span>
                  </span>
                </span>
              </div>
            </div>

            <div className="ph ph--i">
              <div className="ph__card">
                <span className="ph__glyph">📱</span>
                <span className="ph__text">
                  <span className="ph__label">Scan · Play · Claim</span>
                  <span className="ph__sub">{BRAND.tagline}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="hero__stage container">
            {/* The thesis — pin, two-tone headline, one line, pilot badge. */}
            <div className="hero__center">
              <span className="hero__pin reveal" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C7.9 2 4.5 5.4 4.5 9.5c0 5.3 6.3 11.4 7 12.1.3.3.7.3 1 0 .7-.7 7-6.8 7-12.1C19.5 5.4 16.1 2 12 2Zm0 10.2a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4Z" />
                </svg>
                <span className="hero__rings">
                  <i />
                  <i />
                </span>
              </span>
              <h1 className="hero__title reveal" data-reveal-delay="1">
                <em>Merchandising</em> wait times
                <span className="dot" aria-hidden="true">
                  .
                </span>
              </h1>
              <p className="hero__sub reveal" data-reveal-delay="2">
                {/* One string child, not expression-adjacent text: the SWC build
                    drops a space following an expression container, which fused
                    the brand into the first word ("Interludeturns"). */}
                {`${BRAND.name} turns the time between order and arrival into a playful, menu-driven experience. So guests discover more, order more, and leave happier.`}
              </p>
              <div className="hero__cta reveal" data-reveal-delay="2">
                <Link className="btn btn--primary btn--lg" href="/signup">
                  Get Started
                </Link>
                <a className="btn btn--ghost btn--lg" href="#how">
                  See how it works
                </a>
              </div>
              <p className="hero__note reveal" data-reveal-delay="3">
                Now taking pilot restaurants
              </p>
            </div>
          </div>
        </section>

        <section className="section live" aria-labelledby="live-h">
          <div className="container">
            <div className="live__panel live__panel--map reveal">
              <div className="live__main">
                <div className="live__copy">
                  <p className="eyebrow eyebrow--accent">Pilot weekend</p>
                  <h2 className="section-title" id="live-h">
                    Starting with a handful of restaurants
                    <span className="dot" aria-hidden="true">
                      .
                    </span>
                  </h2>
                  <p className="live__lead">
                    4&ndash;6 venues, one weekend, counted honestly. Every number is a count or a
                    rate from your own tables, and nothing is called a win until it has earned it.
                  </p>
                </div>
                <ul className="live__cards">
                  <li className="live__card">
                    <span className="live__glyph" aria-hidden="true">
                      📱
                    </span>
                    <strong>Scans</strong>
                    <span>Guests who open the table page</span>
                  </li>
                  <li className="live__card">
                    <span className="live__glyph" aria-hidden="true">
                      🎮
                    </span>
                    <strong>Completions</strong>
                    <span>Rounds played to the end</span>
                  </li>
                  <li className="live__card">
                    <span className="live__glyph" aria-hidden="true">
                      🧾
                    </span>
                    <strong>Add-ons</strong>
                    <span>Confirmed by your server, exactly</span>
                  </li>
                </ul>
              </div>
              <IndiaMap />
            </div>
          </div>
        </section>

        {/* ────────────────────────  HOW IT WORKS  ──────────────────────── */}
        <section className="section how" id="how">
          <div className="container">
            <header className="section-head section-head--center reveal">
              <p className="eyebrow-rule">
                <span>How it works</span>
              </p>
              <h2 className="section-title">Three bites and you&rsquo;re hooked.</h2>
              <p className="section-sub">
                No app. No QR maze. Just a beautifully simple experience that starts the moment they
                sit down.
              </p>
            </header>

            <ol className="steps">
              <li className="step reveal">
                <div className="step__top">
                  <span className="step__n">01</span>
                  <span className="pill pill--step">Arrival</span>
                </div>
                <h3 className="step__title">Guest scans, game begins</h3>
                <p className="step__body">
                  A quick QR scan at the table launches {BRAND.name}. Instantly, guests are pulled
                  into bite-sized menu stories, trivia, and discovery.
                </p>
              </li>
              <li className="step reveal" data-reveal-delay="1">
                <div className="step__top">
                  <span className="step__n">02</span>
                  <span className="pill pill--step">Wait time</span>
                </div>
                <h3 className="step__title">Explore while they wait</h3>
                <p className="step__body">
                  Guests discover menu highlights, chef picks, and off-menu gems through a quick,
                  playful game. With rewards to win and little moments of delight along the way.
                </p>
              </li>
              <li className="step reveal" data-reveal-delay="2">
                <div className="step__top">
                  <span className="step__n">03</span>
                  <span className="pill pill--step">Revenue</span>
                </div>
                <h3 className="step__title">Add to order, effortlessly</h3>
                <p className="step__body">
                  With a tap, they send add-on suggestions straight to the server. No friction. Just
                  a spontaneous second cocktail or dessert they didn&rsquo;t know they wanted.
                </p>
              </li>
              <li className="step reveal" data-reveal-delay="3">
                <div className="step__top">
                  <span className="step__n">04</span>
                  <span className="pill pill--step">Insights</span>
                </div>
                <h3 className="step__title">You get the data</h3>
                <p className="step__body">
                  See what guests explored, what converted, and what flopped. Real engagement
                  signals that make your menu smarter over time.
                </p>
              </li>
            </ol>
          </div>
        </section>

        {/* ─────────────────────  FOR RESTAURANTS  ──────────────────────── */}
        <section className="section forres" id="forres">
          <div className="container">
            <div className="panel reveal">
              <header className="panel__head">
                <div className="panel__headline">
                  <span className="pill">For restaurants</span>
                  <h2 className="section-title">
                    Dead time, meet your new job description
                    <span className="dot" aria-hidden="true">
                      .
                    </span>
                  </h2>
                </div>
                <p className="panel__lead">
                  Every restaurant has idle wait-time. {BRAND.name} puts it to work: quietly,
                  tastefully, effectively.
                </p>
              </header>

              <div className="stats">
                <article className="stat">
                  <span className="stat__icon" aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M8 22h8" />
                      <path d="M7 10h10" />
                      <path d="M12 15v7" />
                      <path d="M12 15a5 5 0 0 0 5-5c0-2-.5-4-1-6H8c-.5 2-1 4-1 6a5 5 0 0 0 5 5Z" />
                    </svg>
                  </span>
                  <p className="stat__num">+28%</p>
                  <p className="stat__label">avg. order value</p>
                  <p className="stat__body">
                    Guests discover and add items they never would have ordered at the table.
                  </p>
                </article>

                <article className="stat">
                  <span className="stat__icon" aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="10" x2="14" y1="2" y2="2" />
                      <line x1="12" x2="15" y1="14" y2="11" />
                      <circle cx="12" cy="14" r="8" />
                    </svg>
                  </span>
                  <p className="stat__num">&minus;40%</p>
                  <p className="stat__label">perceived wait time</p>
                  <p className="stat__body">
                    Engaged guests don&rsquo;t watch the clock. They&rsquo;re too busy eyeing the
                    dessert menu.
                  </p>
                </article>

                <article className="stat">
                  <span className="stat__icon" aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </span>
                  <p className="stat__num">+1.3</p>
                  <p className="stat__label">avg. review score</p>
                  <p className="stat__body">
                    A better wait experience translates directly into better ratings and return
                    visits.
                  </p>
                </article>

                <article className="stat">
                  <span className="stat__icon" aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect width="7" height="7" x="3" y="3" rx="1" />
                      <rect width="7" height="7" x="14" y="3" rx="1" />
                      <rect width="7" height="7" x="14" y="14" rx="1" />
                      <rect width="7" height="7" x="3" y="14" rx="1" />
                    </svg>
                  </span>
                  <p className="stat__num">3.2&times;</p>
                  <p className="stat__label">more menu items viewed</p>
                  <p className="stat__body">
                    Guests explore your full menu, not just what they already know.
                  </p>
                </article>
              </div>
            </div>

            {/* Testimonials */}
            <div className="quotes">
              <figure className="quote quote--peach reveal">
                <blockquote className="quote__text">
                  &ldquo;The tiramisu was gone by nine on opening night. Table after table told us
                  they&rsquo;d spotted it while they waited.&rdquo;
                </blockquote>
                <figcaption className="quote__who">
                  <span className="quote__avatar" aria-hidden="true">
                    KS
                  </span>
                  <span>
                    <span className="quote__name">Kabir Sharma</span>
                    <span className="quote__role">Owner, Dilli Junction, New Delhi</span>
                  </span>
                </figcaption>
              </figure>

              <figure className="quote quote--sage reveal" data-reveal-delay="1">
                <blockquote className="quote__text">
                  &ldquo;Nobody asks &lsquo;how much longer?&rsquo; anymore. Now it&rsquo;s
                  &lsquo;can we add the truffle fries?&rsquo; Guests reach their food already in a
                  good mood.&rdquo;
                </blockquote>
                <figcaption className="quote__who">
                  <span className="quote__avatar" aria-hidden="true">
                    MI
                  </span>
                  <span>
                    <span className="quote__name">Meera Iyer</span>
                    <span className="quote__role">GM, Coastal Table, Bengaluru</span>
                  </span>
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section className="section split" id="floor" aria-labelledby="floor-h">
          <div className="container split__inner">
            <div className="split__copy reveal">
              <p className="eyebrow eyebrow--accent">Your floor</p>
              <h2 className="section-title" id="floor-h">
                One list for your servers
                <span className="dot" aria-hidden="true">
                  .
                </span>
              </h2>
              <ul className="ticks">
                <li>Add-on requests land as tickets at the right table, right now</li>
                <li>One tap to confirm, so your numbers stay exact</li>
                <li>The chef sets kitchen load with a single control</li>
                <li>No dashboards for staff. Only what to do next</li>
              </ul>
            </div>
            <div className="phone reveal" data-reveal-delay="1" aria-hidden="true">
              <div className="phone__bar">Floor &middot; now</div>
              <div className="bubble bubble--in">Table 12 wants the tiramisu.</div>
              <div className="bubble bubble--in">Table 4 added a second mocktail.</div>
              <div className="bubble bubble--out">Confirmed, on the way.</div>
              <div className="bubble bubble--in">Table 7 earned free fries. Code FRIES-7Q.</div>
              <div className="bubble bubble--out">Done.</div>
            </div>
          </div>
        </section>

        <section className="section split" id="guests" aria-labelledby="guests-h">
          <div className="container split__inner">
            <div className="gp gp--beat gp--solo reveal" aria-hidden="true">
              <div className="gp__top">
                <span>Table 12</span>
                <span className="gp__ring">0:23</span>
              </div>
              <p className="gp__q">Which sells more here?</p>
              <div className="gp__card gp__card--pick">
                <span className="gp__emoji">🍛</span>
                <span>Butter chicken</span>
                <small>Chef&rsquo;s favourite</small>
                <span className="gp__price">₹420</span>
              </div>
              <div className="gp__card">
                <span className="gp__emoji">🧆</span>
                <span>Paneer tikka</span>
                <small>From the tandoor</small>
                <span className="gp__price">₹360</span>
              </div>
              <div className="gp__dots">
                <i className="on" />
                <i className="on" />
                <i className="on" />
                <i />
                <i />
              </div>
              <span className="gp__hint">Round 3 of 5 &middot; 2 in a row</span>
            </div>
            <div className="split__copy reveal" data-reveal-delay="1">
              <p className="eyebrow eyebrow--accent">For guests</p>
              <h2 className="section-title" id="guests-h">
                Scan, play, enjoy
                <span className="dot" aria-hidden="true">
                  .
                </span>
              </h2>
              <p className="split__lead">
                No app and no account. A quick round while the kitchen cooks, and a small reward
                earned by skill and always honoured.
              </p>
              <ul className="ticks">
                <li>Free for guests, always</li>
                <li>Leave a number only if you want a reward next visit</li>
                <li>Your review is never tied to how you played</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="section showcase" id="games" aria-labelledby="games-h">
          <div className="container">
            <header className="section-head section-head--center reveal">
              <p className="eyebrow eyebrow--accent">The games</p>
              <h2 className="section-title" id="games-h">
                A round for every table
                <span className="dot" aria-hidden="true">
                  .
                </span>
              </h2>
              <p className="section-sub">
                Each game is built from your own menu, so the dishes guests play with are the dishes
                you want to sell.
              </p>
            </header>
            <div className="showcase__grid">
              <figure className="showcase__item reveal">
                <div className="gp gp--beat" aria-hidden="true">
                  <div className="gp__top">
                    <span>Beat the Kitchen</span>
                    <span className="gp__ring">0:23</span>
                  </div>
                  <p className="gp__q">Which sells more here?</p>
                  <div className="gp__card gp__card--pick">
                    <span className="gp__emoji">🍛</span>
                    <span>Butter chicken</span>
                    <small>Chef&rsquo;s favourite</small>
                    <span className="gp__price">₹420</span>
                  </div>
                  <div className="gp__card">
                    <span className="gp__emoji">🧆</span>
                    <span>Paneer tikka</span>
                    <small>From the tandoor</small>
                    <span className="gp__price">₹360</span>
                  </div>
                  <div className="gp__dots">
                    <i className="on" />
                    <i className="on" />
                    <i className="on" />
                    <i />
                    <i />
                  </div>
                  <span className="gp__hint">Round 3 of 5 &middot; 2 in a row</span>
                </div>
                <figcaption className="showcase__cap">
                  <strong>Beat the Kitchen</strong>
                  Guess what sells. Real dishes, a short clock.
                </figcaption>
              </figure>

              <figure className="showcase__item reveal" data-reveal-delay="1">
                <div className="gp gp--recipe" aria-hidden="true">
                  <div className="gp__top">
                    <span>Secret Recipe</span>
                    <span className="gp__chip">2 of 3</span>
                  </div>
                  <p className="gp__q">What goes into the signature thali?</p>
                  <div className="gp__tags">
                    <span className="gp__tag gp__tag--on">Saffron</span>
                    <span className="gp__tag">Coconut</span>
                    <span className="gp__tag gp__tag--on">Cardamom</span>
                    <span className="gp__tag">Tamarind</span>
                    <span className="gp__tag">Curry leaf</span>
                    <span className="gp__tag">Jaggery</span>
                  </div>
                  <span className="gp__hint">Pick three that belong together.</span>
                  <span className="gp__cta">Check my recipe</span>
                </div>
                <figcaption className="showcase__cap">
                  <strong>Secret Recipe</strong>
                  Piece the dish together and meet the menu&rsquo;s best.
                </figcaption>
              </figure>

              <figure className="showcase__item reveal" data-reveal-delay="2">
                <div className="gp gp--mystery" aria-hidden="true">
                  <div className="gp__top">
                    <span>Mystery Customer</span>
                    <span className="gp__chip">New order</span>
                  </div>
                  <div className="gp__guest">
                    <span className="gp__avatar">🧑‍🍳</span>
                    <p className="gp__say">
                      Vegetarian, and I&rsquo;d like something warm but not too spicy.
                    </p>
                  </div>
                  <div className="gp__card">
                    <span className="gp__emoji">🍲</span>
                    <span>Dal makhani</span>
                    <small>Slow-cooked, mild</small>
                    <span className="gp__price">₹340</span>
                  </div>
                  <div className="gp__card gp__card--pick">
                    <span className="gp__emoji">🥘</span>
                    <span>Paneer lababdar</span>
                    <small>Creamy, gentle heat</small>
                    <span className="gp__price">₹390</span>
                  </div>
                  <div className="gp__card">
                    <span className="gp__emoji">🌶️</span>
                    <span>Chilli paneer</span>
                    <small>Hot and tangy</small>
                    <span className="gp__price">₹380</span>
                  </div>
                </div>
                <figcaption className="showcase__cap">
                  <strong>Mystery Customer</strong>
                  Serve the right dish to a guest with a story.
                </figcaption>
              </figure>

              <figure className="showcase__item reveal" data-reveal-delay="3">
                <div className="gp gp--reward" aria-hidden="true">
                  <div className="gp__top" style={{ width: '100%' }}>
                    <span>Reward unlocked</span>
                  </div>
                  <span className="gp__burst">🍟</span>
                  <p className="gp__q">Free masala fries</p>
                  <span className="gp__hint">Earned by skill. Yours to claim.</span>
                  <div className="gp__ticket">
                    <span className="gp__hint">Show your server</span>
                    <b>FRIES-7Q</b>
                  </div>
                  <span className="gp__cta" style={{ width: '100%' }}>
                    Add a dessert too
                  </span>
                </div>
                <figcaption className="showcase__cap">
                  <strong>A reward that&rsquo;s honoured</strong>
                  Inside your fences, confirmed by your server.
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        <div className="marquee" aria-hidden="true">
          <div className="marquee__track">
            {[0, 1].map((i) => (
              <span className="marquee__set" key={i}>
                <span>Beat the Kitchen</span>
                <span>Secret Recipe</span>
                <span>Mystery Customer</span>
                <span>Chef&rsquo;s picks</span>
                <span>Add to order</span>
                <span>Unlock a reward</span>
              </span>
            ))}
          </div>
        </div>

        <section className="section pricing" id="pricing" aria-labelledby="pricing-h">
          <div className="container">
            <header className="section-head section-head--center reveal">
              <p className="eyebrow eyebrow--accent">Simple pricing</p>
              <h2 className="section-title" id="pricing-h">
                Choose your plan
                <span className="dot" aria-hidden="true">
                  .
                </span>
              </h2>
              <p className="section-sub">No contracts. Cancel anytime.</p>
            </header>
            <div className="plan reveal">
              <p className="plan__name">Pilot venue</p>
              <p className="plan__price">Pilot terms</p>
              <p className="plan__note">Agreed with you before you start.</p>
              <ul className="ticks ticks--plain">
                <li>Self-serve setup: menu, tables, staff PINs, QR</li>
                <li>Two games, tuned to your own fences</li>
                <li>Server tickets and chef kitchen-load control</li>
                <li>Dashboard with exact counts and honest rates</li>
              </ul>
              <Link className="btn btn--primary btn--lg" href="/signup">
                Start growing today
              </Link>
            </div>
          </div>
        </section>

        <section className="section faq" id="faq" aria-labelledby="faq-h">
          <div className="container faq__inner">
            <h2 className="section-title reveal" id="faq-h">
              Questions &amp; answers
            </h2>
            <div className="faq__list reveal">
              <details>
                <summary>Do guests need an app or an account?</summary>
                <p>
                  No. They scan the table QR and play in the browser. A phone number is only asked
                  for after a round, and only if they want a reward next visit.
                </p>
              </details>
              <details>
                <summary>Is any of it a game of chance?</summary>
                <p>
                  No. Outcomes depend on the guest&rsquo;s skill, never on a random roll, and every
                  reward decision records why it was made.
                </p>
              </details>
              <details>
                <summary>Do I need my POS to connect?</summary>
                <p>
                  No. Servers confirm add-ons with one tap. A bill export can be imported later for
                  fuller numbers.
                </p>
              </details>
              <details>
                <summary>What does it cost me in discounts?</summary>
                <p>
                  You set the fences: which items can be rewards, how deep, and how often. Nothing
                  outside them is ever offered.
                </p>
              </details>
              <details>
                <summary>Can it affect my reviews?</summary>
                <p>
                  Every guest is invited to review, whatever they played or won. A rating is never
                  stored and never gates a reward.
                </p>
              </details>
              <details>
                <summary>How long does setup take?</summary>
                <p>
                  You do it yourself in a few guided steps and finish with a printable QR for every
                  table.
                </p>
              </details>
            </div>
          </div>
        </section>

        {/* ────────────────────────────  CTA  ───────────────────────────── */}
        <section className="cta">
          <div className="container cta__inner reveal">
            <h2 className="cta__title">
              Ready to turn the wait into <em>revenue?</em>
            </h2>
            <p className="cta__body">
              Join a handful of pilot restaurants transforming dead wait-time into their most
              profitable moment.
            </p>
            <div className="cta__actions">
              <Link className="btn btn--primary btn--lg" href="/signup">
                Get Started Now
                <svg
                  className="btn__arrow"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14m0 0-6-6m6 6-6 6" />
                </svg>
              </Link>
              <Link className="btn btn--on-dark btn--lg" href="/refer">
                Refer a Restaurant
              </Link>
            </div>
            <p className="cta__fine">No setup fee. Just happy, spending guests.</p>
          </div>
        </section>
      </main>

      {/* ───────────────────────────  FOOTER  ─────────────────────────── */}
      <footer className="footer">
        <div className="container">
          <div className="footer__divider" aria-hidden="true" />
          <div className="footer__brand">
            <p className="footer__word">
              {BRAND.name}
              {BRAND.beta && <span className="nav__beta">{BRAND.beta}</span>}
            </p>
            <p className="footer__tag">Revenue from Dead Zones.</p>
          </div>
          <div className="footer__row">
            <span className="footer__copy">&copy; 2026 {BRAND.name}. All rights reserved.</span>
            <nav className="footer__links" aria-label="Footer">
              <Link href="/refer">Refer a Restaurant</Link>
            </nav>
          </div>
        </div>
      </footer>

      <LandingEnhancements />
    </div>
  )
}
