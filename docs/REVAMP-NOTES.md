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
   *(Status: analysis pending, checkpoint owed to the owner.)*

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
  reload. → Surface 1: mount the poller (5s, the waiting-screen interval). *(Planned.)*
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
  `#faf5ee`). → Foundations. *(Planned.)*
- **`src/core/game/` sits outside the PURE_CORE lint ban** while `pairing.ts` claims otherwise
  in a comment. → Foundations: add the glob and verify the ban actually fires. *(Planned.)*

## Removed, and why (the Part 9 ledger)

*(Written as each surface lands — an entry appears here only after the removal is committed.
Format: what — where — why — did the screen get worse?)*

**Candidates identified during recon, to be judged at their surface:**

- The generic `Card` wrapper on the spent screen's hand-over instruction (border says nothing
  the words don't) — Surface 1.
- The `standing()` line on the spent screen, duplicating the rung the body already states —
  Surface 1.
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
