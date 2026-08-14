# UI Revamp — running notes

The brief is [REVAMP-BRIEF.md](REVAMP-BRIEF.md). The plan is
[superpowers/plans/2026-08-14-ui-revamp.md](superpowers/plans/2026-08-14-ui-revamp.md).
This file records three things as the work happens: **what was removed and why** (the brief's
Part 9 subtraction ledger), **where the brief and the repo disagreed and how each conflict was
resolved**, and **proposals made where the brief is silent**. Nothing here is a decision the
brief already made.

---

## Conflicts found before the first line of interface code

Recorded per Part 10: "Where this brief conflicts with the build spec on anything other than
visual craft, the build spec wins and you tell me about the conflict."

1. **Part 7's premise does not match the shipped pairing.** The brief: "The winner stays on
   screen, and the winner is by definition the higher seller." The code
   (`src/core/game/pairing.ts`): `dealPair` draws an **independent fresh pair every round** —
   uniformly from all unseen eligible pairs, seeded from `(tableRunId, questionIndex)`. There is
   no incumbent and no survivor, so the tap-the-survivor exploit cannot occur as described.
   **The underlying hole is still real in a different form:** on a top-heavy sales
   distribution, "tap the dish everyone knows" wins most eligible pairs, and the gap ratio
   (default 2.0) makes those pairs *more* guessable, not less. The reachable-depth analysis and
   the pAbove design are being prepared as the brief asks, but the parameter only makes sense
   attached to a winner-stays presentation the product does not currently have — so nothing is
   implemented past a disabled-by-default config value until the analysis has been seen.

   **Analysis run 2026-08-14** (`scripts/ladder-depth.mts`, deterministic, rerunnable — rerun
   it against the real menu the moment the import wave lands):

   - *Pilot seed menu* (40 items): 393 defensible pairs at gap 2.0. Longest ≥2× chain — the
     winner-stays reachable rung ceiling — is **3 of a 6-rung ladder**. **Caveat that softens
     this:** the seed's trailing sales are exactly three tiers (40 / 8 / 1), so chain length 3
     is a seed artifact; a real export's continuous distribution supports chains near
     log₂(top÷bottom). The ceiling number that matters can only come from a real menu.
   - *Today's independent dealer, exploit simulated* (guest with fame-prior accuracy `a`,
     perfect memory of reveals, transitive inference; 2,000 runs): a = 0.7 → reaches rung 6 in
     13% of runs; a = 0.8 → 27%; a = 0.9 → **54% of runs reach rung 6** (median streak 6,
     p90 21). The brief's cap-drain fear is real on the shipped dealer too — the exploit is
     fame priors plus memory, not survivor-tapping.
   - *The brief's pAbove(streak) fix*, if winner-stays is adopted: a flat ⅓ gives the
     always-tap-incumbent strategy exactly 0.67 per round (expected streak 2.0); rising curves
     (e.g. 0.15 + 0.06·s capped at 0.5) give 0.85 → 0.55 across rungs 1–6, expected streak 2.8.
     Every curve buys exploit resistance by lowering the reachable ceiling — the tension the
     brief predicted, now with numbers attached.
   - *A third option surfaced by the analysis*, for the owner to weigh: keep the shipped
     independent dealer (no winner-stays, no ceiling) and counter the fame exploit by biasing
     deep-streak draws toward pairs of *less-sold* items — still ≥ the gap ratio, but drawn
     from the menu's obscure middle where fame priors decay toward a coin flip. Deterministic,
     seeded, one config curve, and it attacks the actual exploit rather than the assumed one.
   - *Copper seed venue*: six items, all with identical sales — zero defensible pairs, the
     game cannot deal a single question. Fixture artifact, but it demonstrates the ABANDONED
     path is load-bearing for real venues with flat sales history.

   *(Status: numbers computed and surfaced; NOTHING tuned or implemented in
   `core/game/pairing.ts`. Decision owed by the owner: winner-stays + pAbove as briefed,
   the mid-tail bias alternative, or hold until a real menu import re-runs the script.)*

