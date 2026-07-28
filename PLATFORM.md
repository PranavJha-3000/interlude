# Interlude — Platform Reference

Single source of truth for what the platform is and how it is built.
Business rationale lives in *INTERLUDE — Business Foundation v1.0*; this file is the engineering
counterpart. Section references (§) point at that document.

**Status:** pre-validation. The business doc gates code behind Tests 0–2; we are building ahead of
that gate by explicit decision. Consequence: every unmeasured number (Appendix B, B1–B16) is
**venue configuration, never a constant.**

---

## 1. What it is

> Short, food-native games occupy the dead time in a restaurant visit, and that attention is used
> to move the menu — higher-margin items ordered more, dying items trialled, reviews captured at
> the right moment, return visits hooked.

The games are the surface. The product is a **prize engine** that decides *which menu item, at what
depth, through which mechanic, at which moment* — configured by margin, sales velocity and live
kitchen load.

**One number:** attach-rate delta — engaged/tented tables vs. same-night control tables, read from
the merchant's own POS.

---

## 2. The three windows

| Window | Guest state | Duration | Merchant value |
|---|---|---|---|
| **W1 · Queue** | Bored, flight risk | 5–30 min | Fewer walkaways; pre-orders that start the kitchen |
| **W2 · Food wait** | Ordered, phone out, receptive | 10–25 min | **Attach rate and mix shift** — the core window |
| **W3 · Bill wait** | Fed, warm, phone out | 5–15 min | Review capture; return-visit hook |

V1 is **W2-first**, with W3 shipping in M5. W1 is out of V1 scope.

---

## 3. Actors and surfaces

| Archetype | Surface | Route | Auth |
|---|---|---|---|
| **Guest** — the person scanning the QR | Mobile web, one-handed | `/t/[qrToken]` | None. Anonymous session cookie. Phone optional, at prize claim only |
| **Server / floor staff** | Their own phone or a shared tablet, PWA | `/floor` | Venue PIN → httpOnly session |
| **Chef / kitchen lead** | Tablet mounted at the pass, glanceable, big targets | `/pass` | Venue PIN, kitchen role |
| **Owner / F&B head** | Desktop or phone | `/dash` | Email magic link |

A fifth internal surface (`/admin`) exists for venue onboarding and is not a customer-facing product.

**Design rule per archetype**
- Guest: no accounts, no signup, no app. Under 100KB JS, interactive in under 2s on 3G. The
  competitor is Instagram Reels and it loads instantly.
- Server: never shown a dashboard or a metric. Only: what to do, at which table, right now.
- Chef: one control that matters (kitchen load) and one list (vetoes). Readable at a glance,
  mid-service, with wet hands.
- Owner: leads with one number. Everything else is secondary and collapsible.

---

## 4. V1 scope — three mechanics, two screens, one number

Locked per §12. Anything not on this list is out.

| # | Component | What ships |
|---|---|---|
| **#5** | Kitchen-timed round | Countdown fed by order-fired time + a 60–90s food quiz. "Your food is 7 minutes out — beat the kitchen." Manual-timer fallback when no POS |
| **#2** | Mystery plate | Win the right to *buy* a ₹99 kitchen's-choice small plate. A fixed-price product, never a draw. Chef veto honoured live |
| **#7** | Table-vs-table | Winner's table gets the dessert free, loser's at half. Both tables add an item; nobody leaves punished. Auto-disabled off-peak |
| **#12** | Beat-the-house | The async, solo, off-peak fallback for #7. Needs no second table |
| Screen | Voice review | At the bill: speak → draft → approve your own words → deep-link to Google. No incentive, prompted to every table |
| Screen | Server card | "3rd visit — ordered the Korean fried chicken twice." Not a game; routes data to a human at the right moment |
| Dashboard | One number | Attach-rate delta vs. same-night control + a Monday morning email |

**Ships in V1, not V2:** kitchen-load input and the chef veto switch (§5.2, §12). Pushing a dying
dessert at 9pm Saturday without them makes the chef the product's enemy by 9:15.

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
  mechanic,       // #5 | #2 | #7 | #12
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

## 6. POS — port and adapters (`core/pos`)

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

## 7. Compliance guardrails — enforced in code, not intention

§5.3 and §17.1 treat these as existential. Each is a test or a lint rule.

| Rule | Enforcement |
|---|---|
| **No pure chance** (§3.3) | `Math.random` and `crypto.getRandomValues` banned by ESLint inside `core/prize-engine` and `core/mechanics`. Test asserts outcome is a pure function of the skill input. Mystery plate is modelled as a fixed-price product, never a draw |
| **Review capture separated from rewards** (§5.3) | The review module is given no prize or award state — a module boundary, not discipline. Test asserts the prompt fires for 100% of sessions regardless of play, win, or sentiment. No rating is captured before hand-off, so gating is structurally impossible |
| **Venue's fences respected** | Property test: no chef-vetoed item, no item over its depth cap, no kitchen-work item while load is RED |
| **Control-arm integrity** | Control tables cannot open a session or receive an offer. Test asserts it |
| **DPDP siloing** (§5.3) | Phone stored as HMAC with a **per-venue salt**. No cross-venue join is possible in V1 by construction |
| **Consent** | Purpose-limited consent at first scan, before anything is recorded |

