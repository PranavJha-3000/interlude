# Interlude — Build Sequence

Sequential. Each milestone is independently reviewable and ends with a statement of **what each of
the four archetypes actually sees.** Do not start a milestone before the one above it is verified.

**M1 + M2 together are the first venue-runnable unit** — they alone produce all four of the
business doc's Appendix C numbers.

## The four archetypes

| | Who | Where |
|---|---|---|
| 🍽️ **GUEST** | The person who scans the QR at the table | Their own phone, mobile web, no account |
| 🧑‍🍳 **SERVER** | Floor staff | Their phone or a shared tablet, `/floor` |
| 👨‍🍳 **CHEF** | Kitchen lead, at the pass | Mounted tablet, `/pass` |
| 💼 **OWNER** | Owner or F&B head — whoever owns the menu P&L | Desktop or phone, `/dash` |

---

## M0 — Foundation

- [x] Decide repo location — `C:\Users\prana\Code\interlude`, outside OneDrive sync
- [ ] Next.js 15 + TypeScript strict + ESLint + Prettier
- [ ] Prisma schema, Postgres (Neon/Supabase), migrations
- [ ] `src/brand.ts` — the product name lives here and nowhere else
- [ ] Strings externalised from day one (English now, Hindi later without a refactor)
- [ ] Seed: a realistic Delhi casual-dining venue — ~40 items, ~6 real sellers, margin tiers, 30 tables
- [ ] Venue + table setup; QR token generation; printable table-tent PDF
- [ ] Guest session model; DPDP purpose-limited consent gate at first scan
- [ ] Vercel deploy + preview environments; CI running lint and tests

**What each archetype sees**

| | |
|---|---|
| 🍽️ GUEST | Scans a printed tent → a venue-branded page with one line of plain-language consent and a **Continue** button. Nothing is recorded before that tap. Then: "Coming soon." |
| 🧑‍🍳 SERVER | Nothing yet |
| 👨‍🍳 CHEF | Nothing yet |
| 💼 OWNER | Nothing yet |

---

## M1 — The core loop (#5 Kitchen-timed round)

The first milestone with a working product.

- [ ] Quiz engine: question packs, 60–90s rounds, scoring — pure, no I/O
- [ ] Countdown driven by a **server-issued end timestamp**; 2s poll; local animation
- [ ] Manual POS adapter — "order fired" from the floor + per-category prep times
- [ ] Minimal prize engine: margin tier + chef veto (velocity and load arrive in M3)
- [ ] Outcome screens — win and lose both end in guaranteed value, never a dead end
- [ ] One-tap add-on → relayed to the floor device
- [ ] Staff redemption: guest shows the end screen, staff confirms. **No OTP on the critical path**
- [ ] Performance budget enforced in CI: **<100KB JS on the guest route, interactive <2s on 3G**

**What each archetype sees**

| | |
|---|---|
| 🍽️ GUEST | Scan → consent → **"Your food is about 7 minutes out. Beat the kitchen."** → a 60–90s food quiz racing the countdown → outcome: *"You beat the kitchen — your tiramisu is on the house. Show this to your server."* or a guaranteed consolation of lesser depth → **"Add a dessert to your order?"** three options, one tap → *"Sent to your server."* The prize is a named menu item chosen by margin tier; the Mystery Plate does not exist until M3. Never asked to sign up, download, or type an email |
| 🧑‍🍳 SERVER | A live table list: seated · order fired · playing · **add-on requested** · **awaiting redemption**. Taps **Fire order** when food goes in (starts the countdown). Add-on tickets arrive with a sound: *"Table 7 — 1× Tiramisu"* → **Ack**. Redemption: *"Table 7 claims: Tiramisu, free"* → **Confirm**. No metrics, no dashboard — only what to do, at which table, now |
| 👨‍🍳 CHEF | Nothing yet — **and this is the known risk.** Prizes are being promoted with no kitchen control until M3. Run M1 on quiet services only, or move M3 forward |
| 💼 OWNER | Nothing yet |

---

## M2 — Measurement (the renewal engine)

- [ ] Arm assignment: alternating tables, recorded per service, mid-service swap, auditable
- [ ] Control tables cannot open a session — enforced and tested
- [ ] CSV bill-import adapter (end-of-day POS export) — unblocks measurement without vendor APIs
- [ ] **ITT delta** (tented vs untented) and **engaged delta** (scanned vs untented), both computed
- [ ] Scan rate, completion rate, add-on conversion, ticket delta
- [ ] Gate evaluation against §11 thresholds, all venue-configurable
- [ ] Operator dashboard leading with one number
- [ ] Monday 09:00 email via Vercel Cron + Resend
- [ ] Seeded synthetic Saturday with known ground-truth lift, asserted end-to-end

**What each archetype sees**

| | |
|---|---|
| 🍽️ GUEST | No change. Guests on control tables have no tent and see nothing at all — that is the point |
| 🧑‍🍳 SERVER | Table list now marks which tables are tented tonight, so tents get placed correctly and the swap happens on time. No numbers |
| 👨‍🍳 CHEF | Nothing yet |
| 💼 OWNER | **The dashboard.** One number, large: *"Dessert attach rate: +6.2pp on tented tables vs. control, same service."* Beneath it: ticket delta, scan rate, completion, add-on conversion. The engaged-vs-control number is shown separately and captioned *"scanners choose to scan — treat as an upper bound."* Upload last night's bill export; see which tables were control and when the sets swapped. A Monday 9am email with the same four numbers |

---

## M3 — #2 Mystery plate + the chef console

