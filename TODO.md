# Interlude — Build Sequence

**A linear sequence of shippable steps.** Every phase ends in something you can open, click, or run
a command against. Every phase carries a **How to test** block with the actual commands and the
actual click-path — "done" is a command that passes, not a judgement call.

This replaces the earlier three-wave plan, which was written before the code existed and had gone
stale: several of its unchecked boxes were already built. Phase 0 below is the correction pass.

The rule that survives every restructure, unchanged and absolute: **every unmeasured number is venue
configuration, never a constant.** When the real numbers arrive, we edit config.

## The four archetypes

| | Who | Where |
|---|---|---|
| 🍽️ **GUEST** | The person who scans the QR at the table | Their own phone, mobile web, no account |
| 🧑‍🍳 **SERVER** | Floor staff | Their phone or a shared tablet, `/floor` |
| 👨‍🍳 **CHEF** | Kitchen lead, at the pass | Mounted tablet, `/pass` |
| 💼 **OWNER** | Owner or F&B head — whoever owns the menu P&L | Desktop or phone, `/dash` |

## Decisions this sequence is built on

| | |
|---|---|
| **Tenancy** | Real multi-tenant signup. A restaurant signs itself up from the landing page. |
| **Operator auth** | Email magic link via Resend. In dev the link is written to the console, so onboarding is testable with no API key. |
| **Venue QR** | `/v/[venueToken]` → the guest taps their table number → the existing `/t/[qrToken]` flow. Per-table QR already works and stays; the venue QR sits in front of it. |
| **Order** | Backend first (phases 1–3), then the frontend surfaces (phases 4–8). |

### Two things this changed elsewhere — recorded, not hidden

1. **Venue onboarding was deferred, and is not any more.** CLAUDE.md and PLATFORM.md both held it
   back as an internal `/admin` surface; the multi-tenant decision promoted it to a customer-facing
   flow at `/signin` + `/onboarding`. Both documents have been updated to match.
2. **Multi-tenancy strains the measurement story.** A venue that onboards itself and tents every
   table has no control arm, so ITT delta is uncomputable for it. Arm assignment stays mandatory and
   control tables stay unable to open a session — that invariant is not negotiable. Letting a venue
   opt out of the control arm is a config decision for the measurement phase, not something to
   quietly drop here.

---

## Phase 0 — Truth pass · what is already built

**Goal:** the file tells the truth. No new code; verify and correct.

Genuinely shipped and verifiable today:

- [x] `node_modules` junctioned out of OneDrive sync
- [x] Next.js 16 App Router · TypeScript strict · ESLint · Prettier · Tailwind
- [x] Prisma schema + Postgres (Neon) + one migration (`20260728194825_init`)
- [x] `src/brand.ts` — the product name lives here and nowhere else
- [x] All user-facing strings externalised in `src/strings/en.ts`
- [x] Seed: one Delhi venue, ~40 items with margin tier / price / food cost / prep burden, 30 tables
- [x] Guest session model + DPDP consent gate; nothing written before the tap
- [x] Quiz engine — pure, no I/O (`src/core/mechanics/kitchen-round.ts`)
- [x] Countdown on a **server-issued end timestamp**
- [x] Prize engine v1 — margin tier + chef veto + depth cap, every decision carries a `reason`
- [x] Outcome screens; one-tap add-on relayed to `/floor`
- [x] **Per-table QR + printable tents** — `/tents`, server-rendered inline SVG, print stylesheet
- [x] **Chef console** — GREEN/AMBER/RED load switch, per-item veto toggles, tonight's pool with reasons
- [x] **Staff redemption** — `confirmAward` on `/floor`, no OTP on the critical path
- [x] **Dashboard tier 1** — net contribution ₹ as the headline, captioned an app-side estimate
- [x] Arm assignment recorded per service, mid-service swap, auditable; control tables cannot play
- [x] Timestamped `Play` / `Award` / `AddOnRequest` events
- [x] ESLint no-RNG rule inside `core/prize-engine` and `core/mechanics`
- [x] Unit tests on the prize engine, quiz scoring, arm assignment, contribution
- [x] Playwright happy path: scan → consent → play → win → add-on → confirm, mobile viewport
- [x] Performance budget **measured and revised** — an empty App Router page ships 181.7KB gzipped;
      the guest route ships 184.5KB, so our code is ~3KB. The rule is now **our code adds ≤15KB over
      the framework floor**, 200KB regression ceiling

