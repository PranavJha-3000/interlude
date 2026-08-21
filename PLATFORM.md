# Interlude — Platform Reference

Single source of truth for what the platform is and how it is built.

**Status:** Pre-validation, shipping anyway. The business doc gates code behind Tests 0–2; that gate
is lifted by explicit owner decision. We ship a staged MLP, run it across **4–6 venues on one
weekend**, and validate from live data rather than ahead of it. Consequence — and this is what makes
the decision recoverable: every unmeasured number (Appendix B, B1–B16) is **venue configuration,
never a constant.**

**Launch moved out by one week** (owner decision). The week buys menu upload — self-setup in ten
minutes rather than an hour — and the venue count that makes one weekend's numbers readable.

**The market we are taking.** Every restaurant already has a table QR. It opens a static menu and
earns nothing. We replace it with one that occupies the food wait, moves the menu, and reports the
result in rupees. The incumbent is a PDF.

---

## 1. What it is

> Short, food-native games occupy the dead time in a restaurant visit, and that attention is used
> to move the menu — higher-margin items ordered more, dying items trialled, reviews captured at
> the right moment, return visits hooked.

The games are the surface. The product is a **prize engine** that decides *which menu item, at what
depth, through which mechanic, at which moment* — configured by margin, sales velocity and live
kitchen load.

**One number, eventually:** attach-rate delta — tented tables vs. same-night control tables, read
from the merchant's own POS. **It is not the pilot's number**, because one weekend cannot produce it
at any useful confidence. What the pilot reports instead, and why, is §9a.

---

## 2. The three windows

| Window | Guest state | Duration | Merchant value | Status |
|---|---|---|---|---|
| **W1 · Queue** | Bored, flight risk | 5–30 min | Fewer walkaways; pre-orders that start the kitchen | Out of V1 scope |
| **W2 · Food wait** | Ordered, phone out, receptive | 10–25 min | **Attach rate and mix shift** — the core window | **Active (Beat the Kitchen)** |
| **W3 · Bill wait** | Fed, warm, phone out | 5–15 min | Review capture; return-visit hook; private feedback | **Active (Review, Loyalty, Feedback)** |

V1 is **W2-first**. W3 ships with the Google review hand-off, first-party private feedback, and the per-venue loyalty stamp card. W1 is out of V1 scope.

---

## 3. Actors and surfaces

| Archetype | Surface | Route | Auth |
|---|---|---|---|
| **Guest** — the person scanning the QR | Mobile web, one-handed (Clay theme) | `/v/[venueToken]` → `/t/[qrToken]` (plus `/feedback`, `/phone`, `/review`) | None. Anonymous session cookie. Phone optional, at loyalty stamp only |
| **Server / floor staff** | Phone or shared tablet, fast one-tap list (Iron theme) | `/floor/[venueSlug]` | Venue PIN → httpOnly session (`StaffUser`) |
| **Chef / kitchen lead** | Tablet mounted at the pass, glanceable, big targets (Iron theme) | `/pass` | Venue PIN, kitchen role (`StaffUser`) |
| **Owner / F&B head** | Desktop or phone (Cotton theme) | `/`, `/signin`, `/signup`, `/onboarding`, `/dash` (incl. `/menu`, `/prizes`, `/import`, `/feedback`, `/activity`, `/games`, `/settings`), `/tents` | Email + password (primary) or email magic link → httpOnly session (`OperatorUser`) |

**Onboarding is customer-facing, not internal.** The platform is multi-tenant: a restaurant reaches
the landing page, creates an account with email and password, and sets up its own venue through a
resumable 6-step wizard (`DETAILS` → `TABLES` → `MENU` → `STAFF` → `QR` → `GAMES` → `DONE`) with
nobody from our side involved. The wizard cursor lives on `Venue.onboardingStep` in the database,
never in cookies or the URL.

