# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

**There is no code yet.** The repo contains two planning documents and nothing else — no `package.json`, no git repo, no `src/`. M0 in [TODO.md](TODO.md) is unstarted, so there are no build, lint, or test commands to run. They will be the standard Next.js/Vitest/Playwright set once M0 scaffolds the project.

The two documents are the source of truth and should be read before writing anything:

- [PLATFORM.md](PLATFORM.md) — what the platform is, architecture, data model, compliance guardrails, the never-build list.
- [TODO.md](TODO.md) — the build sequence, M0 → M6. Milestones are strictly sequential; each ends with what each of the four archetypes sees. Do not start a milestone before the one above it is verified.

A third document, *INTERLUDE — Business Foundation v1.0*, is referenced throughout by section (§) but is **not in this repo**. When a `§` reference matters and you can't resolve it, ask rather than guess.

## Before starting M0

- **Repo location is settled** — `C:\Users\prana\Code\interlude`, deliberately outside OneDrive, because `node_modules` under OneDrive sync causes file locks and slow installs. Do not move this repo back under `OneDrive\`, and do not scaffold a second copy there.
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

**Realtime is 2s polling, not websockets** — venue wifi is unreliable and serverless does not hold sockets. Countdowns and match state are driven by a **server-issued end timestamp** so client clock skew and tab-suspend cannot desync a game. Animation is local; truth is server-side.

**Nothing may depend on a vendor POS API existing.** T3 is unrun. Work through the `PosAdapter` port; `Manual` and `CsvImport` are the adapters that actually ship. Petpooja/Restroworks are interface-conforming stubs with no live calls.

## Configuration, not constants

Every number from the business doc's Appendix B — prep times, margin bands, prize depth caps, mystery-plate price, quiz length, countdown buffer, peak hours, match-liquidity floor, and all the §11 gates — is **venue configuration seeded from an estimate**, editable in `/dash`. None of it is a hardcoded constant. The measurement tests (T0/T1) have not run; when the numbers change, the code must not.

Similarly, all user-facing strings are externalised from M0 so Hindi is a translation job rather than a refactor. English first.

## Surfaces and who they are for

Four archetypes, four different design contracts. Building the wrong one into a route is a real failure mode:

| Route | For | Contract |
|---|---|---|
| `/t/[qrToken]` | Guest | Anonymous, no account, no app. <100KB JS, interactive <2s on 3G — enforced in CI from M1 |
| `/floor` | Server | Never shown a dashboard or a metric. Only: what to do, at which table, right now |
| `/pass` | Chef | One control (kitchen load) and one list (vetoes). Glanceable mid-service, wet hands |
| `/dash` | Owner | Leads with one number; everything else collapsible |

The north-star number is **attach-rate delta**, reported two ways. **ITT delta** (all tented vs. all untented) is the honest headline. **Engaged delta** (scanned vs. untented) includes guest self-selection and is only ever shown with that caveat — never as the headline.

## Never build

Including in brainstorms, including under new names: XP · levels · badges · global leaderboards · cross-venue identity · accounts-before-value · spin wheels / scratch cards / any pure-chance mechanic · incentivised or gated reviews · payment processing · discounts on hero items · licensed-property games without a licence · a native app · the W1 queue window · the shared screen (V1.5).

V1 scope is locked to three mechanics (#5, #2, #7 with #12 as fallback), two screens (voice review, server card), and one dashboard number. Anything not on PLATFORM.md §4's list is out.
