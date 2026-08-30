import Link from 'next/link'
import { BRAND } from '@/brand'
import { getOperatorWithoutVenue } from '@/lib/operator-session'
import { operatorFontVars } from '../fonts'
import { OperatorNav } from './OperatorNav'

export const dynamic = 'force-dynamic'

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  // `getOperatorWithoutVenue`, not `getOperator`: signup and sign-in are the
  // same request, so a brand-new operator holds a valid session with no venue
  // yet. `getOperator` returns null for them, which would render the shell with
  // no nav and — worse — no way to sign out of a session they demonstrably have.
  //
  // The lookup hits Postgres on every render of /signin and /signup too, and a
  // landing visitor clicking "Get Started" or "Log In" has no stake in the
  // session store yet — if the database is unreachable, those clicks must still
  // land on their forms, not on a 500. Degrade to the signed-out shell; every
  // surface that actually needs the session re-checks it and redirects itself.
  let operator = null
  try {
    operator = await getOperatorWithoutVenue()
  } catch {
    operator = null
  }

  return (
    <div className={`${operatorFontVars} surface-operator min-h-dvh`}>
      <header className="border-b border-line">
        {/* The drawer anchors to this nav (`relative`), and the shell width is
            the operator surface's own — 1152px, wide enough for the command
            center's metric row, stacking below md. */}
        <nav className="relative mx-auto flex w-full max-w-6xl items-center gap-x-5 px-6 py-4">
          <Link href="/" className="shrink-0 text-xs tracking-widest text-muted uppercase">
            {BRAND.name}
          </Link>

          <OperatorNav signedIn={Boolean(operator)} />
        </nav>
      </header>
      {children}
    </div>
  )
}