Still genuinely open:

- [ ] **Manual POS adapter — the port, and the UI.** `fireOrder` already computes `estReadyAt` from
      `VenueConfig.prepMinutesByCategory`, so the mechanism works. What is missing is the
      `PosAdapter` interface it should sit behind, and any way to edit prep minutes without a SQL
      client. The UI lands in phase 7
- [ ] **Vercel deploy** — including `SESSION_SECRET`, `DATABASE_URL`, `NEXT_PUBLIC_BASE_URL`

**How to test**

```bash
npm run typecheck && npm run lint && npm test    # all clean
npm run db:seed                                  # idempotent, one venue + 30 tables
npm run test:e2e                                 # happy path + control-table invariant, green
```

Then, by hand — `npm run dev`, and in a second terminal `npx tsx scripts/open-service.mts` to open a
service and print one treatment and one control token:

| Open | Expect |
|---|---|
| `/floor` | sign in with a seeded PIN, see the table list, tap **Fire order** |
| `/t/<treatment token>` | consent → waiting → round → outcome → add-on |
| `/t/<control token>` | blocked, with copy that gives no hint the table is a control |
| `/pass` | flip to RED, confirm kitchen-work prizes vanish from the pool |
| `/dash` | one large net-contribution number with the estimate caveat |
| `/tents` | 30 QR tents, `Ctrl+P` shows a clean print layout |

---

## Phase 1 — Operator identity and venue scoping · backend

**Goal:** a restaurant owner can be authenticated, and every operator query is bounded to their own
venue by construction rather than by care.

- [x] `MagicLinkToken` model — hashed token, `operatorUserId`, `expiresAt`, `consumedAt`. Single-use
- [x] `OperatorUser` gains `name` and `role`; `venueId` becomes nullable, because signing up creates
      the person and creating their venue is a later step they may abandon
- [x] `src/lib/magic-link.ts` — token generation, SHA-256 hashing, and a pure `checkToken` verdict so
      expiry is testable without a clock
- [x] `src/lib/operator-session.ts` — the signed-cookie pattern from `staff-session.ts`, on its own
      `op` cookie. Deliberately not a role on the staff cookie: a staff PIN must never be one enum
      value away from reading the P&L
- [x] `src/lib/email.ts` — Resend in production; in dev, `console.log` the link and return. **No API
      key is required to develop or test**
- [x] `requireOperator()` / `assertVenueScope()`. **Every** operator query takes its `venueId` from
      here — never from a route param, never from a form field. 404 not 403, so the response does not
      confirm the venue exists
- [x] Rate-limit magic-link requests per email; consume is a `updateMany` race so a mail-client
      prefetch cannot double-spend a link

**How to test**

```bash
npm test                # 14 assertions in src/lib/magic-link.test.ts
```

Covers: tokens are long and never repeat; only the hash is stored; a link works once; an expired link
is refused at the exact millisecond; a used-and-expired link reads as used.

By hand: request a link for `owner@example.com`, copy the URL out of the dev console, open it, land
signed-in. Open it a second time — refused.

**Still open:** `operator-session.test.ts` for cookie tampering, and the cross-venue 404 test, both of
which need a second seeded venue. Do these with phase 8.

---

## Phase 2 — Venue creation and onboarding state · backend

**Goal:** a venue can be created end to end from server actions, and is born configured rather than
empty.

- [x] `Venue.onboardingStep` enum — `DETAILS` → `TABLES` → `MENU` → `STAFF` → `QR` → `DONE`, with
      `nextOnboardingStep` / `isAtOrPast` helpers. Resumable; nobody finishes in one sitting
- [x] `createVenue` — venue + `VenueConfig` + starting `PrizeRule` rows + `phoneSalt` + `qrToken`,
      in one call. **A venue is born configured**, so no config read anywhere needs a fallback — and
      a fallback in code is exactly the hardcoded constant §10 forbids
