'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { en } from '@/strings/en'
import { signOut } from './signin/actions'

/**
 * The operator nav strip — the tab bar for the signed-in app.
 *
 * It must NOT appear on the pre-auth pages. `/signin` and `/signup` render
 * inside this layout, and a visitor landing on them (possibly still holding a
 * session cookie) has no business being shown the dashboard tabs yet. But a
 * signed-in operator who ends up back on those pages still needs the one
 * escape hatch the signed-in shell offers: sign out (see the rationale in
 * `(operator)/layout.tsx`). So on those two paths we render the sign-out form
 * alone; everywhere else the full strip renders when signed in.
 */
export function OperatorNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname()
  const isAuthPage = pathname === '/signin' || pathname === '/signup'

  if (!signedIn) return null

  if (isAuthPage) {
    return (
      <form action={signOut} className="ml-auto">
        <button type="submit" className="text-sm text-muted">
          {en.signin.signOut}
        </button>
      </form>
    )
  }

  return (
    <>
      <Link href="/dash" className="text-sm">
        {en.dash.heading}
      </Link>
      <Link href="/dash/activity" className="text-sm">
        {en.dash.activity.heading}
      </Link>
      <Link href="/dash/menu" className="text-sm">
        {en.dash.menuNav}
      </Link>
      <Link href="/dash/prizes" className="text-sm">
        {en.dash.prizesNav}
      </Link>
      <Link href="/dash/games" className="text-sm">
        {en.dash.gamesNav}
      </Link>
      <Link href="/dash/import" className="text-sm">
        {en.dash.importNav}
      </Link>
      <Link href="/dash/feedback" className="text-sm">
        {en.dash.feedbackNav}
      </Link>
      <Link href="/dash/settings" className="text-sm">
        {en.dash.settingsNav}
      </Link>
      <Link href="/tents" className="text-sm">
        {en.dash.tents}
      </Link>
      <form action={signOut} className="ml-auto">
        <button type="submit" className="text-sm text-muted">
          {en.signin.signOut}
        </button>
      </form>
    </>
  )
}