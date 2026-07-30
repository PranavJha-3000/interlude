# Operator access and game selection — design

**Date:** 2026-07-29
**Status:** approved, ready for planning
**Supersedes nothing.** Extends the backend built earlier the same day (prize rules, magic-link
libraries, venue QR).

---

## Why

Six things were asked for. Three already existed:

| Ask | State before this work |
|---|---|
| Unique QR per venue | **Built** — `Venue.qrToken`, `/v/[venueToken]`, table picker, e2e green |
| Rewards assignment | **Built** — prize engine + per-venue `PrizeRule`, discounts, consolation rules |
| Login system | **Backend only** — `magic-link.ts`, `operator-auth.ts`, `operator-session.ts`. No routes |
| Skeleton landing page | Not built — `create-next-app` scaffold still in place |
| Dashboard: scanned / played / claimed | Not built — every row it needs already exists |
| Games selection | Not built — and only one playable game exists |

This spec covers the three that are missing, plus the second game that makes "selection" meaningful.

## Scope decision

Two nearly-independent subsystems, sharing only `Play.mechanic`:

- **Wave 1 — operator access.** Landing, login, dashboard rewiring, activity tracking. No dependency
  on games.
- **Wave 2 — games.** Mystery Plate, per-venue enablement, guest picker.

One spec, two waves. Wave 1 ships and is verifiable before wave 2 begins.

## Decisions taken

| Question | Decision |
|---|---|
| What "games selection" means | **Both** — the operator enables games per venue, and the guest picks when more than one is on |
| How Mystery Plate plays | **Same quiz, different stake.** Reuses the tested quiz engine and countdown whole. The guest chooses the prize, not the interaction |
| What "who played" means | **Table + session, anonymous.** One row per `GuestSession`. No personal data of any kind |

### Why "same quiz, different stake" rather than a second mechanic

It reuses the quiz engine, the countdown, the server-issued end timestamp and the compliance test
suite unchanged. It adds no new randomness surface to audit. The honest caveat, recorded so nobody
later mistakes it for something it isn't: **this is a stake picker, not two different games.** The
guest chooses between "play for a free dessert" and "play to unlock tonight's ₹99 chef's plate"; the
eight questions are the same either way.

If a genuinely different mechanic is wanted later, `VenueGame` and the picker are the seam it plugs
into, and nothing here has to change.

### Why the tracking dashboard carries no identity

There is no account, no signup, no name and no phone anywhere in the product. A `GuestSession` knows
its table and nothing about the person holding the phone (PLATFORM.md §7, DPDP siloing). "Who
played" therefore resolves to a table and a session, and the design does not attempt more. Optional
phone capture with a per-venue HMAC exists in the schema as `GuestIdentity` and stays deferred — it
would put PII on the critical redemption path for a recognition feature nobody has asked for yet.

---

## Wave 1 — operator access

### Routes

| Route | Kind | Responsibility |
|---|---|---|
| `/` | Server component | Skeleton landing. Copy from `en.ts`, one CTA → `/signin` |
| `/signin` | Page + server action | Email → `requestMagicLink()` → "check your email" |
| `/signin/verify` | **Route handler** (`route.ts`) | Consume token, set cookie, redirect |
| `/dash` | Existing page, rewired | `readStaffSession()` → `requireOperator()` |
| `/dash/activity` | New page | Per-session tracking table |

**`/signin/verify` is a route handler and not a page, and this is not a style preference.** Next
forbids `cookies().set()` inside a server component; the session cookie has to be set during the
redirect that follows a successful consume. A page would throw at runtime.

**Redirect target after consume:** `/onboarding` when the operator has no venue, `/dash` when they
do. Onboarding itself is out of scope for this spec — until it exists, an operator with no venue is
redirected to `/dash`, which renders its existing empty state.

**Staff lose access to `/dash`, and that is the point.** Today `/dash` accepts the staff PIN cookie
because no operator auth existed. After this change a staff session reaching `/dash` is redirected to
`/floor`. A server must never be shown a metric (PLATFORM.md §3); the current behaviour is a
placeholder, not a feature, and removing it is a deliberate part of this work.

