# Interlude — Platform Reference

Single source of truth for what the platform is and how it is built.

**Status:** pre-validation, shipping anyway. The business doc gates code behind Tests 0–2; that gate
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

| Window | Guest state | Duration | Merchant value |
|---|---|---|---|
| **W1 · Queue** | Bored, flight risk | 5–30 min | Fewer walkaways; pre-orders that start the kitchen |
| **W2 · Food wait** | Ordered, phone out, receptive | 10–25 min | **Attach rate and mix shift** — the core window |
| **W3 · Bill wait** | Fed, warm, phone out | 5–15 min | Review capture; return-visit hook |

V1 is **W2-first**. W3 (the voice review) is under *Later* in TODO.md. W1 is out of V1 scope.

---

## 3. Actors and surfaces

| Archetype | Surface | Route | Auth |
|---|---|---|---|
| **Guest** — the person scanning the QR | Mobile web, one-handed | `/v/[venueToken]` → `/t/[qrToken]` | None. Anonymous session cookie. Phone optional, at prize claim only |
| **Server / floor staff** | Their own phone or a shared tablet, PWA | `/floor` | Venue PIN → httpOnly session |
| **Chef / kitchen lead** | Tablet mounted at the pass, glanceable, big targets | `/pass` | Venue PIN, kitchen role |
| **Owner / F&B head** | Desktop or phone | `/`, `/signin`, `/onboarding`, `/dash`, `/dash/menu`, `/dash/prizes`, `/tents` | Email magic link → httpOnly session |

**Onboarding is customer-facing, not internal.** The platform is multi-tenant: a restaurant reaches
the landing page, requests a magic link, and sets up its own venue — details, tables, menu, staff
PINs, QR — with nobody from our side involved. This replaces the internal `/admin` surface that
earlier drafts of this document described.

**Two QR codes, one flow.** The venue QR (`/v/[venueToken]`) is one code to print for the counter or
the menu; it shows a table picker and hands off to the per-table QR (`/t/[qrToken]`) that the tents
carry. The per-table token remains the thing a `GuestSession` is opened against, because the arm
assignment — and therefore the entire measurement basis in §9 — is per table. A control table appears
in the picker and fails there with copy identical to a closed venue; if a guest can infer their arm
from the wording, the experiment is contaminated.

**Design rule per archetype**
- Guest: no accounts, no signup, no app. The competitor is Instagram Reels and it loads instantly,
  so weight is a product concern, not an engineering nicety. **The original "<100KB JS, interactive
  <2s on 3G" target is not achievable on this stack and has been revised — see below.**
- Server: never shown a dashboard or a metric. Only: what to do, at which table, right now.
- Chef: one control that matters (kitchen load) and one list (vetoes). Readable at a glance,
  mid-service, with wet hands.
- Owner: leads with one number. Everything else is secondary and collapsible.

---

## 4. V1 scope — two mechanics, one screen, one number

Locked per §12. Anything not on this list is out.

| # | Component | What ships |
|---|---|---|
| **#5** | Kitchen-timed round | **The climb.** Countdown fed by order-fired time, and the run lasts as long as the food does — a slow kitchen is a longer game, not a worse wait. The guest climbs rungs of hands dealt from the venue's own menu (tap the dearer dish; order three-to-five cheapest-first), and banks the highest rung standing when the food lands. Every rung is one whole dish, so there is no partial win. Manual-timer fallback when no POS |
| **#2** | Mystery plate | Win the right to *buy* a ₹99 kitchen's-choice small plate. A fixed-price product, never a draw. Chef veto honoured live |
| Screen | Voice review | At the bill: speak → draft → approve your own words → deep-link to Google. No incentive, prompted to every table |
| Dashboard | One number | Net contribution ₹ on night one; attach-rate delta vs. same-night control once bills are imported. Plus a Monday morning email |

**Shipped with the guest loop, not after it:** kitchen-load input and the chef veto switch (§5.2,
§12). Pushing a dying dessert at 9pm Saturday without them makes the chef the product's enemy by 9:15.

**Operator plumbing is scope, but it is not a mechanic.** The landing page, auth, venue onboarding,
**menu upload**, menu management and prize admin are how a restaurant reaches the rows above without
us in the room. They add no guest-facing mechanic and open no door to anything in §12.