- [x] `createTables(count)` — bulk-create labelled `1..n`, each with its own unique `qrToken`
- [x] `createMenuItems`, `createStaff`, `slugify`, `newQrToken`
- [x] **`prisma/seed.ts` now calls the same functions.** One path, not two. `src/lib/venue-setup.ts`
      is deliberately free of `server-only` and of the `db` singleton so the seed, which runs outside
      Next.js, can use it — everything takes `db` as an argument
- [x] Seed attaches an `OperatorUser` to the pilot venue, so `/signin` is reachable on a fresh clone

**How to test**

```bash
npm test          # src/lib/venue-setup.test.ts
npm run db:seed   # exercises the real creation path end to end
```

Covers: QR tokens are URL-safe, long, and never repeat across 1000 draws; slugs round-trip odd venue
names; the step machine stops at `DONE` rather than looping; the starting prize policy has a
catch-all for **both outcomes of both mechanics**, so no guest can fall through to nothing.

**Still open:** the database-backed assertion that a UI-created venue's config deep-equals a seeded
one. The shared code path makes drift unlikely rather than impossible; the test belongs with phase 5.

---

## Phase 3 — Venue QR · backend

**Goal:** one QR code per venue that a guest can scan and reach the game from, without breaking the
per-table measurement basis.

- [x] `Venue.qrToken` — unique, generated at creation, backfilled for the existing venue
- [x] `/v/[venueToken]` — `resolveVenueScan` → active tables → a grid of plain `<a>` links to
      `/t/[qrToken]`. **Server component, zero client JS**; works with JavaScript off
- [x] **Control tables appear in the picker and are indistinguishable.** Omitting them would be the
      easiest possible way to leak the arm — a guest whose table is missing from the list learns
      something. They tap it and get the same screen a closed venue shows
- [x] **Nothing is written by the picker.** It sits in front of the consent gate, so DPDP purpose
      limitation applies to it; it is a list of links and no more
- [x] Unknown venue token → 404 leaking no venue name
- [ ] The venue QR is added to `/tents` alongside the per-table sheet — the seed prints it, but it is
      not on the printable page yet

**How to test**

Extend the Playwright suite with `e2e/venue-qr.spec.ts`:

```bash
npm run test:e2e
```

- Scan `/v/<venueToken>`, tap a treatment table, reach the consent screen
- Scan the same QR, tap a control table, and assert the copy is **byte-identical** to the no-service
  page
- Assert `GuestSession.count()` is unchanged after the control attempt
- Assert a garbage venue token renders the neutral page and does not 500

All four are in `e2e/venue-qr.spec.ts` and green.

---

## Phase 3b — The venue sets its own prizes and discounts · backend

**Goal:** which items are given away, which are discounted and by how much, and what a losing guest
still gets, all belong to the restaurant. **Added mid-build**, because the engine was quietly making
these calls on the operator's behalf and PLATFORM.md §10 says it must not.

- [x] `PrizeRule` model — first-match-wins by ascending `priority`, every condition nullable meaning
      "any". Conditions: mechanic, outcome, margin tier, category, named item, peak / off-peak
- [x] **`AwardKind.HALF_PRICE` is gone.** It was a hardcoded 50 — precisely the venue number §10
      forbids baking in. Replaced by `PERCENT_OFF` carrying the venue's own percentage. Existing
      award rows were migrated to `PERCENT_OFF` at 50, not dropped: they are an audit trail
- [x] **The consolation is a rule, not a constant.** `awardFor` used to hardcode half price for a
      loss. It now resolves `outcome: LOSE` through the same engine call as a win
- [x] `defaultPrizeRules()` — the starting policy, written as editable rows at venue creation.
      Nothing reads it at runtime
- [x] Every entry carries the `ruleId` and the operator's own label, so the audit trail reads back in
      the words they wrote
- [x] `Award` gains `percentOff`, `fixedPricePaise`, `ruleId`, all snapshotted — a later rule edit
      cannot rewrite what a guest was told
- [x] Guest outcome copy, `/floor` redemption lines and `/pass` all read the depth off the award
      instead of assuming a half

**The fences still sit above the rules and are tested:** no rule an operator can write reaches a hero
item, overrides a chef veto, busts a depth cap, or survives a RED pass. A malformed rule excludes one
item with a legible reason rather than throwing — an operator mistyping a discount at 9pm on Saturday
should cost one prize, not 500 a guest's phone.

