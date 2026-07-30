# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

**The guest loop is built; the operator front door is not.** The build sequence in [TODO.md](TODO.md)
is a linear list of phases, not the old three waves and not the older M0–M6. Phase 0 is a truth pass
recording what already works — the guest flow, `/floor`, `/pass`, tier-1 `/dash`, per-table QR and
printable tents, the prize engine, and the Playwright happy path. Phases 1–8 build what is missing:
operator identity, venue creation, the venue QR, a landing page, self-serve onboarding, menu
management, prize admin, and a venue-scoped dashboard. Everything after that is under **Later**.

**Every phase carries a "How to test" block, and that is not decoration.** A phase is done when the
commands in its block pass — not when the code looks finished. If you add work to a phase, add the
test that proves it.

These documents are the source of truth and should be read before writing anything:

- [PLATFORM.md](PLATFORM.md) — what the platform is, architecture, data model, compliance guardrails, the never-build list.
- [TODO.md](TODO.md) — the linear phase sequence, each phase with a runnable **How to test** block.
- [UI-SPEC.md](UI-SPEC.md) — the visual and copy contract. **Read before writing any UI.** Locks spacing, typography, colour, accent discipline and per-surface contracts, so screens stop being decided one `className` at a time. Note the two typographic identities: the guest and staff surfaces stay on the system font stack because of the payload budget; only `(operator)` routes may import `next/font`.

**We are shipping ahead of the business doc's validation gate (T0–T2) by owner decision.** That
makes PLATFORM.md §10 load-bearing rather than tidy: every unmeasured number is venue config, so
when the real numbers arrive we edit config, not code. Do not hardcode an estimate anywhere.

A third document, *INTERLUDE — Business Foundation v1.0*, is referenced throughout by section (§) but is **not in this repo**. When a `§` reference matters and you can't resolve it, ask rather than guess.

## Before the first `npm install`

- **Repo location is settled** — `C:\Users\prana\OneDrive\Desktop\Code\interlude`. The repo lives under OneDrive by the owner's explicit choice; this was decided with the tradeoff on the table, so do not relitigate it or propose moving it.
- **The tradeoff it accepts is real and unmitigated as of now.** OneDrive sync locks files inside `node_modules` and makes installs slow, which shows up as spurious `EPERM`/`EBUSY` errors during `npm install`, dev-server rebuilds, and Prisma client generation. Before the first `npm install`, `node_modules` must be kept out of sync — either excluded in OneDrive's settings or held on a non-synced path and junctioned in (`mklink /J node_modules C:\dev\interlude-node_modules`). If you hit inexplicable file-lock errors in this repo, check this first; it is the most likely cause and it is not a code bug.
- The product name is still a placeholder (PLATFORM.md §13). It lives in `src/brand.ts` and nowhere else — never hardcode "Interlude" into UI strings, routes, or copy.

## Tenancy

**The platform is multi-tenant and restaurants sign themselves up.** A landing page leads to an email
and a password, and an owner onboards their own venue — details, tables, menu, staff PINs, QR — without
anyone helping them. Two consequences that are easy to get wrong:

- **Every operator query takes its `venueId` from the session, never from a URL parameter or a form
  field.** Use the `requireOperator()` helper. A route that accepts a venue id from the client is a
  cross-tenant data leak, and it will not be caught by types.
- **A self-onboarded venue that tents every table has no control arm**, so ITT delta cannot be
  computed for it. Arm assignment stays mandatory and control tables still cannot open a session —
  that invariant does not bend for onboarding convenience. Letting a venue opt out of the control arm
  is a config decision, not a default.

## Planned stack

Next.js 16 App Router · TypeScript strict · Postgres + Prisma · Vercel (incl. Cron) · Resend · Vitest + Playwright.

## Architecture rules that are not negotiable

These come from PLATFORM.md §5–§7 and §12. They are the reason the product is defensible and legal; treat them as invariants, not preferences.