**`/tents` is unchanged and stays on the staff PIN.** It is a printing utility rather than a metrics
surface, and a manager printing tents on the venue tablet should not need an email round-trip.
Moving it to the operator session is a later decision, not this spec's.

### Landing page

Deliberately a skeleton. Visual design is explicitly deferred — the palette is under review and
[UI-SPEC.md](../../../UI-SPEC.md) is not settled. Structure only:

- What the product does, one paragraph, operator's language
- One CTA — **Get started** → `/signin`
- Nothing implying a draw, wheel or lottery (PLATFORM.md §7)
- Zero client components
- No pricing table, no logo wall, no testimonials — there are no customers yet

### Activity tracking

One row per `GuestSession`, so two phones at one table are two rows rather than one merged row.

```
Table  Scanned  Game      Result                 Claimed
  7    20:14    Kitchen   Won 6/8 · Tiramisu     ✓ 20:31 free
  7    20:16    Mystery   Lost 3/8 · 25% off     —
 12    20:22    Kitchen   Won 7/8 · Brownie      pending
  3      —      control — cannot play
```

Control tables appear with no scan and a "cannot play" marker. The owner is allowed to see the arm
split — it is the guest who must not.

**Counting logic is a pure function**, `src/core/measurement/funnel.ts`, mirroring how
`contribution.ts` already works:

```ts
summariseFunnel({ tentedTables, sessions, plays, awards }): {
  tentedTables, scannedSessions, scannedTables,
  played, completed, won, awarded, claimed
}
```

No I/O, no clock, unit-tested without a database. The page does the querying and passes rows in.

### Files

| File | Change |
|---|---|
| `src/app/page.tsx` | Rewrite — replaces the scaffold |
| `src/app/(operator)/layout.tsx` | New — shared shell and nav |
| `src/app/(operator)/signin/page.tsx` | New |
| `src/app/(operator)/signin/actions.ts` | New — `requestLink`, `signOut` |
| `src/app/(operator)/signin/verify/route.ts` | New — GET handler |
| `src/app/(operator)/dash/page.tsx` | Rewire to `requireOperator()` |
| `src/app/(operator)/dash/activity/page.tsx` | New |
| `src/core/measurement/funnel.ts` + test | New — pure counting |
| `src/lib/activity.ts` | New — the query that feeds the page |
| `src/strings/en.ts` | Add `landing`, `signin`, `dash.activity` |

---

## Wave 2 — games

### Schema

```prisma
model VenueGame {
  id           String   @id @default(cuid())
  venueId      String
  venue        Venue    @relation(fields: [venueId], references: [id], onDelete: Cascade)
  mechanic     Mechanic
  enabled      Boolean  @default(true)
  displayOrder Int      @default(0)
  updatedAt    DateTime @updatedAt

  @@unique([venueId, mechanic])
  @@index([venueId, enabled])
}
```

A row per mechanic rather than flags on `VenueConfig`: turning a game off mid-service is an
operational decision worth a timestamp, and a future mechanic is a row rather than a migration.

`createVenue` seeds both mechanics — `KITCHEN_ROUND` enabled, `MYSTERY_PLATE` enabled — so a new
venue gets the picker without configuring anything. The pilot seed does the same.

### Guest flow

Current: consent → waiting → **Start the round** → round → outcome.

New: consent → waiting → **picker, only when more than one game is enabled** → round → outcome.

With exactly one game enabled the picker is skipped and behaviour is byte-identical to today. With
none enabled the guest gets the existing neutral "nothing running" screen — the same one a control
table and a closed venue see.

`startRound(qrToken, mechanic)` gains the mechanic argument. `Play.mechanic` already exists and is
already written; it is currently hardcoded to `KITCHEN_ROUND`.

### Mystery Plate needs no prize-engine work

Already true in the engine as built:

- `MYSTERY_PLATE` prize rules exist and are seeded by `defaultPrizeRules()`
- They award `FIXED_PRICE` at the venue's `mysteryPlatePricePaise`
- Items the fixed price would not actually discount are excluded with
  `Fixed price is not below the menu price`
- The outcome is a pure function of skill input; no RNG, enforced by lint

The only new work is the guest picker, the mechanic argument, and copy.

### Operator toggles

`/dash/games` — a row per mechanic with an on/off control and a one-line description of what the
guest sees. Disabling a game does not affect a round already in progress; it only stops new ones.

### Files

| File | Change |
|---|---|
| `prisma/schema.prisma` | `VenueGame` model *(already drafted in the working tree, not migrated)* |
| `prisma/migrations/…_venue_games/` | New migration |
| `src/lib/venue-setup.ts` | Seed both games in `createVenue` |
| `src/lib/service.ts` | `getEnabledGames(venueId)` |
| `src/app/(guest)/t/[qrToken]/page.tsx` | Picker state |
| `src/app/(guest)/t/[qrToken]/actions.ts` | `startRound` takes a mechanic |
| `src/app/(operator)/dash/games/page.tsx` + `actions.ts` | New |
| `src/strings/en.ts` | `guest.gamePicker`, `dash.games` |

---

## Error handling and edge cases

| Case | Behaviour |
|---|---|
| Expired / reused / unknown magic link | `/signin` with a plain message and an offer to send another. Never says whether the address is known |
| Sign-in requested for an unknown address | Identical response to a known one. A different response is an account-enumeration oracle |
| Rate limit hit | Same "check your email" screen. Telling an attacker they hit a limit is free information |
| Operator signed in with no venue | Redirect to `/dash`, which shows its empty state |
| Cross-venue request | 404, not 403 — 403 confirms the venue exists |
| All games disabled | Guest sees the neutral closed screen, identical to a control table's |
| Game disabled mid-round | Round completes normally; only new rounds are blocked |
| Two sessions at one table | Two rows in activity. Never merged |
| Award pending at service close | Shows as `pending` and stays; nothing auto-expires in this spec |

---

## Testing

### Unit

- `funnel.test.ts` — counts across a fixture service, including the case where a table scanned twice
  counts as two sessions but one scanned table
- `venue-setup.test.ts` — `createVenue` seeds both games

### E2E

**The magic-link fixture is the detail worth getting right.** The dev console outbox in `email.ts`
cannot serve Playwright: the suite runs `next build && next start`, which is `NODE_ENV=production`,
where the outbox is disabled by design. Rather than ship a dev-only backdoor route that exists in
production code, the **test fixture issues its own token** — generate, hash, insert the
`MagicLinkToken` row, visit `/signin/verify?token=…`. This exercises the real consume path and adds
no production surface.

New specs:

- `e2e/operator-auth.spec.ts` — issue a token, verify, land on `/dash`; reusing the same link is
  refused; an expired token is refused
- `e2e/activity.spec.ts` — after a play, the row appears with the right table, game, result and
  claim state
- `e2e/games.spec.ts` — with two games enabled the picker appears; choosing Mystery Plate produces a
  `FIXED_PRICE` award; with one enabled the picker is skipped

**`e2e/happy-path.spec.ts` must be updated** — with both games seeded it now passes through the
picker before the round.

### Regression gate

`npm run typecheck && npm run lint && npm test && npm run test:e2e` all green, and the guest route
gains no client component — the ≤15KB-over-floor budget is unchanged by this work.

---

## Explicitly out of scope

- Visual design of any of these screens. The palette is under review; UI-SPEC.md is not settled
- `/onboarding` — the guided venue setup flow
- `/dash/menu` and `/dash/prizes` — menu CRUD and prize admin
- Chef nomination of the mystery plate from near-spoilage stock
- Phone capture, `GuestIdentity`, returning-guest recognition
- Any second *mechanic*; Mystery Plate reuses the quiz by decision
