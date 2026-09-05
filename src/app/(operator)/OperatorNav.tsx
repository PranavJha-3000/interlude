'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { en } from '@/strings/en'
import { signOut } from './signin/actions'

/**
 * The operator nav — `INTERLUDE | Tonight | Manage | Activity | Sign out`.
 *
 * The flat nine-link strip outlived its usefulness: an operator's jobs split
 * into doing tonight, running the venue (Manage) and reading it (Activity), so
 * the groups carry that split. The groups are hand-rolled disclosure buttons —
 * no component library and no icon library exist in this repo, and the whole
 * behaviour is open, close, close-on-outside-click and close-on-Escape.
 *
 * It must NOT appear on the pre-auth pages. `/signin` and `/signup` render
 * inside this layout, and a visitor landing on them (possibly still holding a
 * session cookie) has no business being shown the dashboard tabs yet. But a
 * signed-in operator who ends up back on those pages still needs the one
 * escape hatch the signed-in shell offers: sign out (see the rationale in
 * `(operator)/layout.tsx`). So on those two paths we render the sign-out form
 * alone; everywhere else the full nav renders when signed in.
 */

const MANAGE_LINKS = [
  { href: '/dash/menu', label: en.dash.menuNav },
  { href: '/dash/games', label: en.dash.gamesNav },
  { href: '/dash/prizes', label: en.dash.prizesNav },
  { href: '/dash/import', label: en.dash.importNav },
  { href: '/dash/feedback', label: en.dash.feedbackNav },
  { href: '/dash/settings', label: en.dash.settingsNav },
  { href: '/tents', label: en.dash.tents },
]

const ACTIVITY_LINK = { href: '/dash/activity', label: en.dash.activity.heading }

type GroupId = 'manage' | 'activity'

export function OperatorNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname()
  const isAuthPage = pathname === '/signin' || pathname === '/signup'
  const [openGroup, setOpenGroup] = useState<GroupId | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // A client-side navigation through a grouped link closes its panel through
  // the link's own onClick — no effect needed to watch the pathname.
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenGroup(null)
        setDrawerOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenGroup(null)
        setDrawerOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

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

  // `/dash` is Tonight exactly — not any of its sub-pages, which announce
  // themselves through the group they belong to. Accent is reserved elsewhere
  // (UI-SPEC §5), so "here" is ink plus an underline, never a colour.
  const tonightActive = pathname === '/dash'
  const manageActive = MANAGE_LINKS.some((l) => pathname.startsWith(l.href))
  const activityActive = pathname.startsWith('/dash/activity')
  const isHere = (href: string) => pathname === href

  const stripLink = (active: boolean) =>
    `transition-state text-sm ${active ? 'text-ink underline underline-offset-4' : 'text-muted hover:text-ink'}`
  const drawerLink = (active: boolean) =>
    `flex min-h-11 items-center text-base ${active ? 'font-medium text-ink' : 'text-ink-warm'}`

  return (
    <div ref={rootRef} className="contents">
      {/* ── Desktop strip ─────────────────────────────────────────────── */}
      <div className="hidden items-center gap-x-5 md:flex">
        <Link
          href="/dash"
          className={stripLink(tonightActive)}
          aria-current={tonightActive ? 'page' : undefined}
        >
          {en.dash.heading}
        </Link>

        <NavGroup
          label={en.nav.manage}
          active={manageActive}
          open={openGroup === 'manage'}
          onToggle={() => setOpenGroup(openGroup === 'manage' ? null : 'manage')}
          links={MANAGE_LINKS}
          isHere={isHere}
          linkClass={stripLink}
          onNavigate={() => setOpenGroup(null)}
        />

        <NavGroup
          label={en.nav.activity}
          active={activityActive}
          open={openGroup === 'activity'}
          onToggle={() => setOpenGroup(openGroup === 'activity' ? null : 'activity')}
          links={[ACTIVITY_LINK]}
          isHere={isHere}
          linkClass={stripLink}
          onNavigate={() => setOpenGroup(null)}
        />
      </div>

      <form action={signOut} className="ml-auto hidden md:block">
        <button type="submit" className="text-sm text-muted transition-state hover:text-ink">
          {en.signin.signOut}
        </button>
      </form>

      {/* ── Mobile trigger + drawer ───────────────────────────────────── */}
      <button
        type="button"
        aria-expanded={drawerOpen}
        aria-controls="operator-drawer"
        onClick={() => setDrawerOpen(!drawerOpen)}
        className="ml-auto flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line text-ink md:hidden"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          {drawerOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
        <span className="sr-only">{drawerOpen ? en.nav.closeMenu : en.nav.openMenu}</span>
      </button>

      {drawerOpen && (
        <div
          id="operator-drawer"
          className="absolute inset-x-0 top-full z-20 border-b border-line bg-paper px-6 pb-6 pt-2 md:hidden"
        >
          <Link
            href="/dash"
            onClick={() => setDrawerOpen(false)}
            className={drawerLink(tonightActive)}
            aria-current={tonightActive ? 'page' : undefined}
          >
            {en.dash.heading}
          </Link>

          <p className="mt-5 text-xs tracking-widest text-muted uppercase">{en.nav.manage}</p>
          <ul className="mt-1">
            {MANAGE_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setDrawerOpen(false)}
                  className={drawerLink(isHere(l.href))}
                  aria-current={isHere(l.href) ? 'page' : undefined}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-5 text-xs tracking-widest text-muted uppercase">{en.nav.activity}</p>
          <ul className="mt-1">
            <li key={ACTIVITY_LINK.href}>
              <Link
                href={ACTIVITY_LINK.href}
                onClick={() => setDrawerOpen(false)}
                className={drawerLink(isHere(ACTIVITY_LINK.href))}
                aria-current={isHere(ACTIVITY_LINK.href) ? 'page' : undefined}
              >
                {ACTIVITY_LINK.label}
              </Link>
            </li>
          </ul>

          <form action={signOut} className="mt-5 border-t border-line pt-3">
            <button type="submit" className="flex min-h-11 items-center text-base text-muted">
              {en.signin.signOut}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

/**
 * One desktop disclosure group: a trigger and, when open, a panel of links.
 * The panel is bordered paper over the page — a shadow would be the first one
 * in the product, and a restrained border already separates it (UI-SPEC §6).
 */
function NavGroup({
  label,
  active,
  open,
  onToggle,
  onNavigate,
  links,
  isHere,
  linkClass,
}: {
  label: string
  active: boolean
  open: boolean
  onToggle: () => void
  /** Runs when a panel link is followed, so the panel closes under client-side navigation. */
  onNavigate: () => void
  links: ReadonlyArray<{ href: string; label: string }>
  isHere: (href: string) => boolean
  linkClass: (active: boolean) => string
}) {
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={onToggle}
        className={`flex min-h-11 items-center gap-1.5 ${linkClass(active)}`}
      >
        {label}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={`transition-state h-3.5 w-3.5 ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-xl border border-line bg-paper py-2">
          <ul>
            {links.map((l) => {
              const here = isHere(l.href)
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={onNavigate}
                    aria-current={here ? 'page' : undefined}
                    className={`block px-4 py-2 text-sm transition-state ${
                      here
                        ? 'text-ink underline underline-offset-4'
                        : 'text-ink-warm hover:text-ink'
                    }`}
                  >
                    {l.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