**`core/` is pure.** `prize-engine`, `mechanics`, and `measurement` take everything as arguments — no I/O, no database, no clock, no randomness. That purity is what makes the compliance invariants testable.

**No pure chance, anywhere.** `Math.random` and `crypto.getRandomValues` are banned by ESLint inside `core/prize-engine` and `core/mechanics`. Outcomes must be a pure function of skill input. The mystery plate is modelled as a fixed-price product the guest wins the *right to buy* — never a draw, never a wheel. This is a gambling-law line, not a design taste.

**Review capture is structurally separated from rewards.** The review module is given no prize or award state — enforced as a module boundary, not by discipline. It stores funnel counts only (shown, drafted, handed off) and never a rating, because storing sentiment would create the ability to gate on it. The prompt fires for 100% of sessions regardless of play, win, or sentiment.

**Every prize-engine decision carries a `reason` string,** and the whole pool is snapshotted per service to a `PrizePool` row. That audit trail is the product promise to the operator ("we optimise inside your fences"), so it is load-bearing, not logging.

**Arm assignment is a recorded row, never a computed guess.** `TableArmAssignment` (service, table, arm, swapAt) is the entire evidentiary basis of the business. It must be auditable and impossible to reconstruct favourably after the fact. Control tables cannot open a session — enforced and tested.

**Phone numbers are HMAC'd with a per-venue salt.** No cross-venue join is possible in V1 by construction (DPDP).

**Realtime is polling, not websockets** — venue wifi is unreliable and serverless does not hold sockets. The countdown is driven by a **server-issued end timestamp** so client clock skew and tab-suspend cannot desync a game. Animation is local; truth is server-side. Intervals are **per-surface, not a blanket 2s** (PLATFORM.md §11): 5s waiting for order-fired, none mid-round, 3s awaiting redemption, 2s on `/floor`, 10s on `/pass`, and all of it paused when the tab is hidden.

**The guest JS budget was measured and revised.** "<100KB, interactive <2s on 3G" is unreachable on the App Router: an empty page ships **181.7KB gzipped** because React's hydration runtime loads regardless of whether a route has any client component. The full guest route is **184.5KB**. The enforceable rule is now **our own code must add ≤15KB over that floor**, with a 200KB regression ceiling. Accepted for V1 with eyes open; revisit if the pilot's scan rate lands under the 15% kill line. Do not "fix" this by adding client components — the floor is the framework, and every client component you add is spending the 15KB that is actually ours.

**Nothing may depend on a vendor POS API existing.** T3 is unrun. Work through the `PosAdapter` port; `Manual` and `CsvImport` are the adapters that actually ship. Petpooja/Restroworks are interface-conforming stubs with no live calls.

## Configuration, not constants

Every number from the business doc's Appendix B — prep times, margin bands, prize depth caps, mystery-plate price, climb rungs and hand seconds, countdown buffer, peak hours, and all the §11 gates — is **venue configuration seeded from an estimate**, editable in `/dash`. None of it is a hardcoded constant. The measurement tests (T0/T1) have not run and we are shipping without them; when the numbers change, the code must not.

Similarly, all user-facing strings are externalised from the first commit so Hindi is a translation job rather than a refactor. English first.

## Surfaces and who they are for

Four archetypes, four different design contracts. Building the wrong one into a route is a real failure mode:

| Route | For | Contract |
|---|---|---|
| `/` | Owner, not yet signed up | The front door. Says what the product does in the operator's language. Zero client components |
| `/v/[venueToken]` | Guest | Venue QR. Pick your table, then hand off to `/t/[qrToken]`. A control table must fail here indistinguishably from a closed venue |
| `/t/[qrToken]` | Guest | Anonymous, no account, no app. Payload budget **revised** — see below |
| `/signin`, `/signup`, `/onboarding` | Owner | Email + password, then a resumable five-step setup ending in a printable QR |
| `/floor` | Server | Never shown a dashboard or a metric. Only: what to do, at which table, right now |
| `/pass` | Chef | One control (kitchen load) and one list (vetoes). Glanceable mid-service, wet hands |
| `/dash` | Owner | Leads with one number; everything else collapsible |
| `/dash/menu`, `/dash/prizes` | Owner | The venue's own menu and its own fences. Every field writes `VenueConfig` or `MenuItem` — nothing here becomes a constant |
| `/tents` | Owner | Printable per-table tents and the venue QR. A print stylesheet, not a generated PDF |

Auth splits cleanly and must stay split: **guest** has none, **staff** hold a venue PIN (`/floor`,
`/pass`), **owner** holds an operator session (`/`-side surfaces and everything under `/dash`). A
staff PIN must never reach a metric; an operator session must never be required to fire an order.

**The owner signs in with an email and a password, not a magic link** — sending anything needs a
verified domain the pilot does not have, so a link would go nowhere. This is a knowing weakening,
written down in SECURITY.md §7a with what it costs, and expected to revert. The magic link is
dormant, not deleted: `/signin/verify` and `src/lib/operator-auth.ts` still work and are still
tested, so restoring it is a UI change. Do not delete them.

The north-star number is **attach-rate delta**, reported two ways. **ITT delta** (all tented vs. all untented) is the honest headline. **Engaged delta** (scanned vs. untented) includes guest self-selection and is only ever shown with that caveat — never as the headline.

Attach-rate delta needs a POS bill export, which does not exist on night one, so the dashboard has a second **app-native tier**: add-on gross, add-on contribution, prize cost, and **net contribution ₹** — computed from confirmed `AddOnRequest`/`Award` rows against the venue's own margin config. That is the headline until the first bill export lands, and it is always labelled an app-side estimate. The two tiers are shown together and **never merged into one number**; tier 2 takes the headline the moment the first export lands. PLATFORM.md §9.

## Never build

Including in brainstorms, including under new names: XP · levels · badges · global leaderboards · cross-venue identity · accounts-before-value · spin wheels / scratch cards / any pure-chance mechanic · incentivised or gated reviews · payment processing · discounts on hero items · licensed-property games without a licence · a native app · the W1 queue window · the shared screen (V1.5).

**Multiplayer is cut from V1** — #7 table-vs-table and #12 beat-the-house are out, along with match lobbies, pairing, opponent state and the `Match` model. New mechanics are single-player. This one is a scope decision rather than a graveyard entry, so it is reversible later; it is still out of V1 and out of V1 brainstorms.

V1 scope is two mechanics (#5, #2), one screen (voice review), and one dashboard number. Anything not on PLATFORM.md §4's list is out. The server recognition card is deferred, not cancelled.

**Venue onboarding is no longer deferred, and it is built.** It was deferred, and both this file and
PLATFORM.md said so; that changed by owner decision when the platform went multi-tenant. It ships as
`/signup` + `/onboarding` rather than as an internal `/admin`, because the restaurant does it
themselves.

The wizard is six screens driven by `Venue.onboardingStep` and nothing else — details, tables, menu,
staff PINs, the venue QR, games. **The cursor lives on the venue row, never in a cookie or the URL**,
so setup resumes on another device and a step cannot be skipped by editing an address. `/dash`
redirects into it until the step is `DONE`. Two things about it are load-bearing rather than
incidental:

- **The menu step will not let an empty menu through.** The climb is built from the menu and prizes
  come off it, so a venue with no items cannot run a service at all.
- **Staff PINs are generated, not chosen, and shown exactly once** — on a POST, never while
  rendering, because only the hash is stored and a page that minted them during render would rotate
  a venue's PINs on a reload or a link prefetch. Onboarding, menu
management and prize admin are operator plumbing, not new guest mechanics — they do not open the
door to anything on the never-build list above.
