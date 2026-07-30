'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { requestMagicLink } from '@/lib/operator-auth'
import { clearOperatorSessionCookie } from '@/lib/operator-session'
import { clientIpFrom, looksLikeEmail } from '@/lib/magic-link'
import { publicBaseUrl } from '@/lib/base-url'

export async function requestLink(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '')

  // A malformed address is a typo the user can see and fix, so saying so leaks
  // nothing. Everything past this point returns the same screen either way.
  if (!looksLikeEmail(email)) redirect('/signin?error=invalid_email')

  // Recorded on the token row and rate-limited on, so one client cannot use us
  // as an open mail relay against a list of addresses (SECURITY.md §7).
  const fromIp = clientIpFrom((await headers()).get('x-forwarded-for'))

  await requestMagicLink(email, publicBaseUrl(), Date.now(), fromIp)

  // Identical response whether the address is known, unknown, or rate-limited.
  // Telling an attacker they hit a limit is free information.
  redirect('/signin?sent=1')
}

export async function signOut(): Promise<void> {
  await clearOperatorSessionCookie()
  redirect('/')
}