**Menu upload is scope, and it is the one that decides venue count.** Typing forty items by hand is
roughly an hour and is where self-serve setup is abandoned. Photo/PDF/CSV upload takes it to ten
minutes, which is the difference between a six-venue pilot weekend and a one-venue one. §6a.

**Cut from V1 by owner decision:** #7 table-vs-table and #12 beat-the-house. **Multiplayer is out
entirely** — new mechanics are single-player. This removes match lobbies, pairing, server-authoritative
match state and abandon handling from the build, and removes `Match` from the data model. The
match-availability gate in *Metrics and gates* below is consequently dormant.

**Deferred, not cancelled:** the server recognition card. Wanted; it needs optional phone capture
with the per-venue HMAC and did not fit the budget.

**No longer deferred:** venue onboarding. Earlier drafts held it back as an internal `/admin`
surface; the multi-tenant decision promoted it to a customer-facing flow and it is TODO.md phases
1–5.

---

## 5. The prize engine — `core/prize-engine`

The part §16 claims a competitor cannot clone from a screenshot. One pure, deterministic function.

```ts
decidePrizePool({
  menu,           // items + margin tier + price + prep burden
  velocity,       // what already sells, what is dying
  kitchenLoad,    // GREEN | AMBER | RED, live from the pass
  chefVetoes,     // never promote these
  depthCaps,      // maximum value conceded, per item and per service
  mechanic,       // #5 | #2
  serviceClock,   // where we are in the night
}): {
  entries:  { itemId, mechanic, depth, reason }[]
  excluded: { itemId, reason }[]
}
```

Rules: the biryani never enters; the tiramisu sitting since Tuesday always does.

**Every decision carries a `reason` string**, and the whole output is snapshotted per service to a
`PrizePool` row. That audit trail is what turns "you do — margin tags, veto list, prize depth caps;
we optimise inside your fences" (§14.3) into a claim the operator can check.

No I/O, no database, no clock inside the engine — everything is an argument. That is what makes it
testable against the invariants in §7.

---

## 6. POS — port and adapters (`lib/pos`)

T3 is unrun; nothing may depend on a vendor API existing.

```ts
interface PosAdapter {
  getMenu(venueId): Promise<MenuItem[]>
  getItemVelocity(venueId, window): Promise<Velocity[]>
  getOrderFiredAt(tableId): Promise<Date | null>   // drives the #5 countdown
  getClosedTickets(serviceId): Promise<Ticket[]>   // drives ticket delta
}
```

| Adapter | Role |
|---|---|
| **Manual** | Staff taps "order fired"; countdown runs off configured per-category prep times. Zero vendor cooperation required. §12's graceful fallback |
| **CsvImport** | Operator uploads the venue's end-of-day bill export. **Every Indian POS can export bills even when it will not grant API access — so measurement is never blocked on T3** |
| **Mock** | Deterministic fixtures for dev, tests, and operator demos |
| **Petpooja / Restroworks** | Interface-conforming stubs. No live calls until T3 returns written terms |

---

## 6a. AI — port, adapters, and the line it may not cross

**The rule: AI reads and drafts; a person confirms; it never decides.**

It lives in `src/lib/ai/` behind an adapter, exactly like the POS port, with a `Mock` for tests and
dev so no API key is needed to develop. **It is banned from `core/`** — and this is not tidiness. An
LLM is nondeterministic. `core/prize-engine` and `core/mechanics` are where the no-pure-chance
guarantee (§7) is enforced by proving outcomes are a pure function of skill input. A model call
anywhere in that path would destroy the proof, and the guarantee is what keeps the product on the
right side of gambling law. The existing ESLint no-RNG rule extends to cover the AI module.

```ts
interface AiAdapter {
  extractMenu(file: Upload): Promise<MenuDraft>        // photo | PDF → items, never saved directly
  narrateReport(metrics: WeeklyMetrics): Promise<string>
  draftReview(spoken: string): Promise<string>          // guest approves before it leaves
  describeItem(item: MenuItem): Promise<string>
}
```

