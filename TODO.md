# Interlude — Build List

Every restaurant already has a QR code on the table. It opens a PDF menu and does nothing else.
We replace it with one that plays a 3-minute game while the food cooks, sells a dessert, and tells
the owner what it earned him. That is the whole pitch.

**Launch moved out by one week.** The extra week buys two things: menu upload, so a venue can set
itself up in ten minutes instead of an hour, and enough venues to make one weekend's numbers mean
something.

---

## The pilot

**4–6 venues, one weekend, same two nights.** Not one venue. One venue cannot produce a number worth
showing anyone — see below.

Each venue: signs itself up, uploads its menu, prints its QR, runs Friday and Saturday dinner. Half
the tables tented, half not, alternating. We are not in the room.

---

## What one small weekend can and cannot prove

This decides the whole build, so it goes first.

| Kind of number | Example | What a weekend gives |
|---|---|---|
| **Counts** | Add-ons sold, contribution earned, prize cost, net ₹ | **Exact.** Every row is a real confirmed sale. No statistics needed — 20 add-ons is 20 add-ons |
| **Rates** | Scan rate, completion rate, add-on conversion | **Usable.** ~200 tented tables pooled across venues gives roughly ±6 percentage points. Good enough to report |
| **Deltas** | Attach-rate delta, ticket delta | **Not yet.** Detecting a 5pp lift needs ~1,000 tables per arm. A weekend has ~200. It can only catch a very large effect |

So the MLP proves three things, and claims nothing else:

1. **Guests play.** Scan rate and completion rate, with an honest margin of error.
2. **It sells food.** A ledger of confirmed add-ons and awards in rupees, counted not estimated.
3. **The kitchen stays in control.** Vetoes used, load flipped, nothing forced past the chef.

The attach-rate delta is still computed, still shown, and **labelled "not yet conclusive" until the
numbers support it.** Every weekend adds to it. Do not let anyone put it on a slide before then.

**Why more venues.** Pooling four venues is the only way a single weekend reaches even the rate
numbers. It also kills the "that one place is unusual" objection, which is the first thing a buyer
says.

---

## Rules that do not bend

- **No pure chance.** No wheels, no draws, no `Math.random` in `core/`. Outcomes come from skill
  only. This is gambling law, not taste.
- **No number is hardcoded.** Prep times, margins, caps, prices, gates — all venue config, editable
  in `/dash`. When real numbers arrive we edit config, not code.
- **`core/` is pure.** No database, no clock, no network, no AI. Everything is an argument.
- **AI never decides anything.** It reads and drafts; a person confirms. Details in the AI section.
- **Every operator query gets its venue from the session**, never from a URL or a form field.
- **Reviews are never gated on sentiment**, and no rating is ever stored.
- **A control table must fail exactly like a closed venue.** If a guest can tell, the experiment is
  contaminated.

---

## Done

Guest, staff and owner surfaces all run end to end. 393 unit tests, 33 E2E tests, green.

- **Guest** — venue QR → table picker → consent → Beat the Kitchen → win or lose → add-on → done.
  Countdown driven by a server timestamp, so a suspended tab cannot desync it.
- **Staff** — `/floor/[venueSlug]`, PIN-scoped to that venue. Fire order with party size, add-on
  tickets, redemption by code. `/pass` — kitchen load, per-item vetoes, and a kill switch separate
  from RED.
- **Owner** — `/signup` → `/onboarding` (six resumable steps) → `/dash`. Net contribution ₹ as the
  headline with both tiers shown separately, the refusal log, `/dash/activity`, `/dash/games`,
  `/tents`.
- **Engine** — prize pool with a `reason` on every decision and every refusal, venue-owned prize
  rules, hero and veto and depth-cap fences above them, pool snapshotted per service.
- **Measurement** — append-only `Event` log written by the real flow, service arm assignment,
  counterbalanced scheduling, §6.3 metrics, bill-export parser, weekly report.
