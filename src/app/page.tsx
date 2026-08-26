import type { Metadata } from 'next'
import Link from 'next/link'
import { Fraunces, Plus_Jakarta_Sans } from 'next/font/google'
import { BRAND } from '@/brand'
import { LandingEnhancements } from './landing-enhancements'
import './landing.css'

/**
 * The public front door — the `/` route Vercel and `npm run dev` serve.
 *
 * Warm cream ground, terracotta accent, soft rounded cards. Headlines are a
 * heavy Plus Jakarta Sans grotesk; Fraunces italic appears exactly once, on
 * the hero's accent word, as the single serif touch. The hero is a centred
 * headline floating over product-UI cards and a warm wash; below it a numbered
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
  display: 'swap',
  variable: '--font-jakarta',
})

// This is the one public, indexable page. The root layout defaults every route
// to noindex (the operator/guest app is private); the marketing front door
// overrides that back to indexable.
export const metadata: Metadata = {
  title: `${BRAND.name} — Merchandising wait times`,
  description: `${BRAND.name} turns the minutes between ordering and eating into menu discovery — a quick, playful moment at the table that gets guests to order more and leave happier. No app, no login. Onboarding pilot restaurants now.`,
  robots: { index: true, follow: true },
}

export default function LandingPage() {
  return (
    <div id="top" className={`lp ${fraunces.variable} ${jakarta.variable}`} suppressHydrationWarning>
      {/*
        Add the JS-ready class before first paint, so `.reveal` sections start
        hidden ONLY when JS is present to reveal them. Without JS the class is
        never added and every section stays visible — the animation is pure
        enhancement, never a prerequisite for reading the page.

        The script mutates this div's own className, so its server HTML and
        post-script client DOM differ by exactly ` lp--js`. That is a deliberate
        difference, not a bug, so the element opts out of hydration diffing —
        the flag stays on this one node and does not affect its children.
      */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.currentScript.parentElement.classList.add('lp--js')`,
        }}
      />

      <a className="skip-link" href="#how">
        Skip to content
      </a>

      {/* ───────────────────────────  NAV  ─────────────────────────── */}
      <header className="nav" id="nav" data-nav>
        <div className="nav__inner container">
          <a className="nav__brand" href="#top" aria-label={`${BRAND.name} — home`}>
            {BRAND.name}
            <span className="nav__beta">beta</span>
          </a>

          <nav className="nav__links" aria-label="Primary">
            <a href="#how">How it works</a>
            <a href="#forres">For restaurants</a>
          </nav>

          <div className="nav__actions">
            <a className="nav__refer" href="#">
              Refer a Restaurant
            </a>
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
          <a href="#">Refer a Restaurant</a>
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
          <div className="hero__stage container">
            {/* Decorative product surfaces floating behind the headline. Masked
                out of the centre and hidden below 60rem — purely atmospheric. */}
            <div className="hero__float" aria-hidden="true">
              <div className="floaty floaty--a">
                <span className="floaty__label">Guest review</span>
                <span className="floaty__stars">★★★★★</span>
                <p className="floaty__line">&ldquo;Tried the dessert I saw in the game.&rdquo;</p>
              </div>

              <div className="floaty floaty--play floaty--b">
                <div className="floaty__head">
                  <span className="floaty__label">Beat the kitchen</span>
                  <span className="floaty__timer">0:23</span>
                </div>
                <p className="floaty__q">Tonight&rsquo;s chef&rsquo;s pick?</p>
                <div className="floaty__opts">
                  <span className="floaty__opt floaty__opt--pick">Truffle fries</span>
                  <span className="floaty__opt">Garlic bread</span>
                </div>
              </div>

              <div className="floaty floaty--c">
                <span className="floaty__label">Reward unlocked</span>
                <p className="floaty__code">FRIES-7Q</p>
                <p className="floaty__sub">Show your server</p>
              </div>

              <div className="floaty floaty--pick floaty--d">
                <span className="floaty__emoji">🍰</span>
                <div>
                  <span className="floaty__label">Added to order</span>
                  <p className="floaty__line">Tiramisu · ₹280</p>
                </div>
              </div>

              <div className="floaty floaty--chip floaty--e">
                <p className="floaty__line">+ 3 items discovered</p>
              </div>

              <div className="floaty floaty--chip floaty--f">
                <p className="floaty__line">★ 4.9 this week</p>
              </div>
            </div>

            {/* The thesis: a centred two-tone headline over the wash. */}
            <div className="hero__center">
              <span className="hero__pin" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C7.9 2 4.5 5.4 4.5 9.5c0 5.3 6.3 11.4 7 12.1.3.3.7.3 1 0 .7-.7 7-6.8 7-12.1C19.5 5.4 16.1 2 12 2Zm0 10.2a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4Z" />
                </svg>
              </span>
              <h1 className="hero__title">
                <em>Merchandising</em>
                wait times
                <span className="dot" aria-hidden="true">
                  .
                </span>
              </h1>
              <p className="hero__sub">
                {BRAND.name} turns the time between order and arrival into a playful, menu-driven
                experience &mdash; so guests discover more, order more, and leave happier.
              </p>
              <p className="hero__note">Now taking pilot restaurants</p>
            </div>
          </div>
        </section>

        {/* ────────────────────────  HOW IT WORKS  ──────────────────────── */}
        <section className="section how" id="how">
          <div className="container">
            <header className="section-head reveal">
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
                  A quick QR scan at the table launches {BRAND.name}. Instantly, guests are drawn
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
                  Guests unlock menu highlights, chef picks, and off-menu gems through light
                  gamification &mdash; earning points, badges, and little moments of delight.
                </p>
              </li>
              <li className="step reveal" data-reveal-delay="2">
                <div className="step__top">
                  <span className="step__n">03</span>
                  <span className="pill pill--step">Revenue</span>
                </div>
                <h3 className="step__title">Add to order, effortlessly</h3>
                <p className="step__body">
                  With a tap, they send add-on suggestions straight to the server. No friction
                  &mdash; just a spontaneous second cocktail or dessert they didn&rsquo;t know they
                  wanted.
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
                  Every restaurant has idle wait-time. {BRAND.name} puts it to work &mdash; quietly,
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
                  &ldquo;We sold out of our featured dessert on the first night. Guests kept saying
                  they saw it in the game.&rdquo;
                </blockquote>
                <figcaption className="quote__who">
                  <span className="quote__avatar" aria-hidden="true">
                    KS
                  </span>
                  <span>
                    <span className="quote__name">Kabir Sharma</span>
                    <span className="quote__role">Owner, Dilli Junction — New Delhi</span>
                  </span>
                </figcaption>
              </figure>

              <figure className="quote quote--sage reveal" data-reveal-delay="1">
                <blockquote className="quote__text">
                  &ldquo;Our servers love it. Guests arrive at the table already excited &mdash; the
                  conversation shifts from &lsquo;how long?&rsquo; to &lsquo;can I add the truffle
                  fries?&rsquo;&rdquo;
                </blockquote>
                <figcaption className="quote__who">
                  <span className="quote__avatar" aria-hidden="true">
                    MI
                  </span>
                  <span>
                    <span className="quote__name">Meera Iyer</span>
                    <span className="quote__role">GM, Coastal Table — Bengaluru</span>
                  </span>
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* ────────────────────────────  CTA  ───────────────────────────── */}
        <section className="cta">
          <div className="container">
            <div className="cta__block reveal">
              <span className="pill pill--on-dark">For restaurants &amp; F&amp;B operators</span>
              <h2 className="cta__title">Ready to turn the wait into revenue?</h2>
              <p className="cta__body">
                Join a handful of pilot restaurants transforming dead wait-time into their most
                profitable moment.
              </p>
              <div className="cta__actions">
                <Link className="btn btn--primary btn--lg" href="/signup">
                  Get Started
                </Link>
                <a className="btn btn--on-dark btn--lg" href="#how">
                  See how it works
                </a>
              </div>
              <p className="cta__fine">
                No setup fee. No long-term contract. Just happy, spending guests.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ───────────────────────────  FOOTER  ─────────────────────────── */}
      <footer className="footer">
        <div className="container footer__inner">
          <span className="footer__word">{BRAND.name}</span>
          <nav className="footer__links" aria-label="Footer">
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Contact</a>
          </nav>
          <span className="footer__copy">
            &copy; 2026 {BRAND.name}. All rights reserved.
          </span>
        </div>
      </footer>

      <LandingEnhancements />
    </div>
  )
}