**Two QR codes, one flow.** The venue QR (`/v/[venueToken]`) is one code to print for the counter or
the menu; it shows a table picker and hands off to the per-table QR (`/t/[qrToken]`) that the tents
carry. The per-table token remains the entry point because arm assignment and table runs are per
table. A control table appears in the picker and fails there with copy identical to a closed venue;
if a guest can infer their arm from the wording, the experiment is contaminated.

**Design rule per archetype:**
- Guest: no accounts, no signup, no app. Clay ground (`warm`), monospaced figures, local countdown.
  Measured payload budget: App Router runtime floor ~181.7KB gzipped, application code ≤15KB,
  regression ceiling 200KB.
- Server: never shown a dashboard or a metric. Only: what to do, at which table, right now (oldest first).
- Chef: one control that matters (kitchen load: GREEN / AMBER / RED), one veto list, and an emergency
  kill switch. Glanceable mid-service with wet hands.
- Owner: leads with net contribution ₹. Everything else is secondary and collapsible. Cotton ground,
  monospaced figures, full audit and refusal logs.

---

## 4. V1 scope — one game, three bill-wait hooks, one headline number

Locked per §12. Anything not on this list is out.

| Component | What ships |
|---|---|
| **Beat the Kitchen** | **The single shipped game mechanic.** Higher-or-lower sales volume comparisons between dish pairs from the venue's own menu ("Which dish sells more here?"). Pure and deterministic. Defensible pairing rule (`pairGapRatio`, default 2.0). Ladder of rungs (default 6) with starting lives (default 2) and gamble penalty on wrong answer (default 1 rung drop). Table is the unit of play; devices share the run and streak. Countdown driven by server-issued end timestamp from order-fired time. Untimed fallback if no order fired |
| **Review at the bill** | At the bill: Google review prompt (`/t/[qrToken]/review`). Typed or spoken draft → guest approves own words → deep-links to Google Place. Unincentivised, prompted to 100% of tables regardless of play, win, or sentiment. Zero rating stored |
| **Loyalty stamp card** | Optional phone capture (`/t/[qrToken]/phone`) after play. Normalised and HMAC'd with `Venue.phoneSalt`. Nth visit rewards an item through the exact same `decidePrizePool` engine, obeying all fences |
| **Private feedback** | First-party feedback (`/t/[qrToken]/feedback`) sent to `/dash/feedback`. Words and optional rating. Grants an extra game life. Structurally separated from Google reviews |
| **Dashboard** | Net contribution ₹ on night one (Tier 1 app-native); attach-rate delta vs. control once bills are imported (Tier 2 POS-backed). Plus refusal log, activity feed, and Monday morning cron email |

**Shipped with the guest loop, not after it:** kitchen-load input (GREEN/AMBER/RED), the chef veto switch,
and the emergency kill switch (§5, §12). Pushing a dying dessert at 9pm Saturday without them makes
the chef the product's enemy by 9:15.

**Operator plumbing is scope, but it is not a mechanic.** The landing page, auth, venue onboarding,
**menu upload**, menu management, bill import, and prize admin are how a restaurant reaches the rows
above without us in the room. They add no guest-facing mechanic and open no door to anything in §12.

**Menu upload is scope, and it is the one that decides venue count.** Typing forty items by hand is
roughly an hour and is where self-serve setup is abandoned. Photo/PDF/CSV upload takes it to ten
minutes, which is the difference between a six-venue pilot weekend and a one-venue one. §6a.