- **Tenancy** — two seeded venues, isolation asserted by test. Staff PINs are venue-scoped, which
  fixed a real hole where a PIN opened the wrong restaurant.

---

## Build

### 1. Menu upload — the onboarding unlock

**Why.** Today a venue types 40 items by hand, one at a time. That is an hour, and it is where
setup gets abandoned. Ten minutes instead is the difference between 6 pilot venues and 1.

**Build**
- `/onboarding` menu step accepts a **photo, a PDF, or a CSV**. CSV parses deterministically —
  no AI. Photo and PDF go to the extractor.
- Extractor returns a **draft table**: name, category, price, and any options it saw
  ("Paneer Tikka — Half ₹220 / Full ₹380" becomes two rows, or one row with options).
- Draft lands in an editable grid. **Nothing is saved until the operator hits confirm.**
- Food cost is **not** extracted. The operator gives one rough percentage per category
  ("desserts, about 30%?") and we compute cost per item. A guessed food cost is a wrong
  contribution number, and contribution is the headline.
- Margin tier is computed from price and cost, not asked.
- `requiresKitchenWork`, `isHero`, `prepBurden` default sensibly and are toggled in the grid.
- Same upload path works later at `/dash/menu` for re-imports.

**Test**
- A fixture menu photo extracts ≥90% of items with the right price.
- A CSV import needs zero AI calls — assert the adapter is never invoked.
- Confirm writes items; abandoning the draft writes nothing.
- ₹249.50 stores as `24950`. A rounding bug here is money.
- An extraction that returns garbage shows an error and the manual form, never a broken grid.

### 2. `/dash/menu` — maintain it afterwards

**Build**
- List, add, edit, deactivate. No hard deletes — `Award` rows point at items.
- Every field the engine reads is editable. Contribution per item shown live as they type.
- Bulk re-upload through the same path as step 1.

**Test**
- Mark an item hero → `decidePrizePool` excludes it with a hero reason.
- Deactivate an item with a confirmed award → the award still renders on `/dash`.
- Edit an item, reload `/pass`, the pool and its reasons change.

### 3. `/dash/prizes` — the fences

**Build**
- Every `VenueConfig` field, grouped and explained in plain words: round shape, depth caps,
  prep minutes per category, peak window, the gates.
- Read-only "tonight's pool" from the same call `/pass` makes, with every reason and every refusal.
- Chef vetoes visible and clearable here too.

**Test**
- Depth cap per service to 0 → every item excluded with a cap reason.
- Load RED → every kitchen-work item disappears.
- Change a category's prep minutes → the ready estimate moves by that amount.

### 4. The pooled pilot report

**Why.** Four venues' numbers have to add up into one view, and no operator may see another
operator's data.

**Build**
- `scripts/pilot-report.mts` — a script, not a screen. No new auth surface, no leak risk.
- Prints, pooled and per-venue: tables tented, scan rate, completion rate, add-on conversion,
  confirmed add-ons, contribution, prize cost, net.
- Rates carry a 95% confidence interval. Deltas carry one too, plus the words
  **"not yet conclusive"** until the interval excludes zero.

**Test**
- Seeded synthetic weekend with a known ground-truth lift, asserted end to end.
- A pooled rate with n=200 reports an interval of roughly ±6pp.
- A delta whose interval spans zero is labelled inconclusive. Assert the label.

### 5. Bill import, for real

**Build**
- Upload screen for the end-of-day POS export. The parser already exists.
- `PosTableMap` editing UI so unjoinable rows can be mapped by hand instead of dropped.
- Historical baseline import writing `HistoricalService`.
- Once a venue's export lands, tier 2 takes the headline from tier 1.

**Test**
- Import a known file, assert ticket count and totals.
- Re-import the same file, assert nothing doubles.
- An unjoinable row surfaces with a reason and is never silently dropped.
- **Run it against a real export from a real pilot venue.** Not a fixture. The parser has never
  seen an actual file.

### 6. Review at the bill

**Build**
- Prompt screen at the end of the visit. Speak or type → draft → **approve your own words** →
  deep-link to Google.
