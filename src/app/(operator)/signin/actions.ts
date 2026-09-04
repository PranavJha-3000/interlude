'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { clientIpFrom } from '@/lib/magic-link'
import { signInWithPassword } from '@/lib/operator-password-auth'
import {
  clearOperatorSessionCookie,
  clearPendingRoleCookie,
  setOperatorSessionCookie,
  setPendingRoleCookie,
} from '@/lib/operator-session'

/**
 * Sign in with an email and a password (SECURITY.md §7a).
 *
 * The magic-link request action that used to live here is gone from the UI, not
 * from the codebase: `requestMagicLink` and `/signin/verify` both still work,
 * and a link already issued still signs someone in. Offering to send a new one
 * while there is no verified sending domain would be offering a door that
 * cannot open — which is exactly the failure that led here.
 *
 * Password-verified is not signed-in. This action only proves the shared
 * account's credentials; it issues a short-lived **pending** cookie and sends
 * the device to the code step (`/signin/code`), where the entered code decides
 * what that device can open — the dashboard for an admin code, the floor and
 * pass for a staff one. The real session cookie is never issued here, so no
 * admin surface can be reached by the password alone.
 */
export async function signIn(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  // Rate-limited on, so this endpoint is not a free password oracle.
  const fromIp = clientIpFrom((await headers()).get('x-forwarded-for'))

  const result = await signInWithPassword(email, password, Date.now(), fromIp)

  if (!result.ok) {
    // One code for every credential failure — a malformed address, an unknown
    // one, a wrong password. `signInWithPassword` already spends the same time
    // on each; a more specific redirect would undo that from the front.
    redirect(result.reason === 'RATE_LIMITED' ? '/signin?error=rate_limited' : '/signin?error=bad')
  }

  // A fresh login is a fresh role decision. Whatever this device was signed in
  // as before — operator, staff — is cleared the moment the password verifies,
  // so the code step alone decides what it becomes next.
  await clearOperatorSessionCookie()

  // A brand-new account has no venue, so there is no code to check against and
  // nothing to protect yet. Straight to onboarding, exactly as signup does;
  // the code step begins once a venue exists.
  if (!result.venueId) {
    await setOperatorSessionCookie({ operatorId: result.operatorId, venueId: null })
    redirect('/onboarding')
  }

  await setPendingRoleCookie({ operatorId: result.operatorId, venueId: result.venueId })

  // `redirect` throws NEXT_REDIRECT, so it goes last and must never sit inside
  // a try/catch that swallows it.
  redirect('/signin/code')
}

export async function signOut(): Promise<void> {
  await clearOperatorSessionCookie()
  await clearPendingRoleCookie()
  redirect('/')
}
