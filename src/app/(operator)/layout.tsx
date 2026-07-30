import Link from 'next/link'
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from 'next/font/google'
import { BRAND } from '@/brand'
import { en } from '@/strings/en'
import { getOperatorWithoutVenue } from '@/lib/operator-session'
import { signOut } from './signin/actions'

export const dynamic = 'force-dynamic'

/**
 * The operator's three faces. **This is the only file in the app permitted to
 * import `next/font`** — Next preloads font files per route, so an import
 * under `(guest)` would put ~30KB of webfont on a phone whose entire
 * discretionary budget is 15KB.
 *
 * They are declared as CSS variables rather than classNames so the guest route
 * can use the same `font-mono` and `font-display` utilities and silently fall
 * back to the system stack — see the note in `globals.css`.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-sans',
  display: 'swap',
})

/** Every figure the operator reads. Tabular by default is the point. */
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
})

/** Display only, 28px and up. Four places, listed in UI-SPEC.md §4. */
const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-instrument',
  display: 'swap',
})

/**
 * Shell for every operator surface.
 */
export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  // `getOperatorWithoutVenue`, not `getOperator`: signup and sign-in are the
  // same request, so a brand-new operator holds a valid session with no venue
  // yet. `getOperator` returns null for them, which would render the shell with
  // no nav and — worse — no way to sign out of a session they demonstrably have.
  const operator = await getOperatorWithoutVenue()

  return (
    <div
      className={`${plexSans.variable} ${plexMono.variable} ${instrument.variable} surface-operator min-h-dvh`}
    >
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