**How to test**

```bash
npm test          # 30 assertions in src/core/prize-engine/decide-prize-pool.test.ts
```

The ones that matter:

- A rule targeting a hero item by id is still refused with `Hero item — never discounted`
- A `FREE` rule under a 40% cap is **excluded, not clamped** — a contradiction the operator wrote is
  shown to them, not quietly resolved
- An arbitrary 30% discount produces the right paise, depth and cost
- A losing guest gets the `LOSE` rule and still gets something
- `percentOff: 500` excludes one item with `has an invalid discount percentage`
- Output is byte-identical across 100 runs and independent of rule and menu ordering

---

## Phase 4 — Landing page

**Goal:** replace the `create-next-app` scaffold at `src/app/page.tsx` with a real front door for
restaurant owners.

**Design contract: [UI-SPEC.md](UI-SPEC.md) §6 locks the hero.** Read it before building — the
signature element, the section order, and what must not appear are all decided there.

**Shipped as a skeleton, deliberately.** The palette is under review — the owner rejected the
cream-and-terracotta direction and no replacement is chosen — so structure and copy are locked and
the visual treatment is not. UI-SPEC §6 still governs when it is.

- [x] Replaces the `create-next-app` scaffold
- [x] Section order per UI-SPEC §6: guest experience → what the restaurant controls → the honest
      measurement note → one CTA
- [x] One primary action — **Get started** → `/signin`
- [x] `(operator)/layout.tsx` exists with nav and sign-out
- [x] All copy from `src/strings/en.ts`; product name from `src/brand.ts`, never a literal
- [x] Zero client components — the whole app still has only two, both on the guest round
- [x] Nothing that implies a draw, a wheel or a lottery, anywhere on the page — asserted by a test
      that scans the rendered text for eight banned words
- [ ] The **decision card** hero — a rendered fragment of the engine's own audit trail, showing what
      it put in tonight's pool and what it refused, each with its `reason`. Not a phone mockup, not a
      stat with a gradient. The refusal is the pitch. **Deferred with the palette decision**
- [ ] IBM Plex Sans + Mono via `next/font`, operator routes only — a `next/font` import under
      `(guest)` is a budget regression. **Deferred with the palette decision**
- [ ] **No pricing table, no logo wall, no testimonials.** There are no customers yet, and inventing
      social proof on the front door of an honest-measurement product is the most expensive lie
      available
- [ ] Fix the stale budget comment at the top of `src/app/globals.css` (UI-SPEC §10)

**How to test**

```bash
npm run build     # read the route table: / must stay at the framework floor, ~182KB
npm run lint      # the brand-literal rule stays clean
```

By hand: open `/` at 390px wide and at desktop width. Follow **Get started** and land on sign-in.
Then `grep -rn "Interlude" src/app src/strings` — the only hit should be `src/brand.ts`.

---

## Phase 5 — Onboarding UI

**Goal:** a restaurant owner goes from the landing page to a printable QR code without anyone helping
them. **This is the headline phase of the sequence.**

- [ ] `/signin` — email field → "check your email" → magic link → signed in
- [ ] `/onboarding` — guided, resumable from `onboardingStep`, one decision per screen:
  - [ ] **Details** — venue name, timezone, slug
  - [ ] **Tables** — how many tables; generates labels and tokens
  - [ ] **Menu** — add items, or start from a template and edit
  - [ ] **Staff** — at least one server PIN and one kitchen PIN
  - [ ] **QR** — the venue QR and the per-table tents, ready to print
- [ ] A visible step indicator; **Back** never loses entered data
- [ ] Landing anywhere in `/onboarding` after completing it redirects to `/dash`

**How to test**

`e2e/onboarding.spec.ts` — the full path, in one test:

```bash
npm run test:e2e
```

Landing page → **Get started** → enter an email → read the magic link out of the dev log (the
in-process email transport exposes the last link to the test) → open it → complete all five steps →
land on a page showing a scannable QR. Then, in the same test, scan that QR's URL and confirm the
guest flow starts.

