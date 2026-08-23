import type { Viewport } from 'next'
import { BRAND } from '@/brand'

/**
 * Every guest page re-exports this as `viewport`, because a route-group layout
 * cannot (a `viewport` export there 404s the group on Next 16 — see
 * `(guest)/layout.tsx`). The hex is `--color-ground-clay`; a meta tag cannot
 * read a CSS variable, so this is one of the three documented raw-hex sites.
 */
export const guestViewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#efe4d4',
}

/**
 * Shared shell for every guest screen. Server-rendered, no client JS.
 *
 * The header is the entire persistent chrome: venue name, then the table
 * number in the mono (REVAMP-BRIEF.md Part 6). No nav, no logo lockup, no
 * footer. The closed screen has no table to name — `resolveScan` returns no
 * label for NO_SERVICE — so its header carries the venue name alone, which
 * keeps a control night byte-identical to a closed one by construction.
 */
export function Screen({
  children,
  venueName,
  tableLabel,
}: {
  children: React.ReactNode
  venueName?: string
  tableLabel?: string
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">
      <header className="mb-8 flex items-baseline justify-between">
        <p className="text-xs tracking-widest text-muted uppercase">{venueName ?? BRAND.name}</p>
        {tableLabel && <p className="font-mono text-xs text-muted tabular-nums">{tableLabel}</p>}
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </main>
  )
}

export function Heading({ children }: { children: React.ReactNode }) {
  return <h1 className="text-3xl leading-tight font-semibold text-balance">{children}</h1>
}

export function Body({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-lg leading-relaxed text-muted text-pretty">{children}</p>
}

/** Minimum 56px tall — this is tapped one-handed, often while holding a drink. */
export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="min-h-14 w-full rounded-xl bg-ink px-5 text-lg font-semibold text-paper active:bg-accent"
    >
      {children}
    </button>
  )
}

/** A raised panel on the clay ground — cotton, the inverse of the operator side. */
export function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-line bg-ground-cotton p-5">{children}</div>
}
