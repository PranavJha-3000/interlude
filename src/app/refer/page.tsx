import type { Metadata } from 'next'
import Link from 'next/link'
import { Fraunces, Plus_Jakarta_Sans } from 'next/font/google'

import { BRAND } from '@/brand'
import { en } from '@/strings/en'
import { issueReferralFormToken } from '@/lib/referral'

import { submitReferral } from './actions'
import '../landing.css'

/**
 * Where "Refer a Restaurant" lands. Deliberately a sibling of `/` rather than
 * part of it: the CTA pointed nowhere until now, so this route starts life as
 * the thing the click was always promising — seven questions, one screen, no
 * account, no waiting room.
 *
 * Same `.lp` wrapper, same two faces, same warm palette as the landing — this
 * page borrows landing.css wholesale instead of growing a second identity.
 * `force-dynamic` is load-bearing: the form carries a signed issue-time stamp,
 * and a prerendered page would hand every visitor the build day's token until
 * the time trap rejected it twelve hours later.
 */

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

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `${BRAND.name} — Refer a restaurant`,
  description:
    'Know a restaurant that should run this? Send them to us in one minute — we call them ourselves.',
}

type ReferSearchParams = Promise<Record<string, string | string[] | undefined>>

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function ReferPage({ searchParams }: { searchParams: ReferSearchParams }) {
  const params = await searchParams
  const submitted = firstValue(params.submitted) === '1'
  const errorCode = firstValue(params.error)

  const secret = process.env.SESSION_SECRET ?? ''
  // The issued-at stamp is data, not state: this component runs exactly once
  // per request (force-dynamic above), so calling the clock during render is
  // precisely what a signed form token needs. The rule cannot see the route's
  // contract; this line documents why the exemption is deliberate.
  // eslint-disable-next-line react-hooks/purity -- time of issue is the payload
  const formToken = issueReferralFormToken(secret, Date.now())

  const t = en.refer
  const errorMessage =
    errorCode === undefined ? undefined : (t.errors[errorCode] ?? t.errors.GENERIC)

  return (
    <div id="top" className={`lp ${fraunces.variable} ${jakarta.variable}`}>
      {/* Minimal sibling of the landing nav — one way back, nothing to explore. */}
      <header className="nav nav--solid">
        <div className="nav__inner container">
          <Link className="nav__brand" href="/">
            {BRAND.name}
          </Link>
          <div className="nav__actions">
            <Link className="btn btn--dark btn--sm" href="/">
              Back to the site
            </Link>
          </div>
        </div>
      </header>

      <main className="rmain container">
        <section className="rwrap">
          <span className="pill">{t.eyebrow}</span>
          <h1 className="rtitle">{t.heading}</h1>
          <p className="rintro">{t.body}</p>

          {submitted ? (
            <div className="rcard rcard--success">
              <span className="rsuccess__mark" aria-hidden="true">
                ✓
              </span>
              <h2 className="rsuccess__heading">{t.success.heading}</h2>
              <p className="rsuccess__body">{t.success.body}</p>
              <Link className="btn btn--primary btn--lg" href="/">
                {t.success.backHome}
              </Link>
            </div>
          ) : (
            <div className="rcard">
              {errorMessage && (
                <div className="rform__error" role="alert">
                  <strong>{t.errorHeading}</strong>
                  {errorMessage}
                </div>
              )}

              {/* Plain HTML form posting to a server action — readable,
                  submittable and recoverable without any JavaScript. */}
              <form action={submitReferral} className="rform" noValidate>
                <input type="hidden" name="ft" value={formToken} />

                <div className="rfield rfield--full">
                  <label className="rlabel" htmlFor="rf-restaurant">
                    {t.fields.restaurantLabel} <span aria-hidden="true">*</span>
                  </label>
                  <input
                    className="rinput"
                    id="rf-restaurant"
                    name="restaurantName"
                    type="text"
                    autoComplete="organization"
                    maxLength={120}
                    placeholder={t.fields.restaurantPlaceholder}
                    required
                  />
                </div>

                <div className="rfield rfield--full">
                  <label className="rlabel" htmlFor="rf-location">
                    {t.fields.locationLabel} <span aria-hidden="true">*</span>
                  </label>
                  <input
                    className="rinput"
                    id="rf-location"
                    name="location"
                    type="text"
                    autoComplete="address-level2"
                    maxLength={160}
                    placeholder={t.fields.locationPlaceholder}
                    required
                  />
                </div>

                <div className="rfield">
                  <label className="rlabel" htmlFor="rf-poc-name">
                    {t.fields.pocNameLabel} <span aria-hidden="true">*</span>
                  </label>
                  <input
                    className="rinput"
                    id="rf-poc-name"
                    name="pocName"
                    type="text"
                    maxLength={80}
                    placeholder={t.fields.pocNamePlaceholder}
                    required
                  />
                </div>

                <div className="rfield">
                  <label className="rlabel" htmlFor="rf-poc-phone">
                    {t.fields.pocPhoneLabel} <span aria-hidden="true">*</span>
                  </label>
                  <input
                    className="rinput"
                    id="rf-poc-phone"
                    name="pocPhone"
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    maxLength={24}
                    placeholder="+91 98765 43210"
                    required
                  />
                  <p className="rhelp">{t.fields.pocPhoneHelp}</p>
                </div>

                <div className="rfield rfield--full">
                  <label className="rlabel" htmlFor="rf-poc-role">
                    {t.fields.pocRoleLabel} <span aria-hidden="true">*</span>
                  </label>
                  <input
                    className="rinput"
                    id="rf-poc-role"
                    name="pocRoleTitle"
                    type="text"
                    maxLength={80}
                    placeholder={t.fields.pocRolePlaceholder}
                    required
                  />
                </div>

                <div className="rfield">
                  <label className="rlabel" htmlFor="rf-referrer-name">
                    {t.fields.referrerNameLabel} <span aria-hidden="true">*</span>
                  </label>
                  <input
                    className="rinput"
                    id="rf-referrer-name"
                    name="referrerName"
                    type="text"
                    maxLength={80}
                    placeholder={t.fields.referrerNamePlaceholder}
                    required
                  />
                </div>

                <div className="rfield">
                  <label className="rlabel" htmlFor="rf-referrer-contact">
                    {t.fields.referrerContactLabel} <span aria-hidden="true">*</span>
                  </label>
                  <input
                    className="rinput"
                    id="rf-referrer-contact"
                    name="referrerContact"
                    type="text"
                    maxLength={254}
                    placeholder="you@restaurant.in"
                    required
                  />
                  <p className="rhelp">{t.fields.referrerContactHelp}</p>
                </div>

                {/* Honeypot: off-flow, invisible, never announced. A filled
                    field means the form was filled by something that parses
                    markup rather than reads it. */}
                <div className="rhoney" aria-hidden="true">
                  <label htmlFor="rf-company">{t.honeypotLabel}</label>
                  <input
                    id="rf-company"
                    name="company"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>

                <p className="rnote">{t.fields.requiredNote}</p>
                <button className="btn btn--primary btn--lg rsubmit" type="submit">
                  {t.fields.submit}
                </button>
              </form>
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        <div className="container footer__inner">
          <span className="footer__word">{BRAND.name}</span>
          <span className="footer__copy">&copy; 2026 {BRAND.name}. All rights reserved.</span>
        </div>
      </footer>
    </div>
  )
}