Also assert resumability: sign out midway through **Menu**, sign back in, and the flow resumes on
**Menu** with the already-entered items present.

---

## Phase 6 — Menu management

**Goal:** the owner maintains their own menu, and the prize engine immediately reflects it.

- [ ] `/dash/menu` — list, add, edit, deactivate. No hard deletes; `Award` rows reference items
- [ ] Every field the prize engine reads is editable: name, category, price, food cost, margin tier,
      prep burden, `requiresKitchenWork`, `isHero`, `active`
- [ ] Money entered in rupees, stored in paise via `src/lib/money.ts`. Never a float
- [ ] Show computed contribution per item (price − food cost) as the owner types — this is the number
      that makes margin tier make sense to them
- [ ] Bulk CSV import, matching the seed's column shape
- [ ] Marking an item hero, vetoed or inactive changes tonight's pool on the next `/pass` load

**How to test**

```bash
npm test          # existing pure tests in src/core/prize-engine/decide-prize-pool.test.ts
```

- Create an item priced ₹249.50 and assert `pricePaise === 24950` — a rounding bug here is money
- Mark an item `isHero` and assert `decidePrizePool` excludes it with a hero `reason`
- Deactivate an item that has a confirmed `Award` and assert the award still renders on `/dash`
- Import the seed CSV into a fresh venue and assert the item count and total contribution match

By hand: edit an item on `/dash/menu`, reload `/pass`, and see the pool and its reasons change.

---

## Phase 7 — Prize admin

**Goal:** the restaurant controls the fences. Nothing the owner can set becomes a constant in code.

- [ ] `/dash/prizes` — every `VenueConfig` field, grouped and explained in plain language:
  - [ ] Round shape — quiz length, question count, win threshold, countdown buffer
  - [ ] Prize fences — depth cap per item %, depth cap per service ₹, mystery-plate price
  - [ ] Prep minutes per category — **this is the Manual POS adapter's input** and closes phase 0's
        open item
  - [ ] Peak window
  - [ ] The §11 gates — attach delta, ticket delta, scan rate, completion rate, review velocity
- [ ] Every field writes `VenueConfig`. If a number appears in code without a config row behind it,
      that is a bug
- [ ] Read-only **tonight's pool**, from the same `decidePrizePool` call `/pass` already makes, with
      every entry's and every exclusion's `reason` shown
- [ ] Chef vetoes visible and clearable from here as well as from `/pass`
- [ ] `PosAdapter` port introduced, with `Manual` as the shipping adapter

**How to test**

```bash
npm test
```

- Set `depthCapPerServicePaise` to 0 and assert every item is excluded with a cap `reason`
- Set kitchen load RED and assert every `requiresKitchenWork` item disappears
- Set `depthCapPerItemPct` to 0 and assert no `FREE` award can be issued
- Change prep minutes for a category and assert `fireOrder`'s `estReadyAt` moves by that amount

By hand: change quiz length on `/dash/prizes`, start a fresh guest round, and confirm the countdown
matches — no rebuild, no redeploy.

---

## Phase 8 — Owner dashboard, venue-scoped

**Goal:** `/dash` belongs to the owner, not to whoever happens to hold a staff PIN.

- [x] `/dash` moves off the staff PIN onto the operator session. A staff session that lands there is
      sent back to `/floor` — a server must never be shown a metric
- [x] A first-time operator, who has a session but no venue yet, gets the empty state rather than
      being bounced to a sign-in form they are already past. All three operator surfaces agree
- [x] Tier-1 headline unchanged — net contribution ₹, captioned an app-side estimate
- [x] Tier-2 placeholder unchanged, so tier 1 is never mistaken for the POS-verified number
- [x] **`/dash/activity`** — one row per `GuestSession`: table, scan time, game, score, prize and
      whether staff confirmed it. Two phones at one table are two rows, never merged. Anonymous by
      construction; a row is a table and a session, never a person
- [x] Control tables listed separately for the owner. The owner may see the arm split; the guest
      never may — the opposite rule, enforced separately on the guest surfaces
- [x] `/tents` accepts either session, so a manager printing tents on the venue tablet needs no
      email round-trip