- Fires for **every** table. No incentive, no reward, no rating stored ever.
- `ReviewPrompt` writes funnel counts only: shown, drafted, handed off.

**Test**
- Prompt renders for a session that never played and for one that lost.
- Static import check fails the build if the review module ever reads prize or award state.
- Assert no rating column exists anywhere.

### 7. Retire the old games

**Build**
- Delete the climb and the mystery plate. The spec ships one game and Beat the Kitchen works.
- Remove the stake picker, collapse `VenueGame` to the one mechanic, drop the dead config columns.

**Test**
- Full E2E suite green with one mechanic. No route offers a choice.

### 8. Ship it

**Build**
- Create the Vercel project. `vercel.json` and the cron are already committed.
- Build command: `prisma generate && prisma migrate deploy && next build`.
- Set `DATABASE_URL` (pooled), `DIRECT_URL` (unpooled), `SESSION_SECRET`, `NEXT_PUBLIC_BASE_URL`,
  `RESEND_API_KEY`, `EMAIL_FROM`, `ANTHROPIC_API_KEY`. All fail loudly at boot if missing.
- Functions pinned to `sin1` — the database is in Singapore.
- The Monday cron is UTC. `30 3 * * 1` is 09:00 IST. A venue outside IST needs its own handling.

**Test**
- Deploy, seed, open `/t/<token>` on a real phone, not an emulator.
- Print a tent sheet and scan it off paper.

---

## AI — what we use it for

**The rule: AI reads and drafts. A person confirms. It never decides.**

It lives in `src/lib/ai/` behind an adapter, exactly like the POS port, with a Mock for tests.
**It never goes in `core/`** — an LLM is nondeterministic, and nondeterminism anywhere near an
outcome breaks the no-pure-chance guarantee that keeps this legal.

| Use | When it runs | Rough cost | Who confirms |
|---|---|---|---|
| **Menu extraction** from photo or PDF | Once per venue at setup | A few rupees | Operator, in the draft grid |
| **Monday email in plain language** — turns the week's numbers into three sentences | Weekly per venue | Under ₹1 | Nobody; it only narrates numbers already computed |
| **Review drafting** — tidies what the guest said into readable prose | Per review | Under ₹1 | The guest, before it is sent |
| **Item descriptions** for tents and guest cards | Once per item | A few paise | Operator |

Cheap model for all of it. Extraction is transcription, which is the thing these models are
actually reliable at — we are not asking one to have an opinion.

**Where it is banned outright:** choosing a prize, choosing a pair, deciding an outcome, writing a
food cost, or reading a rating. The first three are the gambling line. The fourth is money. The
fifth is the review boundary.

**What we charge for.** Setup is included and it is the demo — an owner watching their menu appear
from a photo is the moment they believe the rest. The weekly plain-language report is the recurring
hook. Pricing is not decided.

---

## Later

- Server recognition card — *"Table 12, 3rd visit, ordered the fried chicken twice."* Needs
  optional phone capture with the per-venue HMAC. Wanted; cut for time, not doubt.
- Offline tolerance across the guest flow.
- Every dead end and error state designed rather than defaulted.
- Load test at peak for one venue.
- Staff briefing pack, including the line: *"Scan it while you wait — you might win dessert."*
- Operator runbook and a paper fallback for when something breaks at 9pm Saturday.
- Hindi. Strings are already externalised, so it is a translation job.
- Design system: IBM Plex Mono for every figure on guest and staff surfaces too, not just operator.
- `PosAdapter` sits in `lib/pos`, PLATFORM.md §6 says `core/pos`. It does I/O so `lib` is right —
  amend the doc.

---

## Never build

XP · levels · badges · leaderboards · cross-venue identity · accounts before value ·
spin wheels · scratch cards · any pure-chance mechanic · incentivised or gated reviews ·
payment processing · discounts on hero items · unlicensed licensed-property games ·
a native app · multiplayer of any kind · the queue-window game · the shared screen.

Including in brainstorms. Including under new names.
