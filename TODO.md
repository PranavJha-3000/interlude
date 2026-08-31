# TODO

## NOW
- [ ] **Deploy to Vercel (Item 8)**: Configure Vercel project, set production env vars (`DATABASE_URL` pooled, `DIRECT_URL` unpooled, `SESSION_SECRET`, `NEXT_PUBLIC_BASE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`, `GEMINI_API_KEY`), build command `npm run check:env && prisma generate && prisma migrate deploy && next build`, region `sin1`. See [docs/DEPLOY.md](docs/DEPLOY.md).
- [ ] **Validate POS bill import with live export**: Run `/dash/import` against a real pilot-venue POS export file (not fixture data) and verify `PosTableMap` resolution.

## NEXT
- [ ] **Verify production deployment**: Open `/t/[qrToken]` on a physical mobile device; print tent sheets from `/tents` and test scanning off paper.
- [ ] **Verify Monday cron**: Trigger `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/weekly-report` before Monday to confirm email delivery.
- [ ] **Run pilot reporting**: Run `npm run tsx scripts/pilot-report.mts -- --venues=slug_a,slug_b` after pilot service to inspect pooled counts, rates, and deltas.

## DONE
- **Game mechanics**: Three V1 games on one shared spine (selector → game → result → claim through `decideAndWriteAward`). Beat the Kitchen (`core/game/pairing.ts`, `core/game/run.ts`) stays the canonical table-level `TableRun` game; Secret Recipe (`core/games/secret-recipe.ts`) discovers menu combinations configured per venue in `VenueGame.data`; Mystery Customer (`core/games/mystery-customer.ts`) builds a meal against a deterministic budget/craving brief drawn from menu prices and categories. No chance, no AI decisions, no game-specific reward path.
- **Prize engine**: Pure deterministic `decidePrizePool` (`core/prize-engine/`) with operator `PrizeRule`s, hero/veto/RED/budget depth cap fences, and audit reasons.
- **Operator surfaces**: `/signup`, 6-step `/onboarding`, `/dash` (net contribution ₹ headline, refusal log, menu management, prize rules, CSV bill import, private feedback, event activity, game toggles, settings), and printable `/tents`.
- **Menu upload**: Photo/PDF extraction via Gemini AI adapter (`src/lib/ai/`) into draft grid with operator confirmation; deterministic CSV parsing.
- **Guest surfaces**: `/v/[venueToken]` (table picker) → `/t/[qrToken]` (consent, table run, play, extra life, prize claim), `/t/[qrToken]/review` (Google hand-off), `/t/[qrToken]/phone` (loyalty stamp), `/t/[qrToken]/feedback` (private feedback).
- **Staff & Pass surfaces**: `/floor/[venueSlug]` (order fire with party size + courses, add-on tickets, code redemptions), `/pass` (kitchen load, vetoes, emergency kill switch).
- **Measurement & Tenancy**: Service-level arm assignment (`ServiceArmAssignment`), append-only event log (`Event`), multi-tenant session isolation (`requireOperator()`), salted per-venue phone hashing (`GuestIdentity`), pooled CLI (`scripts/pilot-report.mts`).
- **Deploy & Env verification**: `src/lib/deploy-env.ts` with `scripts/check-env.mts` build gate and `src/instrumentation.ts` boot check.
- **Test suite**: 577 unit tests (44 files) and 18 Playwright E2E specs passing; production `next build` green.

## RULES
- `core/` must remain pure: no I/O, no DB, no clock, no AI, no network.
- No pure chance: `Math.random` and `crypto.getRandomValues` are banned in `core/`.
- AI reads and drafts only: never decide game outcomes, prize selection, food costs, or review sentiment.
- No hardcoded constants: prep times, margins, caps, prices, and gates live in `VenueConfig`.
- Every operator query scopes by session `venueId` via `requireOperator()`, never client-supplied params.
- Reviews are never gated on sentiment, and no rating is ever stored in `ReviewPrompt`.
- A control table must fail identically to a closed venue to prevent arm inference.
- Unit of play is `TableRun` (table-level); unit of assignment is `ServiceArmAssignment` (service-level).
- Phone numbers are stored only as normalized, per-venue salted HMACs in `GuestIdentity`.
- Monetary values are stored as integer paise (`Int`), never floats.

## LATER
- Voice input path for review drafting (typed review works).
- Server recognition card (*"Table 12, 3rd visit, ordered fried chicken twice"*).
- Offline tolerance across guest flow.
- Single-venue peak load testing.
- Staff briefing pack and Saturday night paper fallback runbook.
- Hindi localization (strings externalized in `src/strings/en.ts`).
- IBM Plex Mono styling across guest/staff numerical displays.
- `Venue.phoneSalt` rotation workflow.
- International phone normalization support.

## NEVER
- XP · levels · badges · leaderboards · cross-venue identity · accounts before value.
- Spin wheels · scratch cards · pure-chance mechanics · mystery plates.
- Incentivized or gated reviews.
- Payment processing.
- Discounts on hero items.
- Unlicensed licensed-property games.
- Native mobile app.
- Multiplayer of any kind (table-vs-table, beat-the-house, match lobbies).
- Queue-window game (W1) · shared screen.
