import 'server-only'

import { BRAND } from '@/brand'

/**
 * Outbound email.
 *
 * **In development there is no API key and no network call** — the message,
 * sign-in link included, is written to the console you ran `npm run dev` in.
 * That is a convenience, but it is also the reason a developer never needs
 * production email credentials on their laptop (SECURITY.md §7).
 *
 * There is deliberately no in-memory outbox and no route that serves the last
 * link. The E2E suite runs `next build && next start`, which is production, so
 * a dev-only outbox could not serve it anyway — `e2e/fixtures.ts` writes the
 * token row directly instead, which exercises the real consume path and adds no
 * production surface.
 *
 * `RESEND_API_KEY` is read only here, and this module imports `server-only`, so
 * the build fails rather than shipping it to a guest's phone.
 */

export interface Email {
  to: string
  subject: string
  text: string
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

export type EmailTransport = 'resend' | 'console'

/**
 * Which way a message leaves — and the refusal that keeps the console from
 * being one of them by accident.
 *
 * The console fallback is a development convenience, but it used to be
 * reachable anywhere, which made a deployment with no `RESEND_API_KEY` behave
 * like a working one: `/signin` answers "check your email", the link is written
 * to a serverless log nobody reads, and no operator can ever sign in. That is
 * the same silent outage `base-url.ts` refuses to allow, so it is refused the
 * same way — loudly, at the point of use.
 *
 * `EMAIL_TRANSPORT=console` is the deliberate exception. The E2E suite runs
 * `next build && next start`, so it is a production build that legitimately has
 * no key; naming the transport is what separates that from a misconfiguration.
 */
export function emailTransport(): EmailTransport {
  if (isEmailConfigured()) return 'resend'
  if (process.env.EMAIL_TRANSPORT === 'console') return 'console'

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'RESEND_API_KEY is not set in a production build, so no sign-in link can be delivered ' +
        'and every operator would be locked out with the page still saying "check your email". ' +
        'Set RESEND_API_KEY and EMAIL_FROM, or set EMAIL_TRANSPORT=console to accept ' +
        'console-only delivery on purpose.'
    )
  }

  return 'console'
}

export async function sendEmail(email: Email): Promise<void> {
  if (emailTransport() === 'console') {
    console.log(
      `\n──────── ${BRAND.name} email (no RESEND_API_KEY — not sent) ────────\n` +
        `To:      ${email.to}\n` +
        `Subject: ${email.subject}\n\n${email.text}\n` +
        `──────────────────────────────────────────────────────────\n`
    )
    return
  }

  const from = process.env.EMAIL_FROM
  if (!from) throw new Error('EMAIL_FROM is not set — see .env.example')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text }),
  })

  if (!response.ok) {
    // The body can contain the address, so log the status and not the payload.
    throw new Error(`Resend rejected the message (${response.status})`)
  }
}

/**
 * Send a sign-in link.
 *
 * The copy says what the link does, how long it lasts, and what to do if it was
 * not requested — because a magic link arriving unrequested is the one signal a
 * recipient has that someone is guessing at their address.
 */
export async function sendMagicLink(to: string, url: string, ttlMinutes: number): Promise<void> {
  await sendEmail({
    to,
    subject: `Sign in to ${BRAND.name}`,
    text:
      `Open this link to sign in. It works once and expires in ${ttlMinutes} minutes.\n\n` +
      `${url}\n\n` +
      `If you did not ask to sign in, ignore this — the link does nothing until it is opened, ` +
      `and nobody can request another on your behalf without your address.\n`,
  })
}
