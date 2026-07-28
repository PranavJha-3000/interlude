# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

**Wave 1 is in progress.** The build sequence in [TODO.md](TODO.md) is three waves, not the old
M0–M6: wave 1 is the 48-hour ship gate that goes into a real venue, wave 2 adds measurement truth
and the mystery plate, wave 3 adds the voice review and Saturday hardening. Waves are sequential;
wave 1 ships whether or not the later ones have started.

The two documents are the source of truth and should be read before writing anything:

- [PLATFORM.md](PLATFORM.md) — what the platform is, architecture, data model, compliance guardrails, the never-build list.
- [TODO.md](TODO.md) — the three waves, each ending with what each of the four archetypes sees.

**We are shipping ahead of the business doc's validation gate (T0–T2) by owner decision.** That
makes PLATFORM.md §10 load-bearing rather than tidy: every unmeasured number is venue config, so
when the real numbers arrive we edit config, not code. Do not hardcode an estimate anywhere.

A third document, *INTERLUDE — Business Foundation v1.0*, is referenced throughout by section (§) but is **not in this repo**. When a `§` reference matters and you can't resolve it, ask rather than guess.

## Before the first `npm install`

- **Repo location is settled** — `C:\Users\prana\OneDrive\Desktop\Code\interlude`. The repo lives under OneDrive by the owner's explicit choice; this was decided with the tradeoff on the table, so do not relitigate it or propose moving it.
- **The tradeoff it accepts is real and unmitigated as of now.** OneDrive sync locks files inside `node_modules` and makes installs slow, which shows up as spurious `EPERM`/`EBUSY` errors during `npm install`, dev-server rebuilds, and Prisma client generation. Before the first `npm install`, `node_modules` must be kept out of sync — either excluded in OneDrive's settings or held on a non-synced path and junctioned in (`mklink /J node_modules C:\dev\interlude-node_modules`). If you hit inexplicable file-lock errors in this repo, check this first; it is the most likely cause and it is not a code bug.
- The product name is still a placeholder (PLATFORM.md §13). It lives in `src/brand.ts` and nowhere else — never hardcode "Interlude" into UI strings, routes, or copy.

## Planned stack

Next.js 15 App Router · TypeScript strict · Postgres + Prisma · Vercel (incl. Cron) · Resend · Vitest + Playwright.

## Architecture rules that are not negotiable

These come from PLATFORM.md §5–§7 and §12. They are the reason the product is defensible and legal; treat them as invariants, not preferences.

**`core/` is pure.** `prize-engine`, `mechanics`, and `measurement` take everything as arguments — no I/O, no database, no clock, no randomness. That purity is what makes the compliance invariants testable.

**No pure chance, anywhere.** `Math.random` and `crypto.getRandomValues` are banned by ESLint inside `core/prize-engine` and `core/mechanics`. Outcomes must be a pure function of skill input. The mystery plate is modelled as a fixed-price product the guest wins the *right to buy* — never a draw, never a wheel. This is a gambling-law line, not a design taste.

**Review capture is structurally separated from rewards.** The review module is given no prize or award state — enforced as a module boundary, not by discipline. It stores funnel counts only (shown, drafted, handed off) and never a rating, because storing sentiment would create the ability to gate on it. The prompt fires for 100% of sessions regardless of play, win, or sentiment.

**Every prize-engine decision carries a `reason` string,** and the whole pool is snapshotted per service to a `PrizePool` row. That audit trail is the product promise to the operator ("we optimise inside your fences"), so it is load-bearing, not logging.

**Arm assignment is a recorded row, never a computed guess.** `TableArmAssignment` (service, table, arm, swapAt) is the entire evidentiary basis of the business. It must be auditable and impossible to reconstruct favourably after the fact. Control tables cannot open a session — enforced and tested.

**Phone numbers are HMAC'd with a per-venue salt.** No cross-venue join is possible in V1 by construction (DPDP).

**Realtime is 2s polling, not websockets** — venue wifi is unreliable and serverless does not hold sockets. The countdown is driven by a **server-issued end timestamp** so client clock skew and tab-suspend cannot desync a game. Animation is local; truth is server-side.

**Nothing may depend on a vendor POS API existing.** T3 is unrun. Work through the `PosAdapter` port; `Manual` and `CsvImport` are the adapters that actually ship. Petpooja/Restroworks are interface-conforming stubs with no live calls.

## Configuration, not constants

Every number from the business doc's Appendix B — prep times, margin bands, prize depth caps, mystery-plate price, quiz length, countdown buffer, peak hours, and all the §11 gates — is **venue configuration seeded from an estimate**, editable in `/dash`. None of it is a hardcoded constant. The measurement tests (T0/T1) have not run and we are shipping without them; when the numbers change, the code must not.

Similarly, all user-facing strings are externalised from the first commit so Hindi is a translation job rather than a refactor. English first.

## Surfaces and who they are for

Four archetypes, four different design contracts. Building the wrong one into a route is a real failure mode:

| Route | For | Contract |
|---|---|---|
| `/t/[qrToken]` | Guest | Anonymous, no account, no app. <100KB JS, interactive <2s on 3G — checked at the wave 1 gate |
| `/floor` | Server | Never shown a dashboard or a metric. Only: what to do, at which table, right now |
| `/pass` | Chef | One control (kitchen load) and one list (vetoes). Glanceable mid-service, wet hands |
| `/dash` | Owner | Leads with one number; everything else collapsible |

The north-star number is **attach-rate delta**, reported two ways. **ITT delta** (all tented vs. all untented) is the honest headline. **Engaged delta** (scanned vs. untented) includes guest self-selection and is only ever shown with that caveat — never as the headline.

Attach-rate delta needs a POS bill export, which does not exist on night one, so the dashboard has a second **app-native tier**: add-on gross, add-on contribution, prize cost, and **net contribution ₹** — computed from confirmed `AddOnRequest`/`Award` rows against the venue's own margin config. That is the wave-1 headline and it is always labelled an app-side estimate. The two tiers are shown together and **never merged into one number**; tier 2 takes the headline the moment the first export lands. PLATFORM.md §9.

## Never build

Including in brainstorms, including under new names: XP · levels · badges · global leaderboards · cross-venue identity · accounts-before-value · spin wheels / scratch cards / any pure-chance mechanic · incentivised or gated reviews · payment processing · discounts on hero items · licensed-property games without a licence · a native app · the W1 queue window · the shared screen (V1.5).

**Multiplayer is cut from V1** — #7 table-vs-table and #12 beat-the-house are out, along with match lobbies, pairing, opponent state and the `Match` model. New mechanics are single-player. This one is a scope decision rather than a graveyard entry, so it is reversible later; it is still out of V1 and out of V1 brainstorms.

V1 scope is two mechanics (#5, #2), one screen (voice review), and one dashboard number. Anything not on PLATFORM.md §4's list is out. The server recognition card and `/admin` onboarding are deferred, not cancelled.