| Use | Cadence | Marginal cost | Confirmed by |
|---|---|---|---|
| **Menu extraction** — photo or PDF → a draft grid | Once per venue | A few rupees | Operator, before anything is written |
| **Weekly report narration** — numbers already computed, put into three sentences | Weekly per venue | Under ₹1 | Nobody. It narrates; it does not compute |
| **Review drafting** — the guest's own words, tidied | Per review | Under ₹1 | The guest, before hand-off |
| **Item descriptions** for tents and guest cards | Once per item | Paise | Operator |

A cheap model does all of it, because every task above is transcription or restatement rather than
judgement — the thing these models are actually dependable at.

**Banned outright, each for its own reason:**

| Never | Why |
|---|---|
| Choosing a prize, a pair, or an outcome | The gambling line. Outcomes must be a pure function of skill |
| Writing a food cost | Food cost drives contribution, which is the headline number. A hallucinated cost is a wrong rupee figure shown to an owner as fact |
| Reading or inferring a review's sentiment | §7's review boundary. Storing sentiment creates the ability to gate on it |
| Any call on the guest's critical path that can block a screen | Venue wifi. Extraction is setup-time; drafting degrades to the typed fallback |

**Menu extraction is deliberately narrow.** It reads names, categories, prices and portion options —
what is printed on the page. It is not asked for food cost (the operator gives one rough percentage
per category and we compute), and margin tier is derived from price and cost rather than guessed.
Narrowing the ask to transcription is what makes a cheap model sufficient and the output checkable.

**Commercially it is the demo.** An owner watching forty items appear from a photograph of their own
menu is the moment the rest becomes believable, and it removes the hour of typing that is where
self-serve setup actually gets abandoned.

---

## 7. Compliance guardrails — enforced in code, not intention

§5.3 and §17.1 treat these as existential. Each is a test or a lint rule.

| Rule | Enforcement |
|---|---|
| **No pure chance** (§3.3) | `Math.random` and `crypto.getRandomValues` banned by ESLint inside `core/prize-engine` and `core/mechanics`. Test asserts outcome is a pure function of the skill input. Mystery plate is modelled as a fixed-price product, never a draw |
| **AI decides nothing** (§6a) | The AI module is import-banned from `core/`, enforced as a lint rule alongside the no-RNG one. Test asserts a menu extraction writes no row until the operator confirms, and that the CSV path makes no model call at all |
| **Review capture separated from rewards** (§5.3) | The review module is given no prize or award state — a module boundary, not discipline. Test asserts the prompt fires for 100% of sessions regardless of play, win, or sentiment. No rating is captured before hand-off, so gating is structurally impossible |
| **Venue's fences respected** | Property test: no chef-vetoed item, no item over its depth cap, no kitchen-work item while load is RED |
| **Control-arm integrity** | Control tables cannot open a session or receive an offer. Test asserts it |
| **DPDP siloing** (§5.3) | Phone stored as HMAC with a **per-venue salt**. No cross-venue join is possible in V1 by construction |
| **Consent** | Purpose-limited consent at first scan, before anything is recorded |
| **Tenant isolation** | Every operator query takes its `venueId` from the session via `requireOperator()`, never from a URL parameter or a form field. Test asserts that venue A's session reaching venue B's data 404s. Multi-tenancy makes this a data-leak boundary, not a tidiness rule |
| **Arm integrity under self-onboarding** | A venue sets up its own tables, but arm assignment stays mandatory and control tables stay unable to play. A venue with no control arm simply has no computable ITT delta (§9) — the answer is to say so, never to relax the block |

---

## 8. Data model

`Venue` · `Table` · `Service` · `TableArmAssignment` · `MenuItem` · `KitchenLoad` · `PrizePool` ·
`GuestSession` · `Play` · `Award` · `AddOnRequest` · `Ticket` · `GuestIdentity` ·
`ReviewPrompt` · ~~`QuizPack` / `QuizQuestion`~~ (retired with the quiz; unread) · `StaffUser` · `OperatorUser` · `MagicLinkToken`

`Match` is gone with multiplayer (see *V1 scope* above). `GuestIdentity` arrives with the voice
review, under *Later* in TODO.md.

Multi-tenancy adds three fields and one model: `Venue.qrToken` (the venue QR),
`Venue.onboardingStep` (setup is resumable — nobody completes it in one sitting), `OperatorUser.name`
and `.role`, and `MagicLinkToken` — hashed, single-use, expiring.

Notes on the two that carry weight:

- **`TableArmAssignment`** (service, table, arm, swapAt) is a first-class row, never a computed
  guess. The same-night control is the entire evidentiary basis of the business, so the assignment
  must be recorded, auditable, and impossible to reconstruct favourably after the fact.
- **`ReviewPrompt`** stores funnel counts only — shown, drafted, handed off. No rating, ever.
  Storing sentiment would create the ability to gate on it.

---

## 9a. What a small weekend can prove — the MLP's measurement design

The MLP has to make an owner want to buy after **two nights**. That constraint is statistical before
it is anything else, and designing as though it were not is the way this fails quietly.

| Kind | Examples | What one pooled weekend yields |
|---|---|---|
| **Counts** — a census, not a sample | Confirmed add-ons, contribution ₹, prize cost ₹, net ₹ | **Exact.** Every row is a real sale a server confirmed. No inference, no interval. Twenty add-ons is twenty add-ons |
| **Rates** — binomial, modest N | Scan rate, completion rate, add-on conversion | **Reportable.** ~200 tented tables pooled gives roughly ±6pp at 95%. Enough to say "a quarter of tables play" and defend it |
| **Deltas** — two-proportion, large N | Attach-rate delta, ticket delta | **Not from one weekend.** Detecting 5pp on a ~20% base needs on the order of 1,000 tables *per arm*; a weekend across six venues has ~200. Only a very large effect would clear the noise |

**So the MLP proves three things and claims nothing else:**

1. **Guests play** — scan and completion rates, quoted with their margin of error.
2. **It sells food** — the tier-1 ledger, counted rather than estimated.
3. **The kitchen keeps control** — vetoes exercised, load flipped, the kill switch available and
   nothing forced past the chef.

The delta is still computed and still shown, **carrying its confidence interval and the words "not
yet conclusive" until that interval excludes zero.** It accumulates weekend over weekend. Publishing
it early — to a buyer, a deck, or ourselves — spends the credibility that honest measurement is the
entire differentiator for.

**This is why the pilot is 4–6 venues rather than one.** Pooling is the only route to even the rate
numbers in a single weekend, and it pre-empts the first objection any buyer raises: that the one
venue was unusual. Per-venue numbers are shown to that venue's owner as directional; the pooled
number is the one with an interval on it.

**Pooling never crosses the tenancy boundary.** No operator sees another venue's data. The pooled
view is ours, and it is a script (`scripts/pilot-report.mts`) rather than a screen — a cross-venue
surface is an authorisation boundary we have no reason to build and every reason not to.

---

## 9. Metrics and gates

**North star: attach-rate delta**, in percentage points, from the merchant's own POS — read
alongside §9a on when it is safe to believe.

**Reported two ways, and the difference matters.** §11 defines the delta as *engaged vs. control*.
Tables that choose to scan self-select — more receptive, more social, less rushed — so that number
includes guest disposition, not just product effect, and will show lift even if the product does
nothing. The alternating-table design only pays off measured as intent-to-treat.

| Reported as | Compares | Use |
|---|---|---|
| **ITT delta** | All tented tables vs. all untented tables | The honest number. Price against this. Show this to a buyer |
| **Engaged delta** | Scanned tables vs. untented tables | Shown with an explicit self-selection caveat. Never the headline |

**Night one has no POS export, so the dashboard is two tiers.** The pilot operator has to see his
own benefit in rupees on the first night, before any bill import exists. Tier 1 is computed from the
app's own rows; tier 2 is the POS-backed truth above. They are shown together and **never merged
into one number.**

| Tier | Source | Shows |
|---|---|---|
| **1 — app-native** | Confirmed `AddOnRequest` and `Award` rows × the venue's own margin config | Add-on gross ₹, add-on contribution ₹, prize cost ₹, and **net contribution ₹** as the headline. Live from night one. Labelled an app-side estimate |
| **2 — POS-backed** | CSV bill export | ITT delta, engaged delta, ticket delta. Takes over the headline the moment the first export lands |

Tier 1 assumes the add-on was incremental — that the guest would not have ordered it anyway. That
assumption is precisely what the control arm exists to test, so tier 1 is directional until tier 2
arrives. Say that to the operator before he reads the number, not after.