---

## 8. Data model

`Venue` · `Table` · `Service` · `TableArmAssignment` · `MenuItem` · `KitchenLoad` · `PrizePool` ·
`GuestSession` · `Play` · `Award` · `AddOnRequest` · `Ticket` · `GuestIdentity` · `Match` ·
`ReviewPrompt` · `QuizPack` / `QuizQuestion` · `StaffUser` · `OperatorUser`

Notes on the two that carry weight:

- **`TableArmAssignment`** (service, table, arm, swapAt) is a first-class row, never a computed
  guess. The same-night control is the entire evidentiary basis of the business, so the assignment
  must be recorded, auditable, and impossible to reconstruct favourably after the fact.
- **`ReviewPrompt`** stores funnel counts only — shown, drafted, handed off. No rating, ever.
  Storing sentiment would create the ability to gate on it.

---

## 9. Metrics and gates

**North star: attach-rate delta**, in percentage points, from the merchant's own POS.

**Reported two ways, and the difference matters.** §11 defines the delta as *engaged vs. control*.
Tables that choose to scan self-select — more receptive, more social, less rushed — so that number
includes guest disposition, not just product effect, and will show lift even if the product does
nothing. The alternating-table design only pays off measured as intent-to-treat.

| Reported as | Compares | Use |
|---|---|---|
| **ITT delta** | All tented tables vs. all untented tables | The honest number. Price against this. Show this to a buyer |
| **Engaged delta** | Scanned tables vs. untented tables | Shown with an explicit self-selection caveat. Never the headline |

| Metric | Definition | Gate |
|---|---|---|
| Attach-rate delta | pp difference, same service | ≥5pp to proceed |
| Ticket delta | % avg-ticket uplift | kill <4% · proceed ≥6% |
| Wait-window scan rate | scans ÷ tented waiting tables | kill <15% · good ≥25% |
| Completion rate | finished ÷ started | ≥60% |
| Add-on conversion | add-ons ÷ scanning tables | measure; no gate yet |
| Review velocity × | reviews/week during ÷ before | ≥2× |
| Match availability | matchable pairs per peak service | ≥1 to keep #7 |
| Plays per returning guest | trajectory across visits | watch the slope — content-decay warning |

Gates are **venue config**, seeded from the doc and editable in `/dash`.

---

## 10. Configuration, not constants

Every Appendix B number is seeded from the business doc's estimate and then editable per venue:
food-wait/prep times by category, margin bands, prize depth caps, mystery-plate price, quiz length,
countdown buffer, peak-hours definition, match-liquidity floor, and all §11 gates.

When T0/T1 eventually run, the numbers change. The code does not.

---

## 11. Architecture

```
src/
  app/
    (guest)/t/[qrToken]/   # guest mobile-web — no accounts
    (staff)/floor/         # server: fire order, add-on tickets, redemption, recognition card
    (kitchen)/pass/        # chef: kitchen load, veto list, tonight's pool
    (operator)/dash/       # owner: the one number, margin tagging, config
    api/
  core/
    prize-engine/          # pure, deterministic, unit-tested
    mechanics/             # #5 #2 #7 #12 rules — pure logic, no I/O
    measurement/           # arm assignment, ITT + engaged delta, gate evaluation
    pos/                   # port + Manual | CsvImport | Mock | vendor stubs
    consent/               # DPDP consent, phone hashing, venue siloing
  brand.ts                 # the name lives here and nowhere else
```

**Realtime is polling, not websockets.** Venue wifi is unreliable and serverless does not hold
sockets. Countdown (#5) and match state (#7) poll every 2s and are driven by a **server-issued end
timestamp**, so client clock skew and tab-suspend cannot desync a game. Animation is local; truth
is server-side.

**Stack:** Next.js 15 App Router · TypeScript strict · Postgres + Prisma · Vercel (incl. Cron for
the Monday email) · Resend · Vitest + Playwright.

---

## 12. Never built

Per §12's Never-Build list and Appendix A's graveyard. These stay dead including in brainstorms,
including under new names:

XP · levels · badges · global leaderboards · cross-venue identity · accounts-before-value ·
spin wheels / scratch cards / any pure-chance mechanic · incentivised or gated reviews ·
payment processing · discounts on hero items · licensed-property games without a licence ·
a native app.

---

## 13. Open decisions

| Decision | Status |
|---|---|
| Working name | `interlude` placeholder; isolated in `src/brand.ts` |
| Shared screen (#17) | Out of V1. V1.5 hardware pilot |
| Phone verification | Off by default. Redemption is staff-confirmed. DLT/WhatsApp approval is 1–3 weeks and does not belong on the critical path |
| Hindi strings | English-first, strings externalised from M0 so Hindi is a translation job, not a refactor |
| Repo location | **Settled:** `C:\Users\prana\OneDrive\Desktop\Code\interlude`, under OneDrive by explicit choice. The known cost stands — OneDrive sync causes `node_modules` file locks and slow installs — so `node_modules` **must** be kept out of sync before the first `npm install` (see M0) |