2. **The accent ledger differs by one entry.** UI-SPEC.md §5 reserves accent use 3 for "the
   single primary CTA on the landing page **and on each onboarding step**"; the brief reserves
   it for the landing CTA only, with the onboarding *stepper's active step* as use 4. Resolved
   in the brief's favour (visual craft is the brief's domain): onboarding step CTAs become
   standard ink primary buttons (their pressed state stays accent — that is use 2), the active
   step marker keeps accent. UI-SPEC.md §5 will be edited to match when the onboarding surface
   is touched.

3. **UI-SPEC.md disagrees with itself on the guest ground.** §5 says clay (`warm`) is the guest
   ground; the §8 per-surface table says `paper` for `/v` and `/t`; the code ships paper
   (`html,body` background, never overridden on guest routes). The brief settles it: **clay for
   the guest phone**. §8's table gets corrected when the guest surface lands.

4. **UI-SPEC.md §4 disagrees with itself on the landing h1 face.** The type table says the
   landing display is Plex Sans at `clamp(2.5rem, 6vw, 4.5rem)`; the four-places list sanctions
   Instrument Serif for "the landing wordmark and the one h1", and the code ships Instrument.
   Resolved: the four-places list wins (it is the rule the brief re-states). The table gets
   corrected at Surface 6. The landing **steps h2 in `font-display`** (`page.tsx:61`) is a
   fifth use and comes off.

5. **PLATFORM.md §4 still describes the climb and the mystery plate.** TODO.md's Done list is
   the truth pass: one game, Beat the Kitchen. No code change; noting the doc drift.

6. **The brief's floor header is "floor, venue name, clock" and a read-only load switch.**
   Neither exists today (`/floor` never reads `KitchenLoad`). Built at Surface 4 as specified —
   no conflict, just new.

## Defects found by reconnaissance, fixed inside their surfaces

Not visual, but the brief's "real data, real polling, real degradation behaviour" makes them
revamp scope. Each carries its test.

- **Redemption codes collide by construction** (`src/lib/prize-award.ts:115`): the code
  generator passes a closure that ignores loop position, so all five characters of every code
  are the same character — a 26-code keyspace against a globally `@unique` column. The second
  colliding award fails the insert *at the table, at the "show this to your server" moment*.
  → Surface 2 (claim path), with a uniqueness test. *(Planned.)*
- **The countdown is never enforced** — `answerPair` never checks `endsAt`; `FOOD_ARRIVED` and
  `TIMEOUT` are declared and never produced. The clock reads 0:00 and the guest can keep
  playing: the countdown lies, which is the one thing the brief says it must not do.
  → Surface 2, server-side check + client transition to the outcome. *(Planned.)*
- **The spent screen never polls**, though two comments justify idempotent writes with "this
  screen polls". A life earned by a staff-confirmed add-on never appears without a manual
  reload. → Surface 1: mount the poller (5s, the waiting-screen interval). **Fixed 2026-08-14.**
- **The guest and staff mono never rendered** — found by the Surface 1 screenshot loop, present
  since the first commit. `--font-mono: var(--font-plex-mono), ui-monospace, …` relies on the
  comma list as a fallback, but an unresolvable `var()` without an in-var fallback invalidates
  the whole declaration at computed-value time and `font-family` silently inherits the sans
  stack. Every "mono" figure on guest and staff surfaces was Segoe. Fix: the fallback list
  moved *inside* `var()` for both `--font-mono` and `--font-display` (globals.css).
  **Fixed 2026-08-14.** The mono-every-figure audit at the end must re-verify computed style,
  not class presence — class presence lied here for months.
- **Next 16 quirk, recorded for the next person:** a `viewport` export from a route-group
  layout 404s every route in the group, silently. Found by bisection when the new
  `(guest)/layout.tsx` took down the guest flow. The clay themeColor override therefore lives
  per-page, not in the group layout. *(2026-08-14.)*
- **State order: spent now checked before waiting-for-fire.** A spent device pre-fire used to
  see "beat the clock and win" — a promise that phone could not keep — and the ways back in
  (the add-on ask, the phone number) were hidden exactly when they are most valuable, before
  the food. Behaviour change recorded: the out-of-lives branch also gained the earn list and
  the poller it previously lacked. **2026-08-14.**