| Metric | Definition | Gate |
|---|---|---|
| Attach-rate delta | pp difference, same service | ≥5pp to proceed |
| Ticket delta | % avg-ticket uplift | kill <4% · proceed ≥6% |
| Wait-window scan rate | scans ÷ tented waiting tables | kill <15% · good ≥25% |
| Completion rate | finished ÷ started | ≥60% |
| Add-on conversion | add-ons ÷ scanning tables | measure; no gate yet |
| Review velocity × | reviews/week during ÷ before | ≥2× |
| ~~Match availability~~ | ~~matchable pairs per peak service~~ | Dormant — multiplayer is cut |
| Plays per returning guest | trajectory across visits | watch the slope — content-decay warning |

Gates are **venue config**, seeded from the doc and editable in `/dash/prizes`.

**Multi-tenancy puts the north star at risk, and the risk is worth naming.** A venue that onboards
itself will want to tent every table — the control arm looks like leaving money on the floor. But a
venue with no untented tables produces no ITT delta, only an engaged delta, which is the number §11
already warns is inflated by self-selection. So: onboarding creates an alternating split by default,
the pilot venue keeps it, and a venue that later opts out is told plainly which number it has given
up. Never quietly compute engaged delta and label it attach-rate delta.

---

## 10. Configuration, not constants

Every Appendix B number is seeded from the business doc's estimate and then editable per venue:
food-wait/prep times by category, margin bands, prize depth caps, mystery-plate price, climb rungs and hand seconds,
countdown buffer, peak-hours definition, and all §11 gates.

When T0/T1 eventually run, the numbers change. The code does not.

---

## 11. Architecture

```
src/
  app/
    page.tsx               # landing — the operator front door, zero client components
    (guest)/v/[venueToken]/ # venue QR: pick your table, hand off to the tent token
    (guest)/t/[qrToken]/   # guest mobile-web — no accounts
    (staff)/floor/         # server: fire order, add-on tickets, redemption, recognition card
    (kitchen)/pass/        # chef: kitchen load, veto list, tonight's pool
    (operator)/signin/     # magic link request + consume
    (operator)/onboarding/ # resumable venue setup: details, tables, menu, staff, QR
    (operator)/dash/       # owner: the one number
    (operator)/dash/menu/  # the venue's own menu, incl. photo/PDF/CSV upload
    (operator)/dash/prizes/ # depth caps, prep minutes, gates — all VenueConfig
    (operator)/tents/      # printable per-table tents + the venue QR
    api/
  core/                    # pure. no I/O, no clock, no randomness, no AI
    prize-engine/          # pure, deterministic, unit-tested
    mechanics/             # game rules — pure logic. Single-player only
    measurement/           # arm assignment, ITT + engaged delta, gate evaluation
    consent/               # DPDP consent, phone hashing, venue siloing
  lib/
    pos/                   # port + Manual | CsvImport | Mock | vendor stubs
    ai/                    # port + cheap-model | Mock. Never imported by core/
  brand.ts                 # the name lives here and nowhere else
scripts/
  pilot-report.mts         # pooled cross-venue numbers. Ours, not an operator surface
```

**`pos/` and `ai/` sit in `lib/`, not `core/`, because both do I/O and `core/` is pure.** §6's
`core/pos` path is superseded by this tree.

**Realtime is polling, not websockets.** Venue wifi is unreliable and serverless does not hold
sockets. The #5 countdown is driven by a **server-issued end timestamp**, so client clock skew and
tab-suspend cannot desync a game. Animation is local; truth is server-side.

Intervals are **per-surface, not a blanket 2s**. With multiplayer cut, a running countdown needs no
polling at all — only state *changes* do. A 30-table service polling everything at 2s is ~54,000
requests per service; the table below is roughly an 80% reduction for no loss of responsiveness.
All polling pauses when the tab is hidden.

| Surface | Interval | Why |
|---|---|---|
| Landing, sign-in, onboarding, menu, prizes | none | Forms and static copy. An operator does not need a live feed to type a menu in |
| Guest, waiting for order-fired | 5s | Nobody notices five seconds here |
| Guest, mid-round | none | Countdown runs locally off the end timestamp |
| Guest, awaiting redemption | 3s | Short-lived, and the guest is watching |
| Floor | 2s | Staff act on it in real time |
| Pass | 10s | Load and vetoes change rarely |

