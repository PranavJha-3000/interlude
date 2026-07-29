# Interlude — Build Sequence

**Three waves, staged ship.** Wave 1 deploys to a real venue at the 48-hour mark whether or not
the later waves have started. Each wave ends with a statement of **what each of the four archetypes
actually sees.**

This replaces the earlier M0–M6 sequence, which gated code behind the business doc's validation
tests. That gate is lifted by owner decision: we ship, run it at one venue, and validate from live
data instead. The rule that makes this recoverable is unchanged and absolute — **every unmeasured
number is venue configuration, never a constant.** When the real numbers arrive, we edit config.

## The four archetypes

| | Who | Where |
|---|---|---|
| 🍽️ **GUEST** | The person who scans the QR at the table | Their own phone, mobile web, no account |
| 🧑‍🍳 **SERVER** | Floor staff | Their phone or a shared tablet, `/floor` |
| 👨‍🍳 **CHEF** | Kitchen lead, at the pass | Mounted tablet, `/pass` |
| 💼 **OWNER** | Owner or F&B head — whoever owns the menu P&L | Desktop or phone, `/dash` |

---

## Wave 1 — the 48-hour ship gate

Everything here is load-bearing. This goes into a venue.

**Foundation**
- [x] **Keep `node_modules` out of OneDrive sync — before the first `npm install`.** Junction it to a non-synced path (`mklink /J node_modules C:\dev\interlude-node_modules`). Skipping this is what causes the `EPERM`/`EBUSY` locks and slow installs
- [x] Next.js 16 App Router + TypeScript strict + ESLint + Prettier + Tailwind (16 is what `create-next-app` ships now; 15 was the plan)
- [x] Prisma schema, Postgres (Neon), migrations
- [x] `src/brand.ts` — the product name lives here and nowhere else
- [x] Strings externalised from the first commit (English now, Hindi later without a refactor)
- [x] Seed: one Delhi casual-dining venue — ~40 items with margin tier, price, food cost and prep burden; 30 tables
- [ ] QR token generation; printable table-tent page
- [x] Guest session model; DPDP purpose-limited consent gate at first scan
- [ ] Vercel deploy

**The core loop — #5 kitchen-timed round**
- [x] Quiz engine: question packs, 60–90s rounds, scoring — pure, no I/O
- [x] Countdown driven by a **server-issued end timestamp**; local animation, and with multiplayer cut it needs no polling at all
- [ ] Manual POS adapter — "order fired" from the floor + per-category prep times
- [x] Prize engine v1: margin tier + chef veto + depth cap. Every decision carries a `reason`
- [x] Outcome screens — win and lose both end in guaranteed value, never a dead end
- [x] One-tap add-on → relayed to the floor device
- [ ] Staff redemption: guest shows the end screen, staff confirms. **No OTP on the critical path**
- [x] ~~Performance budget: <100KB JS on the guest route~~ — **measured and revised.** An empty App Router page ships 181.7KB gzipped; the full guest route ships 184.5KB, so our own code is ~3KB of it. The framework floor cannot be optimised away. New rule: **our code adds ≤15KB over the floor**, 200KB regression ceiling. Accepted for V1; revisit if scan rate lands under the 15% kill line (PLATFORM.md §11)

**Chef control — pulled forward from the old M3**
- [ ] One large GREEN / AMBER / RED kitchen-load control; RED instantly suppresses every prize needing kitchen work
- [ ] Per-item veto toggles, effective on the next guest
- [ ] Tonight's pool listed with its `reason` strings

**Owner benefit — visible on night one**
- [ ] Dashboard tier 1: add-on gross ₹, add-on contribution ₹, prize cost ₹, and **net contribution ₹** as the headline
- [ ] Labelled as an app-side estimate. Tier 2 (POS-verified) arrives in wave 2 and takes over the headline

**Measurement plumbing — recording only, the maths lands in wave 2**
- [x] Arm assignment: alternating tables, recorded per service, mid-service swap, auditable
- [x] Control tables cannot open a session — enforced and tested
- [x] Timestamped `Play` / `Award` / `AddOnRequest` events

**Quality floor**
- [x] ESLint no-RNG rule inside `core/prize-engine` and `core/mechanics`
- [x] Unit tests on the prize engine and quiz scoring
- [ ] One Playwright happy path: scan → play → win → redeem, mobile viewport

**Behind at hour 40? Drop in this order:** printable tent page → chef veto toggles (keep the load
switch) → dashboard secondary counters. **Never drop:** the consent gate, the arm assignment, the
redemption path.

**What each archetype sees**

| | |
|---|---|
| 🍽️ GUEST | Scan a printed tent → one line of plain-language consent, **Continue**, nothing recorded before that tap → **"Your food is about 7 minutes out. Beat the kitchen."** → a 60–90s food quiz racing the countdown → *"You beat the kitchen — your tiramisu is on the house. Show this to your server."* or a guaranteed consolation of lesser depth → **"Add a dessert to your order?"**, three options, one tap → *"Sent to your server."* The prize is a named menu item chosen by margin tier. Never asked to sign up, download, or type an email |
| 🧑‍🍳 SERVER | A live table list: seated · order fired · playing · **add-on requested** · **awaiting redemption**, plus which tables are tented tonight. Taps **Fire order** when food goes in. Add-on tickets arrive with a sound: *"Table 7 — 1× Tiramisu"* → **Ack**. Redemption: *"Table 7 claims: Tiramisu, free"* → **Confirm**. No metrics, no dashboard |
| 👨‍🍳 CHEF | **The pass console, from night one.** One big **GREEN / AMBER / RED** control — RED instantly stops every prize needing kitchen work. Tonight's pool with reasons: *"Tiramisu — high margin, 4 unsold since Tuesday."* A veto toggle beside each item |
| 💼 OWNER | One number, large: **"Net contribution tonight: ₹2,340."** Add-ons sold, contribution earned, prize cost conceded. Captioned as an app-side estimate until the first bill export lands |

