import type { Viewport } from 'next'

/**
 * The guest ground is clay, applied once for every guest route so no screen
 * can drift back to cotton (REVAMP-BRIEF.md Part 4 — the ground is the
 * audience signal). This layout deliberately imports no font: the guest route
 * pays for nothing (UI-SPEC.md §1).
 */

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  // Clay (--color-ground-clay), so the browser chrome matches the ground.
  themeColor: '#efe4d4',
}

export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return <div className="surface-guest flex min-h-dvh flex-1 flex-col">{children}</div>
}
