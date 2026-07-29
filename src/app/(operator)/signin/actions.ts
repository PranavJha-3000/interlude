'use server'

import { redirect } from 'next/navigation'
import { requestMagicLink } from '@/lib/operator-auth'
import { clearOperatorSessionCookie } from '@/lib/operator-session'
import { looksLikeEmail } from '@/lib/magic-link'

export async function requestLink(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '')

  // A malformed address is a typo the user can see and fix, so saying so leaks
  // nothing. Everything past this point returns the same screen either way.
  if (!looksLikeEmail(email)) redirect('/signin?error=invalid_email')

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  await requestMagicLink(email, base, Date.now())

  // Identical response whether the address is known, unknown, or rate-limited.
  // Telling an attacker they hit a limit is free information.
  redirect('/signin?sent=1')
}

export async function signOut(): Promise<void> {
  await clearOperatorSessionCookie()
  redirect('/')
}