- [x] `/floor` and `/pass` keep the staff PIN
- [ ] Venue switcher if one operator owns more than one venue
- [ ] Nav to `/dash/menu`, `/dash/prizes` — those routes do not exist yet (phases 6–7)

**How to test**

```bash
npm run test:e2e     # 21 pass
npm test             # 119 pass
```

Covered: a valid link signs in and lands on `/dash`; a link works exactly once; expired and garbage
tokens are refused; a venue-less operator keeps nav and sign-out and is not bounced off activity; a
staff session is redirected away from `/dash` to `/floor`; a signed-out visitor goes to `/signin`;
requesting a link responds identically for known and unknown addresses; an operator can open the
tent sheet from the nav; a scan without a play shows as a row; two sessions at one table are two
rows.

**Closed by the tenancy-and-debts wave below:**

- [x] The per-IP magic-link rate limit has a dedicated test — `e4e771a`. No production change was
      needed; the code path was already correct, the test coverage was not
- [x] `guestSession.findMany` in `activity.ts` and `funnel.ts`'s mixed units were one defect, not
      two, fixed together — `590d843`. Bounding the row list with `take` and deriving the funnel's
      counts from that same bounded array would have silently under-reported a busy night; the fix
      instead bounds `activity.ts`'s rendered rows with `ACTIVITY_ROW_LIMIT` while `FunnelSummary`
      counts sessions at every stage (`scannedSessions`, `playedSessions`, `claimedSessions`) from
      separate, unbounded aggregate queries. The dead `completed` / `won` / `awarded` fields are gone
- [x] `ActivityRow.addOnCount` was dropped rather than rendered — `590d843`. It comes back when the
      activity table gets its own UI phase

By hand: run a full service on a seeded venue and confirm the headline number equals add-on
contribution minus prize cost, computed by hand from the rows.

**Covered by `e2e/tenancy.spec.ts`, added below.** Not as a 404: no operator route accepts a venue id
— the session is the only source of one, via `requireOperator()` — so "request venue B and get a 404"
is not a request that can be made. What is asserted instead is that an operator signed into venue A
sees only venue A's data while venue B's data exists in the same database at the same moment. If a
route ever does take a venue id, `assertVenueScope` is the guard, and it will need its own test.

---

## Phase 8b — A second venue, and what it revealed

**Goal:** stop taking tenant isolation on faith. Seed a second venue and let it falsify any isolation
claim the code makes — and fix what it found.

- [x] `prisma/seed.ts` builds two venues through one shared `seedVenue` function — `The Pilot Kitchen`
      (slug `pilot`, unchanged: same operator, same PINs, 30 tables) and `Copper & Clove` (slug
      `copper`, 8 tables, PINs `4321`/`8765`, operator `owner-two@example.com`)
- [x] `e2e/tenancy.spec.ts` — an operator signed into venue A sees only venue A's activity, dashboard
      and tents while venue B's rows exist in the same database at the same moment
- [x] `e2e/fixtures.ts` gained `venueBy(slug)` and `arrangeServiceFor(slug)`, and `clearAllPlayState`
      became `clearPlayStateFor(venueId)` — the old wipe cleared every venue's play state, which would
      have let a leak between venues pass as a clean run
- [x] **The isolation assertions were absence-only** and would have passed against a page that
      rendered nothing at all. Fixed by asserting each venue's own data is present before asserting
      the other venue's data is absent
- [x] **The security fix this second venue exposed:** a staff PIN checked against *every* venue's
      staff, not just its own — a PIN collision across venues opened the wrong restaurant's floor.
      One venue in V1 made this invisible; the code comment that introduced the check said so
      directly ("One venue in V1... With /admin and multiple venues this becomes venue-scoped"), and
      multi-tenancy arrived without that follow-up ever happening
- [x] Staff sign-in moved to `/floor/[venueSlug]`. The PIN is checked only against that venue's staff,
      still walking every hash so response time leaks nothing, and refusing outright if two hashes
      verify
- [x] Bare `/floor` shows one line pointing staff at their own venue's link — deliberately **not** a
      venue picker. A venue list is a list of every restaurant that is a customer, and that is not
      staff's information to have