---

## Wave 2 — measurement truth + the mystery plate (day 3–4)

- [ ] CSV bill-import adapter (end-of-day POS export) — unblocks measurement without vendor APIs
- [ ] **ITT delta** (tented vs untented) and **engaged delta** (scanned vs untented), both computed
- [ ] Scan rate, completion rate, add-on conversion, ticket delta
- [ ] Gate evaluation against §9 thresholds, all venue-configurable
- [ ] Dashboard tier 2 promoted to the headline; engaged delta shown separately and captioned
- [ ] Monday 09:00 email via Vercel Cron + Resend
- [ ] **#2 Mystery plate** — a fixed-price product, never a draw, no RNG in the outcome path
- [ ] Chef nominates tonight's mystery plate from near-spoilage stock
- [ ] Full prize engine: velocity input, depth caps, load-aware suppression
- [ ] Owner config UI: margin tagging, depth caps, mystery-plate price, prep times, gates
- [ ] Property tests: never a vetoed item, never over a depth cap, never kitchen work while RED
- [ ] Seeded synthetic Saturday with known ground-truth lift, asserted end-to-end

**What each archetype sees**

| | |
|---|---|
| 🍽️ GUEST | Can now win the right to buy the ₹99 kitchen's-choice plate. Framed as luck and a fixed price — never a wheel, never a draw. Offers quietly stop appearing when the kitchen is slammed; the guest never learns why |
| 🧑‍🍳 SERVER | Mystery-plate claims appear in the redemption queue with tonight's actual dish, so there is nothing to ask the kitchen about |
| 👨‍🍳 CHEF | A field to nominate tonight's mystery plate from what would otherwise be thrown away |
| 💼 OWNER | **The real number.** *"Dessert attach rate: +6.2pp on tented tables vs. control, same service."* Beneath it: ticket delta, scan rate, completion, add-on conversion. The engaged-vs-control number is shown separately, captioned *"scanners choose to scan — treat as an upper bound."* Uploads last night's bill export; sees which tables were control and when the sets swapped. A Monday 9am email with the same numbers. Every promoted item shows why it was chosen; every excluded item shows why it was not |

---

## Wave 3 — voice review + Saturday hardening (day 5–6)

- [ ] Voice drafting via Web Speech API; typed fallback (iOS Safari support is partial)
- [ ] Approve-your-own-words, then deep-link to Google `writereview`
- [ ] Prompted to **every** table regardless of play, win, or sentiment — no incentive, no gating
- [ ] Module boundary test: the review module cannot read prize or award state
- [ ] Review-velocity tracking, before vs. during
- [ ] Offline and flaky-wifi tolerance across the whole guest flow
- [ ] Every dead end and error state designed, not defaulted
- [ ] Load test at peak concurrency for one venue
- [ ] Staff briefing print pack, including the one scripted line: *"Scan it while you wait — you might win dessert"*
- [ ] Operator runbook; paper log fallback for when something breaks at 9pm Saturday
- [ ] Full Playwright pass on a real mobile viewport

**What each archetype sees**

| | |
|---|---|
| 🍽️ GUEST | At the bill: *"How was it? Talk instead of typing."* Speaks a sentence, sees it drafted, edits freely, taps to open Google and post from their own account. Nothing is offered in return, and the prompt is identical whether they loved it or hated it. The whole product now survives a dead zone by the window, a locked screen, a switched app, and a phone with 4% battery |
| 🧑‍🍳 SERVER | A 15-minute briefing, one line to say, one WhatsApp group for when something breaks. Redemption still works on paper if the network dies |
| 👨‍🍳 CHEF | A veto list signed off before launch, mystery-plate supply agreed, peak-load rules set |
| 💼 OWNER | Review velocity, before vs. during. The hand-off drop to Google is shown honestly — there is no third-party write API, by design |

---

## Deferred, not cancelled

- **Server recognition card** — *"Table 12 — 3rd visit — ordered the Korean fried chicken twice."* Needs optional phone capture with per-venue HMAC. Arguably the most valuable non-game thing in the product; it came out of wave scope only for time
- **`/admin` venue onboarding** — one pilot venue is seeded from JSON. Needed before a second venue
- **W1 queue window** and the **shared screen** — unchanged, still out

## Not built

XP · levels · badges · global leaderboards · cross-venue identity · accounts-before-value ·
spin wheels / scratch cards / any pure-chance mechanic · incentivised or gated reviews ·
payment processing · discounts on hero items · licensed-property games without a licence ·
a native app · the W1 queue window · the shared screen (V1.5) ·
**multiplayer of any kind — #7 table-vs-table and #12 beat-the-house are cut. New mechanics are
single-player.**