- [ ] Mystery plate as a fixed-price product — never a draw, no RNG in the outcome path
- [ ] Chef console at the pass: kitchen load GREEN / AMBER / RED, one large control
- [ ] Per-item veto toggles with instant effect on the live pool
- [ ] Wastage / near-spoilage nomination feeding mystery-plate supply
- [ ] Full prize engine: velocity input, depth caps, load-aware suppression
- [ ] `reason` strings surfaced in both the chef and owner UIs
- [ ] Property tests: never a vetoed item, never over a depth cap, never kitchen work while RED

**What each archetype sees**

| | |
|---|---|
| 🍽️ GUEST | Wins the right to buy the ₹99 kitchen's-choice plate. Framed as luck and a fixed price — never a wheel, never a draw. Offers quietly stop appearing when the kitchen is slammed; the guest never learns why |
| 🧑‍🍳 SERVER | Mystery-plate claims appear in the redemption queue with tonight's actual dish, so there is nothing to ask the kitchen about |
| 👨‍🍳 CHEF | **The pass console.** One big **GREEN / AMBER / RED** control — RED instantly stops every prize needing kitchen work. Tonight's pool listed with reasons: *"Tiramisu — high margin, 4 unsold since Tuesday."* A veto toggle beside each item, effective on the next guest. A field to nominate tonight's mystery plate from what would otherwise be thrown away. Readable at a glance, mid-service |
| 💼 OWNER | The pool now explains itself — every promoted item shows why it was chosen and every excluded item shows why it was not. Margin tagging, depth caps, and mystery-plate price are editable |

---

## M4 — #7 Table-vs-table + #12 Beat-the-house

- [ ] Match lobby and pairing; server-authoritative match state; 2s poll
- [ ] Both-tables-win stakes: winner free dessert, loser half price — cost capped, nobody punished
- [ ] Match-liquidity detection against the configured floor (≥1 pair per peak service)
- [ ] Automatic fallback to #12 beat-the-house off-peak, solo, and at the bar
- [ ] Graceful handling when the opponent abandons mid-match

**What each archetype sees**

| | |
|---|---|
| 🍽️ GUEST | At peak: *"Table 12 wants to play. 90 seconds. Winner's dessert is free, yours is half price either way."* Live opponent score. Nobody ends the round with nothing. Off-peak, alone, or at the bar, the same round runs solo against the house — and it never looks like a consolation for having no opponent |
| 🧑‍🍳 SERVER | Two redemptions arrive from one match: one free dessert, one half price. Both tables added an item, so the queue makes sense on its own |
| 👨‍🍳 CHEF | Match prizes obey the same load and veto rules. RED suppresses them like everything else |
| 💼 OWNER | Match availability tracked per service against the liquidity floor — the number that decides whether #7 stays in the product at all |

---

## M5 — Window 3 (voice review + server recognition card)

- [ ] Voice drafting via Web Speech API; typed fallback (iOS Safari support is partial)
- [ ] Approve-your-own-words, then deep-link to Google `writereview`
- [ ] Prompted to **every** table regardless of play, win, or sentiment — no incentive, no gating
- [ ] Module boundary test: the review module cannot read prize or award state
- [ ] Optional phone capture, consent-gated, per-venue HMAC — never cross-venue
- [ ] Server recognition card: visit count and past items, surfaced at the table
- [ ] Review-velocity tracking, before vs. during

**What each archetype sees**

| | |
|---|---|
| 🍽️ GUEST | At the bill: *"How was it? Talk instead of typing."* Speaks a sentence, sees it drafted, edits freely, taps to open Google and post from their own account. Nothing is offered in return, and the prompt is identical whether they loved it or hated it. Optionally leaves a number so the place remembers them next time — clearly explained, easily declined |
| 🧑‍🍳 SERVER | **"Table 12 — 3rd visit — ordered the Korean fried chicken twice."** The single most valuable thing in the product, and it is not a game. Recognition without having to remember |
| 👨‍🍳 CHEF | No change |
| 💼 OWNER | Review velocity, before vs. during, read from their own Google profile. The hand-off drop to Google is shown honestly — there is no third-party write API, by design |

---

## M6 — Saturday hardening

- [ ] Offline and flaky-wifi tolerance across the whole guest flow
- [ ] Every dead end and error state designed, not defaulted
- [ ] Load test at peak concurrency for one venue
- [ ] Staff briefing print pack, including the one scripted line: *"Scan it while you wait — you might win dessert"*
- [ ] Operator runbook; paper log fallback for when something breaks at 9pm Saturday
- [ ] Full Playwright pass on a real mobile viewport
- [ ] Launch-night checklist from §13.1: baseline weekend measured **before** launch

**What each archetype sees**

| | |
|---|---|
| 🍽️ GUEST | The same product, but it survives a dead zone by the window, a locked screen, a switched app, and a phone with 4% battery. Nothing ever ends in a blank screen |
| 🧑‍🍳 SERVER | A 15-minute briefing, one line to say, one WhatsApp group for when something breaks. Redemption still works on paper if the network dies |
| 👨‍🍳 CHEF | A veto list signed off before launch, supply for the mystery plate agreed, peak-load rules set |
| 💼 OWNER | A measured baseline weekend before anything goes live — no baseline, no attribution, no renewal argument. Then the four numbers against it |

---

## Not built

XP · levels · badges · global leaderboards · cross-venue identity · accounts-before-value ·
spin wheels / scratch cards / any pure-chance mechanic · incentivised or gated reviews ·
payment processing · discounts on hero items · licensed-property games without a licence ·
a native app · the W1 queue window · the shared screen (V1.5).