**The tenancy test proves scoping, not a 404.** No operator route accepts a venue id — the session,
via `requireOperator()`, is the only source of one — so "request venue B and get a 404" is not
expressible as a request. What `e2e/tenancy.spec.ts` asserts instead is that an operator signed into
venue A sees only venue A while venue B's data exists in the same database at the same moment. If a
route ever does take a venue id, `assertVenueScope` is the guard, and it will need its own test the
day that happens.

**The staff-PIN hole was invisible until a second venue existed.** It could not have been found by
auditing venue A alone — a single-venue database has no wrong venue for a PIN to open. Seeding a
second tenant before believing any isolation claim is the reason this wave exists.

**How to test**

```bash
npm run db:seed
npm run typecheck && npm run lint && npm test && npm run test:e2e
npx playwright test e2e/tenancy.spec.ts
```

125 unit tests, 33 E2E tests, all passing.

---

## Phase 9 — Game selection · backend and guest UI

**Goal:** a restaurant can choose which games they run, and a guest picks their stake when more than one is available.

- [x] `VenueGame` model — `venueId`, `mechanic`, `enabled`, `displayOrder`. A venue with every game off is closed to guests, deliberately
- [x] Migration with backfill — existing venues get both `KITCHEN_ROUND` and `MYSTERY_PLATE` enabled
- [x] `defaultVenueGames()` in `src/lib/venue-setup.ts` — both games on at creation, so a new venue gets the picker without config
- [x] `getEnabledGames` / `listVenueGames` / `setVenueGameEnabled` in `src/lib/service.ts`
- [x] Guest stake picker — `/t/[qrToken]` waiting screen offers one button per enabled game when more than one is on; collapses to **"Start the round"** when exactly one
- [x] `startRound` takes the chosen mechanic and re-validates it server-side
- [x] `awardFor` reads the mechanic off the `Play` row instead of hardcoding it
- [x] `/dash/games` — operator surface with one row per mechanic. Toggle on/off; an all-off venue shows a warning. Nav link added to operator layout
- [x] `e2e/games.spec.ts` — new test file covering the picker, single-game collapse, all-off closure, and the operator toggle

