import Link from 'next/link'
import { BRAND } from '@/brand'
import { en } from '@/strings/en'
import { getOperatorWithoutVenue } from '@/lib/operator-session'
import { signOut } from './signin/actions'
import { operatorFontVars } from '../fonts'

export const dynamic = 'force-dynamic'

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  // `getOperatorWithoutVenue`, not `getOperator`: signup and sign-in are the
  // same request, so a brand-new operator holds a valid session with no venue
  // yet. `getOperator` returns null for them, which would render the shell with
  // no nav and — worse — no way to sign out of a session they demonstrably have.
  const operator = await getOperatorWithoutVenue()

  return (
    <div className={`${operatorFontVars} surface-operator min-h-dvh`}>
      <header className="border-b border-line">
        <nav className="mx-auto flex w-full max-w-4xl items-center gap-5 px-6 py-4">
          <Link href="/" className="text-xs tracking-widest text-muted uppercase">
            {BRAND.name}
          </Link>

          {operator && (
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
              <Link href="/tents" className="text-sm">
                {en.dash.tents}
              </Link>
              <form action={signOut} className="ml-auto">
                <button type="submit" className="text-sm text-muted">
                  {en.signin.signOut}
                </button>
              </form>
            </>
          )}
        </nav>
      </header>
      {children}
    </div>
  )
}