- **No guest path creates an `AddOnRequest`.** The floor confirms rows nothing in the app can
  create; tier 1's "extra spend" is structurally ₹0; the strongest life action is unearnable.
  `en.guest.addOn.*` strings survive from the flow that used to exist. The brief's Part 6 guest
  list has no add-on screen (silent, not prohibited), and the dashboard's headline depends on
  the rows — restored at Surface 2, offered on the outcome screens. *(Proposal, recorded here
  rather than assumed silently.)*
- **All-games-off does not gate the guest route.** `/dash/games` warns "guests see the same
  screen a closed venue shows" but `/t/[qrToken]` never consults `getEnabledGames`.
  → Surface 2, with the byte-identical assertion extended to this case. *(Planned.)*
- **`themeColor` is a phantom hex** (`layout.tsx:18`, `#fbf7f0` matches no token; paper is
  `#faf5ee`). → Foundations. **Fixed 2026-08-14.**
- **`src/core/game/` sits outside the PURE_CORE lint ban** while `pairing.ts` claims otherwise
  in a comment. → Foundations: glob added, lint green with the ban applying. **Fixed 2026-08-14.**

## Removed, and why (the Part 9 ledger)

*(Written as each surface lands — an entry appears here only after the removal is committed.
Format: what — where — why — did the screen get worse?)*

**Surface 1 — device spent (2026-08-14, committed):**

- The `Card` around the hand-over instruction — removed; the instruction merged into the body
  as one two-sentence paragraph. The border said nothing the words didn't. Screen got better.
- The figures left the prose: the old body interpolated streak and rung into a sentence; they
  now live in one mono standing block ("Rung 3/6 · Streak 4") under a micro-label, and the
  block renders only when the table has actually climbed — zeros paraded as theatre read as a
  shrug. A never-played table sees three elements: heading, instruction, ways back in.
- The underline-inside-a-row links became whole-row links (56px targets); the add-on line
  stays a plain sentence because there is nothing to tap — its go lands when a server confirms
  the order.
- `spent.handOver` and the parameterised `spent.body(streak, rung, of)` strings retired;
  `spent.tableBody` added because a table out of goes must not be told to pass the phone (false
  advice — no phone can start when lives are zero).

**Candidates identified during recon, to be judged at their surface:**
- Orphaned strings from the retired climb/mystery-plate era: `en.guest.climb.*`,
  `en.guest.gamePicker.*`, `en.guest.outcome.*`, `en.guest.round.*`, most of the unused
  `en.guest.waiting.*` variants, `en.guest.phone.stampedOnly`, `en.guest.consent.declineNote`
  — Surface 2. (`en.guest.addOn.*` stays: the add-on screen is being restored.)
- The `BLOCKED` scan state (`service.ts`) — declared, handled by five pages, returned by
  nothing. Leaning **keep**: it is the named seam a future block would use. To be decided.
- Dead `VenueConfig` columns surfaced on `/dash/prizes` (`mysteryPlatePricePaise` still has a
  form field though the mechanic is retired; `velocityWindowDays` is editable but read by
  nothing) — Surface 5/the prizes screen.
- The legacy/canonical `--color-*` duplication in `globals.css` is **kept**, not removed —
  renaming forty files for no visual change is churn, not subtraction. New code uses the §8
  names.

## Proposals (brief silent, decision recorded)

- **Rung-reached prize naming**: the engine decides at claim time, so the rung screen previews
  the same pure `decidePrizePool` call the pass shows, and "take it" is the authoritative
  decision. The preview and the decision are seconds apart; if they ever differ (kill switch,
  cap crossing a boundary), the claim screen shows the truth and the preview never promised
  otherwise ("tonight only" copy). Alternative rejected: reserving the prize at rung-reach
  would hold pool budget hostage to a guest who walks away.
- **Reduced-motion countdown**: "degrades to a static remaining figure" — implemented as a
  figure that re-computes only on visibility change and poll refresh, never on an interval. A
  static figure that is *stale* is a lie; a figure that updates when the guest looks back at
  the tab is static in every sense that matters to vestibular comfort.
- **Haptics**: `navigator.vibrate` — Android Chrome only; iOS Safari has no web vibration API.
  The brief's three haptics ship as progressive enhancement and the craft cannot depend on
  them. Noted for the real-device check.