**How to test**

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e
npx playwright test e2e/games.spec.ts
```

Covers: the picker appears with both games on and accepts either choice; a single enabled game skips the picker; all games off renders the neutral "nothing running" screen and writes no session row; the operator toggle changes what the guest is offered immediately and completely.

**Two things to hold onto honestly**

**Mystery Plate is a stake, not a second mechanic.** The eight questions are identical; only the prize rule differs. `VenueGame` and the picker are the seam a genuinely different mechanic would plug into later — both in the quiz content and in the prize engine's own decisions.

**A venue with every game off is closed to *new* guests.** That is deliberate — an empty enabled list is an operator decision, not an absence of preference. The guest surface renders the same neutral screen a control table and a closed venue get, and it is asserted in `e2e/games.spec.ts` that no session row is written when the guest taps in. It closes the door rather than clearing the room: a guest already mid-round, or holding an award their server has not confirmed yet, finishes on the rules they started under — also asserted there, because the operator is promised exactly that on `/dash/games`.

**A missing `VenueGame` row is not a missing game.** `/dash/games` lists every mechanic the platform knows (`MECHANICS` in `src/core/prize-engine`) with the venue's rows joined onto it, and the toggle upserts. A venue whose rows never got written, or one created before a new mechanic shipped, stays recoverable from its own dashboard — and a new mechanic needs no backfill migration.

---

## Later

Carried across intact from the old waves 2–3. Each keeps its one-line test note.

**Measurement truth**

- [ ] CSV bill-import adapter (end-of-day POS export) — *test: import a known file, assert ticket
      count and totals*
- [ ] **ITT delta** (tented vs untented) and **engaged delta** (scanned vs untented) — *test: seeded
      synthetic Saturday with known ground-truth lift, asserted end to end*
- [ ] Scan rate, completion rate, add-on conversion, ticket delta — *test: fixture service with
      hand-computed expected values*
- [ ] Gate evaluation against §9 thresholds, all venue-configurable — *test: set a gate either side
      of a known value, assert the verdict flips*
- [ ] Dashboard tier 2 promoted to the headline; engaged delta shown separately and captioned —
      *test: assert the two tiers are never summed into one number*
- [ ] Monday 09:00 email via Vercel Cron + Resend — *test: render the email to a string and snapshot it*

**Mystery plate — #2**

- [ ] A fixed-price product the guest wins the right to buy. Never a draw — *test: the no-RNG ESLint
      rule plus a property test that outcome is a pure function of skill input*
- [ ] Chef nominates tonight's plate from near-spoilage stock — *test: nominated item appears in the
      redemption queue by its real name*
- [ ] Full prize engine — velocity input, depth caps, load-aware suppression — *test: property tests
      — never a vetoed item, never over a cap, never kitchen work while RED*

**Voice review**

- [ ] Voice drafting via Web Speech API, typed fallback (iOS Safari support is partial) — *test:
      typed fallback path in Playwright; speech is manual*
- [ ] Approve-your-own-words, then deep-link to Google `writereview` — *test: assert the deep link
      contains the venue's Place ID*
- [ ] Prompted to **every** table regardless of play, win or sentiment — *test: assert the prompt
      renders for a session with no play and for a losing session*
- [ ] Module boundary — the review module cannot read prize or award state — *test: a static import
      check that fails the build if it ever does*
- [ ] Review-velocity tracking, before vs during — *test: funnel counts only; assert no rating column
      exists anywhere*

**Hardening**

- [ ] Offline and flaky-wifi tolerance across the guest flow — *test: Playwright with the network
      cut mid-round*
- [ ] Every dead end and error state designed, not defaulted — *test: walk each one by hand*
- [ ] Load test at peak concurrency for one venue
- [ ] Staff briefing print pack, including the scripted line: *"Scan it while you wait — you might
      win dessert"*
- [ ] Operator runbook; paper log fallback for when something breaks at 9pm Saturday

---

## What each archetype sees, once phase 8 lands

| | |
|---|---|
| 🍽️ GUEST | Scans the QR on the table or the counter → taps their table number if it was the venue QR → one line of plain-language consent, **Continue**, nothing recorded before that tap → **"Your food is about 7 minutes out. Beat the kitchen."** → a 60–90s food quiz racing the countdown → *"You beat the kitchen — your tiramisu is on the house. Show this to your server."* or a guaranteed consolation of lesser depth → **"Add a dessert to your order?"**, three options, one tap → *"Sent to your server."* Never asked to sign up, download, or type an email |
| 🧑‍🍳 SERVER | A live table list: seated · order fired · playing · **add-on requested** · **awaiting redemption**, plus which tables are tented tonight. Taps **Fire order** when food goes in. Add-on tickets arrive: *"Table 7 — 1× Tiramisu"* → **Ack**. Redemption: *"Table 7 claims: Tiramisu, free"* → **Confirm**. No metrics, no dashboard |
| 👨‍🍳 CHEF | One big **GREEN / AMBER / RED** control — RED instantly stops every prize needing kitchen work. Tonight's pool with reasons: *"Tiramisu — high margin, 4 unsold since Tuesday."* A veto toggle beside each item |
| 💼 OWNER | Signs up from the landing page, onboards their own venue, prints their own QR, maintains their own menu, and sets their own prize fences. Then one number, large: **"Net contribution tonight: ₹2,340."** Add-ons sold, contribution earned, prize cost conceded. Captioned as an app-side estimate until the first bill export lands |

---

## Deferred, not cancelled

- **Server recognition card** — *"Table 12 — 3rd visit — ordered the Korean fried chicken twice."*
  Needs optional phone capture with per-venue HMAC. Arguably the most valuable non-game thing in the
  product; out for time, not for doubt
- **Per-table QR as the primary path** — already built and still printed. The venue QR sits in front
  of it because it is one code to print, not thirty
- **W1 queue window** and the **shared screen** — unchanged, still out

## Never build

XP · levels · badges · global leaderboards · cross-venue identity · accounts-before-value ·
spin wheels / scratch cards / any pure-chance mechanic · incentivised or gated reviews ·
payment processing · discounts on hero items · licensed-property games without a licence ·
a native app · the W1 queue window · the shared screen (V1.5) ·
**multiplayer of any kind — #7 table-vs-table and #12 beat-the-house are cut. New mechanics are
single-player.**
