'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { clientIpFrom } from '@/lib/magic-link'
import { signUpWithPassword } from '@/lib/operator-password-auth'
import { setOperatorSessionCookie } from '@/lib/operator-session'

/**
 * Create an operator account (SECURITY.md §7a).
 *
 * There is no confirmation email, because there is no email. That is the whole
 * reason this route exists, and it is a real weakening: nothing here proves the
 * person typing an address can read it. Acceptable only because the account is
 * worth nothing until it is attached to a venue during onboarding, and only
 * until a verified sending domain makes the magic link workable again.
 */
export async function signUp(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  const fromIp = clientIpFrom((await headers()).get('x-forwarded-for'))

  const result = await signUpWithPassword(email, password, Date.now(), fromIp)

  if (!result.ok) {
    const code = {
      INVALID_EMAIL: 'invalid_email',
      WEAK_PASSWORD: 'weak_password',
      EMAIL_TAKEN: 'email_taken',
      RATE_LIMITED: 'rate_limited',
    }[result.reason]
    redirect(`/signup?error=${code}`)
  }

  // Straight into a session — a signup that then asks you to sign in is asking
  // the same question twice. `venueId` is null: onboarding attaches the venue,
  // and may be abandoned halfway.
  await setOperatorSessionCookie({ operatorId: result.operatorId, venueId: null })

  // Into the wizard, not the dashboard. A dashboard for a venue that does not
  // exist yet has nothing on it, and the first thing it would have to say is
  // "go and set your venue up" — which is this.
  redirect('/onboarding')
}
