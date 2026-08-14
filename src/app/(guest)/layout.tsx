/**
 * The guest ground is clay, applied once for every guest route so no screen
 * can drift back to cotton (REVAMP-BRIEF.md Part 4 — the ground is the
 * audience signal). This layout deliberately imports no font: the guest route
 * pays for nothing (UI-SPEC.md §1).
 *
 * Do not export `viewport` (or `metadata`) from this file. On Next 16.2.12 a
 * `viewport` export from a route-group layout 404s every route in the group,
 * silently — no build error, no runtime trace. Verified by bisection on
 * 2026-08-14. The clay themeColor override lives on the guest pages instead.
 */
export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return <div className="surface-guest flex min-h-dvh flex-1 flex-col">{children}</div>
}
