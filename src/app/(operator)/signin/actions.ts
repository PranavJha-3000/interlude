'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { clientIpFrom } from '@/lib/magic-link'
import { signInWithPassword } from '@/lib/operator-password-auth'
import { clearOperatorSessionCookie, setOperatorSessionCookie } from '@/lib/operator-session'

/**
 * Sign in with an email and a password (SECURITY.md §7a).
 *
 * The magic-link request action that used to live here is gone from the UI, not
 * from the codebase: `requestMagicLink` and `/signin/verify` both still work,
 * and a link already issued still signs someone in. Offering to send a new one
 * while there is no verified sending domain would be offering a door that
 * cannot open — which is exactly the failure that led here.
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

  await setOperatorSessionCookie({ operatorId: result.operatorId, venueId: result.venueId })

  // `redirect` throws NEXT_REDIRECT, so it goes last and must never sit inside
  // a try/catch that swallows it.
  redirect('/dash')
}

export async function signOut(): Promise<void> {
  await clearOperatorSessionCookie()
  redirect('/')
}