**Stack:** Next.js 16 App Router · TypeScript strict · Postgres + Prisma · Vercel (incl. Cron for
the Monday email) · Resend · Vitest + Playwright.

---

## 12. Never built

Per §12's Never-Build list and Appendix A's graveyard. These stay dead including in brainstorms,
including under new names:

XP · levels · badges · global leaderboards · cross-venue identity · accounts-before-value ·
spin wheels / scratch cards / any pure-chance mechanic · incentivised or gated reviews ·
payment processing · discounts on hero items · licensed-property games without a licence ·
a native app.

**Added by the V1 scope cut above: multiplayer of any kind.** Table-vs-table, beat-the-house, match
lobbies, pairing, opponent state. New mechanics are single-player. This is a scope decision rather
than a graveyard entry, so it is reversible — but it is out of V1 and out of brainstorms for V1.

---

## 13. Open decisions

| Decision | Status |
|---|---|
| Validation gate (T0–T2) | **Settled: lifted.** We ship a staged MLP and validate from live pilot data. The cost is that every Appendix B number is an unmeasured estimate — which is exactly why §10's config rule is load-bearing rather than tidy |
| Pilot size | **Settled: 4–6 venues, one weekend, both nights.** One venue cannot produce a defensible number at any confidence (§9a). Pooling is the only route to the rate metrics inside a single weekend |
| What the pilot claims | **Settled: counts and rates, not deltas.** The tier-1 ledger and the engagement rates are the sale. Attach-rate delta ships with a confidence interval and an explicit "not yet conclusive" until the interval excludes zero (§9a) |
| Launch date | **Settled: pushed one week** by owner decision, to buy menu upload and the venue count |
| AI | **Settled: reads and drafts, never decides.** A `lib/ai` port with a Mock, import-banned from `core/`, four narrow uses, four hard prohibitions (§6a). Setup extraction is the demo and the recurring narration is the hook; pricing undecided |
| Food cost source | **Settled: never extracted by a model.** One operator-supplied percentage per category, cost computed from it, margin tier derived. A hallucinated food cost is a wrong contribution figure presented to an owner as fact (§6a) |
| Cross-venue pooled view | **Settled: a script, not a screen.** `scripts/pilot-report.mts`. A cross-venue surface would be an authorisation boundary with no product reason to exist |
| Multiplayer | **Settled: cut.** #7 and #12 out; single-player only. See *V1 scope* and *Never built* |
| Tenancy | **Settled: multi-tenant, self-serve.** Restaurants sign themselves up from the landing page; onboarding is no longer an internal `/admin` surface. The cost is that venue scoping becomes a data-leak boundary (§7) and the control arm becomes a thing a venue can decline (§9) — both are named rather than mitigated away |
| Operator auth | **Settled: email magic link** via Resend. No passwords to store, reset or leak. In development the link is written to the console, so onboarding is testable with no API key and no network |
| Venue QR vs. per-table QR | **Settled: both.** The venue QR is one code to print; the per-table token stays the thing a session opens against, because arm assignment is per table. The picker is the seam |
| Database at scale | **Settled for V1: Neon Postgres**, Singapore, free tier. Revisit **Cloudflare D1 at multi-venue scale** — the schema validates unchanged on SQLite, and D1 allows *a database per venue*, which would turn the DPDP cross-venue guarantee from a logical one (per-venue HMAC salt) into a physical one. The blocker today is hosting, not the data model: D1 binds to Workers, so adopting it means moving off Vercel. Keep all access behind Prisma so the port stays cheap |
| Working name | `interlude` placeholder; isolated in `src/brand.ts` |
| Shared screen (#17) | Out of V1. V1.5 hardware pilot |
| Phone verification | Off by default. Redemption is staff-confirmed. DLT/WhatsApp approval is 1–3 weeks and does not belong on the critical path |
| Hindi strings | English-first, strings externalised from the first commit so Hindi is a translation job, not a refactor |
| Repo location | **Settled:** `C:\Users\prana\OneDrive\Desktop\Code\interlude`, under OneDrive by explicit choice. The known cost stands — OneDrive sync causes `node_modules` file locks and slow installs — so `node_modules` **must** be kept out of sync before the first `npm install` (see TODO.md phase 0) |