**Retired from V1:** Climb (#5) and Mystery Plate (#2) are retired in favour of Beat the Kitchen.
Trivia quiz is retired. Retired rows are preserved in schema for historical migration compatibility.

**Cut from V1 by owner decision:** Multiplayer of any kind (#7 table-vs-table, #12 beat-the-house)
is out. Match lobbies, pairing, and `Match` models are absent.

**Deferred, not cancelled:** The server recognition card (requires staff tipping/recognition flow).

---

## 5. The prize engine — `core/prize-engine`

The part §16 claims a competitor cannot clone from a screenshot. One pure, deterministic function.

```ts
decidePrizePool({
  menu,                 // MenuItemInput[]: prices, food costs, margin tiers, prep burdens, hero flags
  velocity,             // VelocityInput[]: trailing units sold, days since last sale
  kitchenLoad,          // GREEN | AMBER | RED, live from the pass
  chefVetoes,           // string[] of vetoed menuItemIds
  depthCaps,            // { perItemPct, perServicePaise }
  mechanic,             // 'BEAT_THE_KITCHEN'
  outcome,              // 'WIN' | 'LOSE'
  prizeRules,           // PrizeRuleInput[]: operator's prioritized policy
  rankingWeights,       // RankingWeights: scoring weights for item eligibility
  concededSoFarPaise,   // cumulative value awarded tonight
  serviceClockMinute,   // minute of day in venue timezone
  peakStartMinute,      // venue peak start
  peakEndMinute,        // venue peak end
}): {
  entries:  { itemId, mechanic, depth, reason }[]
  excluded: { itemId, reason }[]
}
```

**Rules and Fences:**
1. **Hero protection:** Hero items (`isHero: true`) never enter the prize pool.
2. **Chef vetoes:** Any item on the active veto list is strictly excluded with an audit reason.
3. **Kitchen load:** When load is RED, items requiring kitchen work (`requiresKitchenWork: true`) are excluded.
4. **Depth caps:** Both `depthCapPerItemPct` (max % off) and `depthCapPerServicePaise` (total service budget)
   are enforced. `concededSoFarPaise` depletes dynamically across awards during the service.
5. **Prize rules:** Operators define award kind (`FREE`, `PERCENT_OFF`, `FIXED_PRICE`) and outcome
   mapping via prioritized `PrizeRule` rows in `/dash/prizes`. Unmatched items are excluded.

**Every decision carries a `reason` string**, and the whole output is snapshotted per service to a
`PrizePool` row. That audit trail is what turns "you do — margin tags, veto list, prize depth caps;
we optimise inside your fences" (§14.3) into a claim the operator can check.

No I/O, no database, no clock, no AI inside the engine — everything is an argument. That is what makes it
testable against the invariants in §7.

---

## 6. POS — port and adapters (`lib/pos`)

T3 is unrun; nothing may depend on a vendor API existing.

```ts
interface PosAdapter {
  getMenu(venueId: string): Promise<MenuItem[]>
  getItemVelocity(venueId: string, windowDays: number): Promise<Velocity[]>
  getOrderFiredAt(tableId: string): Promise<Date | null>
  getClosedTickets(serviceId: string): Promise<Ticket[]>
}
```

| Adapter | Role |
|---|---|
| **Manual** | Staff taps "order fired" on `/floor` with party size and courses; countdown runs off configured prep times. Zero vendor cooperation required. Graceful fallback |
| **CsvImport** | Operator uploads end-of-day bill export on `/dash/import`. Idempotent writes, unjoinable tables mapped via `PosTableMap`, historical baseline support |
| **Mock** | Deterministic fixtures for dev, tests, and operator demos |
| **Petpooja / Restroworks** | Interface-conforming stubs. No live calls until commercial agreements are executed |

---

## 6a. AI — port, adapters, and the line it may not cross

**The rule: AI reads and drafts; a person confirms; it never decides.**

Lives in `src/lib/ai/` behind an adapter with an Anthropic Claude implementation (`ClaudeAiAdapter`)
and a deterministic `MockAiAdapter` for tests/dev (no API key required). **Import-banned from `core/`**
by ESLint rules and architectural invariants.

```ts
interface AiAdapter {
  extractMenu(file: Upload): Promise<MenuDraft>
  narrateReport(metrics: WeeklyMetrics): Promise<string>
  draftReview(spoken: string): Promise<string>
  describeItem(item: MenuItem): Promise<string>
}
```

| Use | Cadence | Marginal cost | Confirmed by |
|---|---|---|---|
| **Menu extraction** — photo or PDF → draft grid | Once per venue | A few rupees | Operator, on `/onboarding` or `/dash/menu` before writing `MenuItem` rows |
| **Weekly report narration** — computed metrics → 3 sentences | Weekly per venue | Under ₹1 | Automated; narrates pre-computed numbers, does not calculate |
| **Review drafting** — guest's spoken/typed words tidied | Per review | Under ₹1 | Guest approves before hand-off |
| **Item descriptions** — cards and tents | Once per item | Paise | Operator |

**Banned outright:**
- Choosing a prize, a pair, or a game outcome (gambling law invariant).
- Writing a food cost (operator enters category food cost %; model hallucination would corrupt contribution figures).
- Reading, inferring, or filtering review sentiment (prevents review gating).
- Any blocking call on the guest's critical path.

CSV menu imports bypass AI entirely and parse deterministically.

---

## 7. Compliance guardrails — enforced in code, not intention

§5.3 and §17.1 treat these as existential. Each is a test or a lint rule.

| Rule | Enforcement |
|---|---|
| **No pure chance** (§3.3) | `Math.random` and `crypto.getRandomValues` banned by ESLint inside `core/prize-engine`, `core/mechanics`, and `core/game`. Outcomes are pure functions of skill input and deterministic seeded pairing. Mystery plate / gambling elements strictly barred |
| **AI decides nothing** (§6a) | AI module import-banned from `core/`. Menu extraction writes draft rows (`MenuImportDraft`) requiring explicit operator confirmation. CSV path never touches a model |
| **Review capture separated from rewards** (§5.3) | `ReviewPrompt` stores funnel timestamps only (`shownAt`, `openedAt`, `draftedAt`, `handedOffAt`). Zero rating column, zero prize/award access (enforced via ESLint boundary and `boundary.test.ts`). Prompt fires for 100% of tables regardless of play, win, or sentiment |
| **Venue fences respected** | Property tests assert no hero item, no chef-vetoed item, no kitchen-work item while load is RED, and strict adherence to item & service depth caps |
| **Control-arm integrity** | Control tables cannot open a session or receive an offer; fail copy is identical to a closed venue |
| **DPDP siloing** (§5.3) | Phone stored as HMAC with a **per-venue salt** (`Venue.phoneSalt`). No cross-venue join possible. Expiry cron sweep. Erasure endpoint on guest surface. No operator phone search box |
| **Consent** | Purpose-limited consent at first scan before recording any device session or event |
| **Tenant isolation** | Every operator query scopes by session `venueId` via `requireOperator()`. Staff PINs are venue-scoped (`/floor/[venueSlug]`). Cross-tenant access fails with 404 |

---

## 8. Data model

Key Prisma models (`prisma/schema.prisma`):

- **Tenancy & Auth:** `Venue`, `VenueConfig`, `VenueGame`, `Table`, `StaffUser`, `OperatorUser`, `OperatorLoginAttempt`, `MagicLinkToken`.
- **Services & Assignment:** `Service`, `ServiceArmAssignment` (append-only service-level arm audit log), `TableArmAssignment` (per-table arm tracking).
- **Play & Funnel:** `TableRun` (table unit of play, streak, rung, lives), `DeviceSession` (individual phones), `Event` (append-only funnel event log: `SESSION_OPEN`, `CONSENT_GIVEN`, `RUN_START`, `PAIR_SHOWN`, `ANSWER`, `RUNG_REACHED`, `GAMBLE_TAKEN`, `RUN_END`, `LIFE_EARNED`, etc.).
- **Menu & Kitchen:** `MenuItem` (prices, food cost, margin tier, prep burden, hero flag, trailing sales, chef rank), `PrizeRule`, `ChefVeto`, `KitchenLoad`, `PrizePool` (service snapshot).
- **Awards & Orders:** `Award` (kind, percentOff, fixedPricePaise, ruleId, valuePaise, foodCostPaise, reason, origin [GAME | LOYALTY], code, status), `AddOnRequest` (requested items, ack status), `OrderFire` (firedAt, estReadyAt, courses, partySize).
- **Measurement & Feedback:** `Ticket` (imported POS bills), `PosTableMap` (POS table aliases), `HistoricalService` (pre-launch baseline nights), `ReviewPrompt` (funnel timestamps only), `VenueFeedback` (first-party feedback & optional rating), `GuestIdentity` (phoneHmac, visitCount), `GuestVisit` (per-service stamp ledger), `MenuImportDraft` (unconfirmed upload drafts).
- **Retired / Migration compatibility:** `Play`, `QuizPack`, `QuizQuestion`.

**Core Structural Principles:**
- All monetary values stored as integers in **paise** (`Int`), never floats.
- **Unit of Play is the Table** (`TableRun`), not individual phones.
- **Unit of Assignment is the Service** (`ServiceArmAssignment`), with counterbalanced LIVE vs CONTROL nights.
- `ReviewPrompt` has **no rating column**, guaranteed by schema test.

---

## 9a. What a small weekend can prove — the MLP's measurement design

The MLP has to make an owner want to buy after **two nights**. That constraint is statistical before
it is anything else.

| Kind | Examples | What one pooled weekend yields |
|---|---|---|
| **Counts** — a census, not a sample | Confirmed add-ons, contribution ₹, prize cost ₹, net ₹ | **Exact.** Every row is a real sale a server confirmed. No inference, no interval |
| **Rates** — binomial, modest N | Scan rate, completion rate, add-on conversion | **Reportable.** ~200 tented tables pooled gives roughly ±6pp at 95% CI |
| **Deltas** — two-proportion, large N | Attach-rate delta, ticket delta | **Not from one weekend.** Detecting 5pp lift on ~20% base needs ~1,000 tables/arm. Only a huge effect clears noise |

**The MLP proves three things and claims nothing else:**
1. **Guests play** — scan and completion rates with honest confidence intervals.
2. **It sells food** — tier-1 ledger counted in rupees, not estimated.
3. **The kitchen keeps control** — vetoes exercised, load flipped, kill switch available, zero forced items.

The attach-rate delta is still computed and displayed, **carrying its confidence interval and the explicit label "not yet conclusive" until that interval excludes zero.**

**Pooling across 4–6 venues:**
`scripts/pilot-report.mts` computes pooled counts and rates across pilot venues (via `--venues=a,b`) without crossing tenant boundaries in the web UI.

---

## 9. Metrics and gates

**North star: attach-rate delta** (percentage points difference between tented and control tables from merchant POS).

| Reported as | Compares | Use |
|---|---|---|
| **ITT delta** | All tented tables vs. all untented tables | The honest number. Price against this. Show this to a buyer |
| **Engaged delta** | Scanned tables vs. untented tables | Shown with explicit self-selection caveat. Never the headline |

**Two-Tier Dashboard Display:**
- **Tier 1 (App-native):** Confirmed `AddOnRequest` and `Award` rows × venue margin config → Add-on gross ₹, add-on contribution ₹, prize cost ₹, and **net contribution ₹** as headline. Live from night one. Labelled app-side estimate.
- **Tier 2 (POS-backed):** CSV bill export → ITT delta, engaged delta, ticket delta. Takes over headline once bill export is imported.

| Metric | Definition | Pilot Gate |
|---|---|---|
| Attach-rate delta | pp difference, same service | ≥5pp to proceed |
| Ticket delta | % avg-ticket uplift | kill <4% · proceed ≥6% |
| Wait-window scan rate | scans ÷ tented waiting tables | kill <15% · good ≥25% |
| Completion rate | finished ÷ started runs | ≥60% |
| Add-on conversion | add-ons ÷ scanning tables | measure; no gate yet |
| Review velocity × | reviews/week during ÷ before | ≥2× |
| Plays per returning guest | trajectory across visits | content-decay warning |

Gates are configurable per venue in `VenueConfig`.

---

## 10. Configuration, not constants

Every operational parameter is seeded from initial estimates and editable per venue in `VenueConfig`:
- Prep times by category (`prepMinutesByCategory`), default prep minutes (`defaultPrepMinutes`), countdown buffer (`countdownBufferSec`).
- Ladder rungs (`ladderRungs`), starting lives (`startingLives`), gamble penalty (`gamblePenaltyRungs`), life-earning flags (`lifeForAddOn`, `lifeForPhone`, `lifeForFeedback`), untimed fallback threshold (`untimedAfterSec`), zero-kitchen fallback item (`fallbackMenuItemId`).
- Pairing gap ratio (`pairGapRatio`), velocity window days (`velocityWindowDays`), ranking weights (`rankingWeights`).
- Depth caps (`depthCapPerItemPct`, `depthCapPerServicePaise`), peak hours (`peakStartMinute`, `peakEndMinute`).
- Loyalty configuration (`loyaltyEnabled`, `loyaltyVisitsRequired`, `loyaltyRewardMaxValuePaise`, `loyaltyIdentityExpiryDays`).
- Baseline review velocity (`reviewsPerWeekBaseline`).

When real data arrives from pilot services, configuration changes — code does not.

---

## 11. Architecture & layout

```
src/
  app/
    page.tsx                    # Landing page (Cotton theme, zero client components)
    (guest)/
      v/[venueToken]/page.tsx   # Venue QR: table picker → hands off to table token
      t/[qrToken]/
        page.tsx                # Guest mobile web: consent, table run, Beat the Kitchen, claim
        Game.tsx                # Single-player higher/lower ladder interface
        feedback/page.tsx       # First-party private feedback
        phone/page.tsx          # Optional loyalty phone stamp
        review/page.tsx         # Google review drafting & deep link
    (staff)/
      floor/[venueSlug]/page.tsx # Server: fire order (party size + courses), add-ons, redemptions
    (kitchen)/
      pass/page.tsx             # Chef: kitchen load (GREEN/AMBER/RED), veto list, kill switch
    (operator)/
      signin/page.tsx           # Owner sign-in (password & magic link doors)
      signup/page.tsx           # Owner registration
      onboarding/page.tsx       # 6-step setup: details, tables, menu, staff PINs, QR, games
      dash/
        page.tsx                # Owner dashboard: net contribution ₹, tiers, refusal log
        menu/page.tsx           # Menu items, margin tiers, prep burden, hero flag, upload
        prizes/page.tsx         # Depth caps, prize rules, prep minutes, gate thresholds
        import/page.tsx         # POS CSV bill export import & table mapping
        feedback/page.tsx       # Private guest feedback & ratings
        activity/page.tsx       # Live event stream
        games/page.tsx          # Mechanic enablement toggles
        settings/page.tsx       # Google Place ID, review baseline
      tents/page.tsx            # Printable table tents & venue QR (print stylesheet)
    api/
      cron/weekly-report/       # Monday morning report cron endpoint
  core/                         # Pure: no I/O, no database, no clock, no randomness, no AI
    game/                       # Beat the Kitchen: pairing.ts, run.ts
    prize-engine/               # decide-prize-pool.ts, default-rules.ts, loyalty.ts, types.ts
    measurement/                # arm-assignment.ts, metrics.ts, bill-import.ts, pilot-report.ts
    mechanics/                  # prep-estimate.ts, phone.ts, hash.ts, redemption-code.ts
    review/                     # prompt.ts, link.ts
  lib/                          # I/O, database, external integrations
    ai/                         # Claude adapter, mock adapter, menu parser
    pos/                        # Manual adapter, CSV import, mock adapter
    deploy-env.ts               # Boot-time & build-time environment verification
    operator-auth.ts            # Magic link operator auth
    operator-password-auth.ts   # Scrypt password auth with IP rate limiting
    db.ts                       # Prisma client with server-only protection
    phone-identity.ts           # Per-venue salted phone hashing
    prize-award.ts              # Award minting, claiming, and budget tracking
  brand.ts                      # Product name placeholder isolated here
  strings/                      # Externalised UI copy (en.ts)
scripts/
  check-env.mts                 # Build gate running deploy-env validation
  pilot-report.mts              # Cross-venue pooled reporting CLI (--venues)
  ladder-depth.mts              # Ladder depth & exploit simulation tool
```

**Realtime Polling Intervals:**
- Guest (waiting for order-fired / run ready): 5s.
- Guest (mid-round): None (local countdown runs from server timestamp).
- Guest (awaiting award redemption): 3s.
- Floor (`/floor/[venueSlug]`): 2s.
- Pass (`/pass`): 10s.
- Operator dashboard & forms: None (on-demand).
- All polling pauses automatically when the browser tab is hidden.

**Stack:** Next.js 16 App Router · TypeScript strict · PostgreSQL + Prisma 7 · Tailwind CSS 4 · Resend · Anthropic Claude SDK · Vitest + Playwright.

---

## 12. Never built

Permanently banned across all specs, brainstorms, and naming variations:

XP · levels · badges · global leaderboards · cross-venue identity · accounts-before-value ·
spin wheels / scratch cards / any pure-chance mechanic · incentivised or gated reviews ·
payment processing · discounts on hero items · licensed-property games without a licence ·
a native mobile app · multiplayer of any kind (table-vs-table, beat-the-house, lobbies).

---

## 13. Settled decisions & runtime guarantees

| Decision | Status | Rationale / Evidence |
|---|---|---|
| Validation gate (T0–T2) | **Settled: lifted.** | Staged MLP validates from live pilot data; all unmeasured values are `VenueConfig` rows |
| Pilot structure | **Settled: 4–6 venues, one weekend.** | Single venue cannot yield statistical rate/delta significance; pooled script evaluates pilot |
| Shipped mechanic | **Settled: Beat the Kitchen.** | Single-player higher-or-lower sales volume comparisons on venue's own menu; climb and mystery plate retired |
| Operator auth | **Settled: Email + Password (primary), Magic link (secondary).** | Passwords avoid unverified email domain delivery failures during launch; scrypt hashing + IP throttling |
| AI integration | **Settled: Reads & drafts, never decides.** | `lib/ai/` port with Claude and Mock adapters; import-banned from `core/`; photo/PDF menu extraction, report narration, review drafting |
| Food cost source | **Settled: Operator category %, never AI.** | Food cost derived from operator category estimate; AI extraction strictly forbidden |
| Unit of play | **Settled: TableRun.** | Table is the unit; multiple device sessions share run and inherit streak |
| Unit of assignment | **Settled: Service.** | Service-level counterbalanced LIVE vs CONTROL nights prevent table-to-table cross-contamination |
| Review integrity | **Settled: 100% prompt, no rating stored.** | `ReviewPrompt` stores funnel timestamps only; no sentiment gating; first-party feedback separate |
| Phone privacy | **Settled: Per-venue salted HMAC.** | `Venue.phoneSalt` prevents cross-venue joins (DPDP); guest-only erasure; annual expiry sweep |
| Environment verification | **Settled: Build-time & boot-time check.** | `scripts/check-env.mts` and `src/lib/deploy-env.ts` validate all required production variables before deployment |
| Repo location | **Settled: OneDrive path with sync exclusion.** | `C:\Users\prana\OneDrive\Desktop\Code\interlude`; `node_modules` must be un-synced/junctioned |
