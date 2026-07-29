# Tenancy Proof and Deferred Debts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove multi-tenant isolation with a second seeded venue and a test that would fail if it
broke, and clear the four debts wave 1 deferred — one of which is printing a funnel whose stages can
go up.

**Architecture:** No new screens. A second venue in the seed unlocks the tenancy test the docs have
been claiming since wave 1. The activity read is split into a bounded row query and unbounded
aggregate counts, so truncating what is displayed cannot corrupt what is counted. The funnel's stages
are re-expressed in one unit.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Prisma 7 + Postgres, Vitest, Playwright.

## Why these four together

Wave 1's whole-branch review deferred four findings and one missing test. Two of the four turn out to
be the same defect seen from different angles — `activity.ts` reads every session in a service with
no bound, and `funnel.ts` counts a different unit at every stage — so they are fixed together or not
at all. The other two are independent and small.

**Explicitly not in this plan:** the `/onboarding` screens, `/dash/menu`, `/dash/prizes`, and the
palette. This plan adds no UI. It also deliberately does **not** build a headless
`src/lib/onboarding.ts` ahead of the screens that would call it — server actions with no consumer are
speculation, and `venue-setup.ts` already holds everything onboarding needs.

## Global Constraints

Copied from `CLAUDE.md`, `PLATFORM.md` and `SECURITY.md`. Every task's requirements implicitly
include this section.

- **No new UI.** No new route, no new page, no new component. Copy in `src/strings/en.ts` may change
  only where a number it labels changed meaning.
- **No new client component anywhere.** Exactly two exist app-wide (`Poller.tsx`, `Round.tsx`).
- **Every operator query takes its `venueId` from the session**, never from a URL parameter or form
  field. Cross-tenant is a **404, never a 403** — 403 confirms the thing exists.
- **Phone numbers are HMAC'd with a per-venue salt**, and no cross-venue join is possible in V1 by
  construction. A second venue must get its own salt, its own QR token, and its own table tokens.
- **`core/` is pure** — no I/O, no database, no clock, no randomness. Everything is arguments.
- **Arm assignment is a recorded row, never a computed guess.** Control tables cannot open a session.
- **A control table must stay indistinguishable from a closed venue** on every guest surface.
- **Sign-in must respond identically for known, unknown and rate-limited addresses** — otherwise it
  is an account-enumeration oracle. Telling an attacker they hit a limit is free information.
- **Every user-facing string lives in `src/strings/en.ts`.** Money is integer paise.
- **The dashboard never merges its two tiers into one number**, and the app-native tier is always
  labelled an estimate.
- Commits are Conventional Commits, lower-case subject, no trailing full stop.
- The regression gate for every task is `npm run typecheck && npm run lint && npm test`, and
  `npm run test:e2e` where the task touches a route or the seed.

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/seed.ts` | Seeds two venues through one local function, so they cannot drift |
| `e2e/tenancy.spec.ts` | The isolation proof: venue A's operator sees only venue A |
| `src/core/measurement/funnel.ts` | Pure counting — stages in one unit |
| `src/core/measurement/funnel.test.ts` | Unit tests, including the two-plays-one-session trap |
| `src/lib/activity.ts` | Bounded row read + unbounded aggregate counts |
| `src/app/(operator)/dash/activity/page.tsx` | Consumes the renamed funnel fields |
| `src/strings/en.ts` | The funnel line's parameter names |
| `e2e/operator-auth.spec.ts` | The per-IP rate-limit assertion |
| `TODO.md` | Records what closed |

---

## Task 1: A second venue, and the isolation proof

**Files:**
- Modify: `prisma/seed.ts`
- Modify: `e2e/fixtures.ts`
- Test: `e2e/tenancy.spec.ts` (create)

**Interfaces:**
- Consumes: `createVenue`, `createTables`, `createMenuItems`, `createStaff` from
  `src/lib/venue-setup.ts`; `hashPin` from `src/lib/pin.ts`; `issueMagicLinkFor` from
  `e2e/fixtures.ts`.
- Produces, for later tasks and for anyone writing tests after this:
  - The seed creates **two** venues. The first is unchanged in every respect — same name
    (`The Pilot Kitchen`), same slug (`pilot`), same 30 tables, same operator
    (`owner@example.com`), same staff PINs (`1234` / `5678`). Every existing test depends on it.
  - The second is `Copper & Clove`, slug `copper`, 8 tables, its own menu, its own staff PINs
    (`4321` server / `8765` kitchen), operator `owner-two@example.com`.
  - `e2e/fixtures.ts` gains `venueBy(slug: string)` returning the venue row, and
    `arrangeServiceFor(slug: string)` — the existing `arrangeService()` keeps its exact current
    behaviour and signature by delegating to `arrangeServiceFor('pilot')`.

**What this test can and cannot prove, stated up front so nobody writes a weaker test believing it is
stronger.** There is no operator route that accepts a venue id — that is the design, and it is why
`requireOperator()` exists. So "request venue B's data and get a 404" is **not directly testable**,
because there is no URL that expresses the request. What *is* testable, and is the property that
actually matters, is that an operator signed into venue A sees only venue A's tables, sessions,
services and games on every operator surface — and that venue B's data, which demonstrably exists in
the same database at the same moment, never appears. Write that, and say so in the spec's docblock.

- [ ] **Step 1: Write the failing test**

Create `e2e/tenancy.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { arrangeServiceFor, db, issueMagicLinkFor, venueBy } from './fixtures'

/**
 * Multi-tenant isolation.
 *
 * **What this proves, and what it does not.** No operator route accepts a venue
 * id — the session is the only source of one (SECURITY.md §8) — so "ask for
 * venue B and get a 404" is not expressible as a request. What is expressible,
 * and is the property that actually matters, is that an operator signed into A
 * sees only A, while B's data demonstrably exists in the same database at the
 * same moment. That is what this asserts.
 */

test.afterAll(async () => {
  await db.$disconnect()
})

test('an operator signed into one venue sees none of the other', async ({ page }) => {
  const pilot = await venueBy('pilot')
  const copper = await venueBy('copper')
  expect(pilot.id).not.toBe(copper.id)

  // Both venues are live at once. If the dashboards did not scope, this is the
  // moment the numbers would blend.
  const a = await arrangeServiceFor('pilot')
  const b = await arrangeServiceFor('copper')

  const copperTables = await db.table.findMany({
    where: { venueId: copper.id },
    select: { label: true },
  })

  const token = await issueMagicLinkFor('owner@example.com')
  await page.goto(`/signin/verify?token=${token}`)

  // The dashboard's own venue, and nothing else.
  await page.goto('/dash')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  // Give the *other* venue a scan, and only the other venue. Venue A's
  // activity page must stay empty — an assertion that fails loudly if the
  // service scope ever widens, unlike "the page does not contain B's name",
  // which would pass even if scoping were removed entirely.
  const copperTable = await db.table.findFirstOrThrow({
    where: { venueId: copper.id },
    select: { id: true },
  })
  await db.guestSession.create({
    data: {
      tableId: copperTable.id,
      serviceId: b.serviceId,
      armAtScan: 'TREATMENT',
      consentAt: new Date(),
    },
  })

  await page.goto('/dash/activity')
  const activityText = await page.locator('main').innerText()
  expect(activityText, "venue B's scan must not appear on venue A's activity page").toContain(
    'No scans yet'
  )
  expect(await db.guestSession.count({ where: { serviceId: b.serviceId } })).toBe(1)

  // The tent sheet is the surface that lists every table by label, so it is
  // where a leak would be most visible.
  await page.goto('/tents')
  await page.getByLabel('Your PIN').fill('1234')
  await page.getByRole('button', { name: 'Sign in' }).click()

  const tentsText = await page.locator('body').innerText()
  expect(tentsText).not.toContain(copper.qrToken)
  for (const t of copperTables) {
    const stillCopper = await db.table.findFirst({
      where: { venueId: copper.id, label: t.label },
      select: { qrToken: true },
    })
    expect(tentsText, `venue B's table token leaked onto venue A's tent sheet`).not.toContain(
      stillCopper!.qrToken
    )
  }

  expect(a.serviceId).not.toBe(b.serviceId)
})

test("a venue's QR resolves only to its own tables", async ({ page }) => {
  const pilot = await venueBy('pilot')
  const copper = await venueBy('copper')

  const copperTokens = (
    await db.table.findMany({ where: { venueId: copper.id }, select: { qrToken: true } })
  ).map((t) => t.qrToken)

  await page.goto(`/v/${pilot.qrToken}`)
  const html = await page.content()
  for (const token of copperTokens) {
    expect(html, "the other venue's table tokens must not appear in this picker").not.toContain(
      token
    )
  }
})

test("one venue's staff PIN does not open the other venue's floor", async ({ page }) => {
  // Copper's server PIN is 4321. The pilot venue's is 1234. A PIN is scoped to
  // the venue that issued it, so Copper's must be refused here.
  await page.context().clearCookies()
  await page.goto('/floor')
  await page.getByLabel('Your PIN').fill('4321')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByText("That PIN didn't work.")).toBeVisible()
})
```

**Note on the third test:** staff sign-in resolves a PIN against a venue. Read
`src/lib/staff-session.ts` and the `/floor` sign-in action before assuming which venue an unqualified
PIN resolves against. If the current implementation genuinely cannot distinguish two venues' PINs,
**that is a real finding, not a test to weaken** — report it as DONE_WITH_CONCERNS with the evidence,
leave the test failing, and do not paper over it.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx playwright test e2e/tenancy.spec.ts`
Expected: FAIL — `venueBy` and `arrangeServiceFor` do not exist, and there is no second venue.

- [ ] **Step 3: Extract the seed's venue builder**

In `prisma/seed.ts`, the venue creation from `createVenue` down to `createStaff` is currently inline.
Extract it into one local function so the two venues cannot drift:

```ts
interface SeedVenue {
  name: string
  slug: string
  tableCount: number
  seatsFor?: (index: number) => number
  menu: typeof MENU
  operatorEmail: string
  serverPin: string
  kitchenPin: string
}

/**
 * One builder, two venues. The second venue exists so the tenancy test has
 * something to *not* see — an isolation test against a database with one tenant
 * proves nothing at all, because every query returns the only venue there is.
 */
async function seedVenue(v: SeedVenue) {
  const venue = await createVenue(db, { name: v.name, slug: v.slug, timezone: 'Asia/Kolkata' })
  await db.venue.update({ where: { id: venue.id }, data: { onboardingStep: 'DONE' } })

  await createMenuItems(
    db,
    venue.id,
    v.menu.map((m) => ({
      name: m.name,
      category: m.category,
      pricePaise: m.price * 100,
      foodCostPaise: m.cost * 100,
      marginTier: m.tier,
      prepBurden: m.prep,
      requiresKitchenWork: m.kitchen ?? true,
      isHero: m.hero ?? false,
      trailingSales: m.hero ? 40 : m.category === 'desserts' ? 1 : 8,
    }))
  )

  await createTables(db, venue.id, v.tableCount, v.seatsFor)
  await db.operatorUser.create({
    data: { email: v.operatorEmail, venueId: venue.id, name: 'Owner' },
  })
  await createStaff(db, venue.id, [
    { name: 'Floor', role: 'SERVER', pinHash: hashPin(v.serverPin) },
    { name: 'Kitchen', role: 'KITCHEN', pinHash: hashPin(v.kitchenPin) },
  ])

  return venue
}
```

Then call it twice. **The first venue's every observable property must be unchanged** — name, slug,
table count, seat distribution, menu, operator email, PINs — because the whole existing test suite is
written against it:

```ts
  const venue = await seedVenue({
    name: 'The Pilot Kitchen',
    slug: 'pilot',
    tableCount: 30,
    seatsFor: (i) => (i < 20 ? 4 : 2),
    menu: MENU,
    operatorEmail: process.env.SEED_OPERATOR_EMAIL ?? 'owner@example.com',
    serverPin: '1234',
    kitchenPin: '5678',
  })

  // A second tenant, so "venue A cannot see venue B" is a claim a test can
  // falsify. Smaller and differently priced on purpose: identical venues would
  // hide a bug that returns the wrong one.
  const second = await seedVenue({
    name: 'Copper & Clove',
    slug: 'copper',
    tableCount: 8,
    menu: MENU.slice(0, 6),
    operatorEmail: 'owner-two@example.com',
    serverPin: '4321',
    kitchenPin: '8765',
  })
```

Keep the existing `console.log` lines for the first venue exactly as they are, and add the equivalent
one-line summary for the second. The quiz pack stays attached to the first venue only — `startRound`
already falls back to a pack with `venueId: null`, so decide deliberately whether the second venue
gets its own pack or shares a global one, and say which in a comment.

The delete-everything block at the top of `main()` already clears all venues, so it needs no change —
verify that, do not assume it.

- [ ] **Step 4: Add the fixtures**

In `e2e/fixtures.ts`:

```ts
/** A seeded venue by slug. Named rather than "the first one" — there are two now. */
export async function venueBy(slug: string) {
  return db.venue.findFirstOrThrow({ where: { slug } })
}
```

Then generalise `arrangeService`. Its current body finds the first venue and clears **all** play
state globally; that global clear is what lets two venues' services coexist in one test, so keep it
in a separate exported helper rather than duplicating it:

```ts
/** Opens a fresh service at one venue, splits the arms, and clears prior play state. */
export async function arrangeServiceFor(slug: string): Promise<Arranged> { … }

/** The pilot venue. Kept so every existing spec reads unchanged. */
export async function arrangeService(): Promise<Arranged> {
  return arrangeServiceFor('pilot')
}
```

Work out the right split yourself — the constraint is that `arrangeService()` keeps its exact current
observable behaviour for the specs already using it, and that calling `arrangeServiceFor` twice in
one test leaves both services open.

- [ ] **Step 5: Re-seed and run the new spec**

Run: `npm run db:seed && npx playwright test e2e/tenancy.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Run the whole E2E suite**

Run: `npm run test:e2e`
Expected: all green. Every pre-existing spec must still pass unchanged — if one now fails, the first
venue's seed drifted and the fix is to restore it, not to edit the spec.

- [ ] **Step 7: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test && npm run test:e2e`

- [ ] **Step 8: Commit**

```bash
git add prisma/seed.ts e2e/fixtures.ts e2e/tenancy.spec.ts
git commit -m "test(tenancy): a second venue, so isolation is a claim a test can falsify"
```

---

## Task 1b: A staff PIN is checked against one venue, not all of them

**Added mid-plan.** Task 1's second venue exposed a real cross-tenant hole, and the owner chose to
fix it in this wave rather than defer it.

**Files:**
- Modify: `src/app/(staff)/floor/actions.ts`
- Modify: `src/app/(staff)/floor/page.tsx`
- Create: `src/app/(staff)/floor/[venueSlug]/page.tsx`
- Modify: `src/app/(kitchen)/pass/page.tsx` (signed-out branch only)
- Modify: `src/strings/en.ts`
- Modify: `prisma/seed.ts` (the console hint only)
- Test: `e2e/tenancy.spec.ts` (the third test goes green), plus every spec that signs in as staff

**Interfaces:**
- Consumes: `verifyPin`, `setStaffSessionCookie` from `src/lib/staff-session.ts`.
- Produces: `signIn(venueSlug: string, formData: FormData)` — the action now takes the venue it is
  signing into. `/floor/[venueSlug]` is the sign-in surface; `/floor` and `/pass` remain the consoles
  and are unchanged for a staff member who already holds a session.

### The defect

`src/app/(staff)/floor/actions.ts`:

```ts
  // One venue in V1, so the PIN identifies the staff member directly. With
  // /admin and multiple venues this becomes venue-scoped.
  const staff = await db.staffUser.findMany()
  let match: (typeof staff)[number] | undefined
  for (const s of staff) {
    if (verifyPin(pin, s.pinHash)) match = s
  }
```

No `where`. Every staff PIN in the database is a candidate, and the loop keeps the **last** hash that
verifies. The comment names the assumption it was written under; multi-tenancy arrived and this never
followed. Two venues picking the same four digits — which is not unlikely, it is inevitable — means a
server at venue A types their own PIN and lands on venue B's floor, with venue B's tables, able to
fire venue B's orders. The session it mints is `venueId: match.venueId`, so every downstream query is
correctly scoped to the *wrong* venue, which is why nothing else catches it.

### The fix, and why this shape

**The sign-in page becomes venue-addressed: `/floor/[venueSlug]`.** The venue is then known before
any hash is checked, so the PIN is only ever compared against that venue's staff.

- The slug is **not a secret and does not need to be.** An attacker who guesses `pilot` still needs a
  valid PIN for that venue — exactly the security level the product already intends. What the slug
  buys is that the PIN can no longer be checked against a pool the venue does not control.
- **Do not use `Venue.qrToken`.** That token is printed on guest-facing material, and reusing it here
  would put the staff sign-in one scan away from every guest in the room.
- **Bare `/floor` while signed out must not list venues.** A venue picker is an enumeration of every
  restaurant that is a customer. It shows a short line telling staff to open their venue's own floor
  link, and nothing else.
- `/floor` and `/pass` are unchanged for a staff member who already holds a session — the cookie
  carries `venueId`, and both consoles already read it.

- [ ] **Step 1: Watch the existing test fail**

Run: `npx playwright test e2e/tenancy.spec.ts -g "staff PIN"`
Expected: FAIL — Copper's PIN `4321` currently signs in at the pilot venue's floor. Task 1 left this
test failing deliberately; it is your RED.

- [ ] **Step 2: Scope the action to one venue**

In `src/app/(staff)/floor/actions.ts`:

```ts
export async function signIn(venueSlug: string, formData: FormData): Promise<void> {
  const pin = String(formData.get('pin') ?? '')
  if (!pin) redirect(`/floor/${venueSlug}?e=1`)

  // Scoped to the venue in the path. Unscoped, every staff PIN in the database
  // was a candidate and the loop kept the last match — so two venues choosing
  // the same four digits put a server on another restaurant's floor, with a
  // session correctly scoped to the wrong venue (SECURITY.md §8).
  //
  // Every stored hash is still checked rather than short-circuiting on the
  // first match, so the response time does not leak how many staff exist.
  const staff = await db.staffUser.findMany({ where: { venue: { slug: venueSlug } } })

  let match: (typeof staff)[number] | undefined
  let matches = 0
  for (const s of staff) {
    if (verifyPin(pin, s.pinHash)) {
      match = s
      matches++
    }
  }

  // Two staff at one venue sharing a PIN is the venue's own mistake, but
  // silently picking one of them would hand someone the other's role. Refuse,
  // and say the same thing a wrong PIN says.
  if (!match || matches > 1) redirect(`/floor/${venueSlug}?e=1`)
```

The rest of the function — minting the session and redirecting by role — is unchanged.

Check whether `StaffUser` has a `venue` relation field before using `{ venue: { slug } }`; if it does
not, resolve the venue id first and filter on `venueId`. Verify against `prisma/schema.prisma` rather
than assuming.

- [ ] **Step 3: Move the PIN pad to the venue-addressed route**

Create `src/app/(staff)/floor/[venueSlug]/page.tsx`. It renders the same PIN pad the `SignIn`
component in `src/app/(staff)/floor/page.tsx` renders today — move that markup rather than writing a
second copy, and have it bind the slug into the action:

```tsx
export default async function FloorSignInPage({
  params,
}: {
  params: Promise<{ venueSlug: string }>
}) {
  const { venueSlug } = await params

  // Resolved so an unknown slug is a 404 rather than a PIN pad that can never
  // succeed. It reveals only that a slug exists, which the guest QR already
  // does for anyone holding a menu.
  const venue = await db.venue.findUnique({ where: { slug: venueSlug }, select: { name: true } })
  if (!venue) notFound()

  // A staff member who is already signed in does not need to be here.
  const staff = await readStaffSession()
  if (staff) redirect(staff.role === 'KITCHEN' ? '/pass' : '/floor')

  …the PIN pad, with action={signIn.bind(null, venueSlug)}…
}
```

Keep the venue name on screen so someone signing in on a shared tablet can see which venue they are
about to open. Match the existing floor surface's visual treatment exactly — it is a dark, large-tap
console, and this is not the place to introduce a new look.

- [ ] **Step 4: Make the signed-out consoles point at the link instead of a picker**

In `src/app/(staff)/floor/page.tsx`, the signed-out branch no longer renders a PIN pad. It renders
the new copy. Do the same for `/pass`'s signed-out branch — check what it currently does first; if it
redirects to `/floor`, that redirect now lands on a message rather than a form, which is correct.

Add to `src/strings/en.ts`, inside `floor.signIn`:

```ts
      // No venue picker here, deliberately: a list of venues is a list of every
      // restaurant that is a customer.
      needsVenueLink: 'Open your venue’s own floor link to sign in. Your manager has it.',
      venueHeading: (venueName: string) => `Sign in — ${venueName}`,
```

- [ ] **Step 5: Print the link in the seed**

`prisma/seed.ts` ends with a `Try these:` block of URLs. Add the floor sign-in link for each seeded
venue, so the console tells a developer where to go now that `/floor` is not a form:

```ts
  console.log(`  floor:     /floor/${venue.slug}   (PIN ${v.serverPin})`)
```

Put it inside `seedVenue` or beside the existing hints — wherever it reads naturally alongside what
is already printed.

- [ ] **Step 6: Update every spec that signs in as staff**

`git grep -n "Your PIN" e2e/` finds them. Each navigates to a surface expecting a PIN pad and must
now go to `/floor/pilot` (or `/floor/copper` for the tenancy spec). Change the navigation, not the
assertions — if an assertion no longer holds, that is a finding, not a licence to edit it.

The tenancy spec's third test becomes: go to `/floor/pilot`, enter Copper's PIN `4321`, and be
refused with the same message a wrong PIN gives.

Add one more case to `e2e/tenancy.spec.ts` while you are there — the positive control that proves the
refusal above is about scoping and not about the PIN being wrong everywhere:

```ts
test("a venue's own PIN opens its own floor", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto('/floor/copper')
  await page.getByLabel('Your PIN').fill('4321')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByText("That PIN didn't work.")).toHaveCount(0)
})
```

- [ ] **Step 7: Run the full gate**

Run: `npm run db:seed && npm run typecheck && npm run lint && npm test && npm run test:e2e`
Expected: all green, including all four tenancy tests.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(staff)" "src/app/(kitchen)" src/strings/en.ts prisma/seed.ts e2e/tenancy.spec.ts e2e/happy-path.spec.ts e2e/operator-auth.spec.ts e2e/games.spec.ts
git commit -m "fix(auth): a staff PIN opens its own venue and no other"
```

---

## Task 2: The activity read is bounded, and the funnel stays true

**Files:**
- Modify: `src/core/measurement/funnel.ts`
- Test: `src/core/measurement/funnel.test.ts`
- Modify: `src/lib/activity.ts`
- Modify: `src/app/(operator)/dash/activity/page.tsx`
- Modify: `src/strings/en.ts`

**Interfaces:**
- Consumes: `countScannedTreatmentTables` and `summariseFunnel` from
  `src/core/measurement/funnel.ts`; `partitionByArm`, `compareLabels` from
  `src/core/measurement/arm-assignment.ts`.
- Produces:
  - `FunnelSummary` becomes `{ tentedTables, scannedTables, scannedSessions, playedSessions, claimedSessions }`.
  - `summariseFunnel(input: FunnelInput)` where
    `FunnelInput = { tentedTableIds: readonly string[]; scannedTableIds: readonly string[]; scannedSessions: number; playedSessions: number; claimedSessions: number }`.
    It no longer takes per-session records — see step 3 for why.
  - `ActivityRow` loses `addOnCount`.
  - `ServiceActivity` gains `truncated: boolean`.
  - `countScannedTreatmentTables` keeps its exact current signature — `/dash` imports it.

### Two findings, one defect

Wave 1's review deferred these separately:

- `guestSession.findMany` in `activity.ts` has no `take` — fine at one venue, wrong at ten.
- `funnel.ts` sums every play on a session while the displayed row shows only the most recent.

They are the same defect. The funnel is computed by mapping over the *same* array the table renders,
so bounding one silently corrupts the other: put `take: 200` on that query and the funnel starts
reporting the last 200 sessions as if they were the whole service. The fix has to separate them.

And the funnel is already wrong in a way worth naming. Its stages are counted in three different
units — `tentedTables` and `scannedTables` are tables, `scannedSessions` is sessions, `played` is
*plays*, `claimed` is *awards* — and the display line puts four of them side by side as though they
descend:

```
20 tented · 7 scanned · 9 played · 3 claimed
```

Nine plays from seven tables reads as a funnel stage that went up. It cannot happen today only
because `startRound` allows one play per session; the moment that relaxes, the dashboard whose entire
pitch is honest measurement starts printing an impossible funnel. Count sessions at every stage after
the table ones, and it is monotonic by construction.

`completed`, `won` and `awarded` are computed today and read by nobody — `git grep` them before
removing to confirm, then remove them. A summary that carries fields no caller wants is where the
next wrong number comes from.

- [ ] **Step 1: Write the failing tests**

Rewrite the affected cases in `src/core/measurement/funnel.test.ts`. Read the existing file first and
keep its structure and voice — you are changing what is counted, not rewriting the suite.

```ts
describe('the funnel descends', () => {
  it('counts sessions at every stage, so a stage can never exceed the one above it', () => {
    // Two sessions at one table, one of which claimed. Two plays on one session
    // would once have made `played` exceed `scannedSessions`; it cannot now,
    // because the caller counts sessions-that-played rather than plays.
    const summary = summariseFunnel({
      tentedTableIds: ['t1', 't2'],
      scannedTableIds: ['t1', 't1'],
      scannedSessions: 2,
      playedSessions: 2,
      claimedSessions: 1,
    })

    expect(summary.tentedTables).toBe(2)
    expect(summary.scannedTables).toBe(1)
    expect(summary.scannedSessions).toBe(2)
    expect(summary.playedSessions).toBe(2)
    expect(summary.claimedSessions).toBe(1)
    expect(summary.playedSessions).toBeLessThanOrEqual(summary.scannedSessions)
    expect(summary.claimedSessions).toBeLessThanOrEqual(summary.playedSessions)
  })

  it('counts a table that scanned but never played', () => {
    const summary = summariseFunnel({
      tentedTableIds: ['t1'],
      scannedTableIds: ['t1'],
      scannedSessions: 1,
      playedSessions: 0,
      claimedSessions: 0,
    })
    expect(summary.scannedTables).toBe(1)
    expect(summary.playedSessions).toBe(0)
  })

  it('never puts a numerator above its own denominator', () => {
    // A table deactivated after its scan, or moved by a mid-service swap. Its
    // session is real and counted; its table is not in the denominator, so the
    // scan rate cannot exceed 100%.
    const summary = summariseFunnel({
      tentedTableIds: ['t1'],
      scannedTableIds: ['t1', 'gone'],
      scannedSessions: 2,
      playedSessions: 2,
      claimedSessions: 0,
    })
    expect(summary.tentedTables).toBe(1)
    expect(summary.scannedTables).toBe(1)
    expect(summary.scannedSessions).toBe(2)
  })
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/core/measurement/funnel.test.ts`
Expected: FAIL — `FunnelInput` has no `scannedTableIds`, and `playedSessions` does not exist on the
summary.

- [ ] **Step 3: Rewrite the pure counting**

In `src/core/measurement/funnel.ts`, replace `FunnelSessionInput`, `FunnelInput`, `FunnelSummary` and
the body of `summariseFunnel`. Keep `countScannedTreatmentTables` exactly as it is, including its
docblock — it is imported by `/dash` and it is the one place that filter lives.

**Why the input stops being per-session records.** Today `summariseFunnel` folds over one object per
session, which is only possible if the caller has read every session — the unbounded read this task
exists to remove. Counting in the database and passing the totals keeps the function pure and keeps
the one thing that genuinely needs judgement — which scanned tables are on the treatment arm — inside
`core/`, where it is tested without a database.

```ts
export interface FunnelInput {
  /** Tables on the treatment arm — the reachable population. */
  tentedTableIds: readonly string[]
  /** One entry per table that opened a session, before any arm filtering. */
  scannedTableIds: readonly string[]
  scannedSessions: number
  playedSessions: number
  claimedSessions: number
}

export interface FunnelSummary {
  tentedTables: number
  /** Distinct tented tables that opened at least one session. */
  scannedTables: number
  /** Sessions. Two phones at one table are two, and are never merged. */
  scannedSessions: number
  /** Sessions that started a round — **sessions**, not rounds. */
  playedSessions: number
  /** Sessions whose prize a member of staff handed over. */
  claimedSessions: number
}
```

The body is now mostly pass-through, and `countScannedTreatmentTables(tentedTableIds, …)` is the one
piece of real work — it takes `readonly { tableId: string }[]`, so map `scannedTableIds` into that
shape rather than changing its signature. The docblock at the top of the file should gain a sentence
explaining why every stage after the table counts is a **session** count: a future reader will
otherwise "fix" it back into counting plays, which is the bug this removes.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/core/measurement/funnel.test.ts`
Expected: PASS.

- [ ] **Step 5: Split the activity read**

In `src/lib/activity.ts`. The table's rows get a bound; the counts do not come from those rows.

```ts
/**
 * How many sessions the activity table renders.
 *
 * A service at one venue does not approach this. It exists so that the query
 * cannot grow without limit as venues are added, and it is deliberately *not*
 * the same read the funnel counts from — bounding a list that a summary is
 * derived from is how a dashboard starts under-reporting a busy night and
 * saying nothing about it.
 */
export const ACTIVITY_ROW_LIMIT = 250
```

Add `take: ACTIVITY_ROW_LIMIT` to the `guestSession.findMany`, keeping `orderBy: { startedAt: 'desc' }`
so the bound drops the oldest rather than an arbitrary slice. Also drop `addOnRequests` from the
`include` — see step 6.

Then derive the funnel from queries that are **not** bounded. The shape is yours to choose; what it
must satisfy:

- `scannedSessions` counts every session in the service, not the rendered subset.
- `playedSessions` counts sessions with at least one `Play`.
- `claimedSessions` counts sessions with at least one `Award` whose status is `CONFIRMED`.
- `scannedTables` still goes through `countScannedTreatmentTables`, so `/dash` and `/dash/activity`
  keep computing that number one way — this is the exact bug wave 1's review caught, and it must not
  come back.
- The counts must be correct when the row list is truncated. Add an assertion for that if you can do
  it without a database; if you cannot, say so in your report rather than inventing a mocked one.

A sketch of the shape — verify every field name against `prisma/schema.prisma` before trusting it,
because the last plan that guessed a Prisma field name got it wrong:

```ts
  const [tableCounts, playedSessions, claimedSessions, scannedSessions] = await Promise.all([
    // One row per table that opened a session — the input countScannedTreatmentTables wants.
    db.guestSession.groupBy({ by: ['tableId'], where: { serviceId } }),
    db.guestSession.count({ where: { serviceId, plays: { some: {} } } }),
    db.guestSession.count({
      where: { serviceId, plays: { some: { award: { status: 'CONFIRMED' } } } },
    }),
    db.guestSession.count({ where: { serviceId } }),
  ])
```

Feed `summariseFunnel` from these aggregates — `scannedTableIds` is `tableCounts.map((g) => g.tableId)` —
never from the bounded row array. If any of these queries turns out not to express what it needs to,
say so in your report and propose the alternative rather than quietly widening the row read again.

Set `truncated` on the returned `ServiceActivity` when the session total exceeds
`ACTIVITY_ROW_LIMIT`, so the page can be honest about it later.

- [ ] **Step 6: Drop `addOnCount`**

`ActivityRow.addOnCount` is queried, mapped, and rendered nowhere. Remove the field, its mapping, and
the `addOnRequests` include that feeds it. It comes back with the column when the activity table gets
its UI phase — a field carried for a year "because we'll want it" is a field nobody checks the
correctness of.

- [ ] **Step 7: Update the page and the string**

`src/app/(operator)/dash/activity/page.tsx` passes `funnel` straight into `en.dash.activity.funnel`.
Update that function's parameter type in `src/strings/en.ts` to the renamed fields. **The rendered
sentence keeps its current wording** — the words were already right; it was the numbers behind them
that were not:

```ts
      funnel: (f: {
        tentedTables: number
        scannedTables: number
        playedSessions: number
        claimedSessions: number
      }) =>
        `${f.tentedTables} tented · ${f.scannedTables} scanned · ${f.playedSessions} played · ${f.claimedSessions} claimed`,
```

Do not add a "showing the most recent 250" line to the page — that is UI, and UI is out of scope for
this plan. `truncated` is plumbed and unused for now; note it in your report so the reviewer knows it
is deliberate.

- [ ] **Step 8: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test && npm run test:e2e`
Expected: all green. `e2e/activity.spec.ts` exercises this page and must still pass.

- [ ] **Step 9: Commit**

```bash
git add src/core/measurement src/lib/activity.ts "src/app/(operator)/dash/activity/page.tsx" src/strings/en.ts
git commit -m "fix(measurement): count sessions at every stage, and stop reading a service unbounded"
```

---

## Task 3: The per-IP rate limit gets a test

**Files:**
- Test: `e2e/operator-auth.spec.ts` (append)

**Interfaces:**
- Consumes: `MAGIC_LINK_MAX_PER_IP_PER_WINDOW` and `MAGIC_LINK_MAX_PER_WINDOW` from
  `src/lib/magic-link.ts`; the `/signin` form action.
- Produces: nothing.

**Why this one is worth a slow test.** The per-address limit is unit-tested; the per-IP limit is not,
and it is the branch that stops someone walking the address space with one address per request.
`requestMagicLink` checks it *before* the `operatorUser.upsert`, deliberately, so a rate-limited
request leaves no junk row behind — that ordering is the thing to assert, and it is invisible to a
pure test because both halves are database calls.

The response must be **identical** to a successful one. A different message tells an attacker their
limit, which is free information.

- [ ] **Step 1: Write the failing test**

Append to `e2e/operator-auth.spec.ts`. Import the two constants from `@/lib/magic-link` — check how
the other E2E specs import from `src/`; if the Playwright tsconfig does not resolve the `@/` alias,
import by relative path rather than copying the numbers, because a copied constant is a test that
passes after someone changes the limit.

```ts
test('a flood from one address gets the same answer as a first-time visitor, and leaves no rows', async ({
  page,
}) => {
  // Each request uses a fresh, never-seen address, so the per-address limit
  // cannot be what refuses them — only the per-IP one can.
  const stamp = String(await db.magicLinkToken.count())
  const addresses = Array.from(
    { length: MAGIC_LINK_MAX_PER_IP_PER_WINDOW + 2 },
    (_, i) => `flood-${stamp}-${i}@example.com`
  )

  let lastBody = ''
  for (const email of addresses) {
    await page.goto('/signin')
    await page.getByLabel('Your email').fill(email)
    await page.getByRole('button', { name: 'Email me a link' }).click()
    await expect(page.getByText('Check your email')).toBeVisible()
    lastBody = await page.locator('main').innerText()
  }

  // The last request was refused by the limit. It must be indistinguishable
  // from the first, which was not.
  expect(lastBody).toContain('Check your email')

  // And the refusal happened before the write: the addresses past the limit
  // must not have become operator rows.
  const created = await db.operatorUser.count({
    where: { email: { startsWith: `flood-${stamp}-` } },
  })
  expect(
    created,
    'a rate-limited request must not leave an OperatorUser behind'
  ).toBeLessThanOrEqual(MAGIC_LINK_MAX_PER_IP_PER_WINDOW)
})
```

**Read `src/lib/operator-auth.ts` and `src/app/(operator)/signin/actions.ts` before writing the
assertions, and check what `clientIpFrom()` actually returns when Playwright talks to
`next start` on localhost.** If every request arrives with no discernible IP, the per-IP branch never
fires and this test cannot be written as specified — in that case **report DONE_WITH_CONCERNS with
the evidence and leave the test failing or skipped with a comment explaining exactly why**. Do not
weaken the assertion until it passes, and do not add a test hook to production code to make it
testable.

If the constants make this test unreasonably slow (each iteration is a page load and a form post),
it is acceptable to drive the requests with Playwright's `request` fixture against the form action
instead of the full page — provided the response-parity assertion survives the change. Say which you
chose and why.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx playwright test e2e/operator-auth.spec.ts -g "flood"`
Expected: FAIL for a stated reason. If it passes on the first run, the test is not testing anything —
work out why before continuing.

- [ ] **Step 3: Make it pass**

If the behaviour is already correct, the test passes once written correctly, and there is no
production change to make. **That is a legitimate outcome for this task** — it was filed as a missing
test, not a missing feature. Say so plainly in your report rather than manufacturing a change.

If the test reveals the limit does not work as documented, that is a real finding: report it with
evidence and do not fix it silently in the same commit as its test.

- [ ] **Step 4: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test && npm run test:e2e`

- [ ] **Step 5: Commit**

```bash
git add e2e/operator-auth.spec.ts
git commit -m "test(auth): the per-IP limit refuses without saying so, and writes nothing"
```

---

## Task 4: Record what closed

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Update TODO.md**

In the phase 8 block, the four deferred items and the "Not yet covered" note about a second seeded
venue are now resolved or changed. Tick what closed. For the two that changed shape rather than
simply closing, replace the line with what is actually true now:

- the unbounded read and the funnel's units were one defect, fixed together;
- `addOnCount` was dropped rather than rendered, and comes back with the activity table's UI phase.

Add a short phase entry for this work in the same shape as the others — goal, checklist, **How to
test** block:

```
npm run db:seed
npm run typecheck && npm run lint && npm test && npm run test:e2e
npx playwright test e2e/tenancy.spec.ts
```

Record one thing honestly in prose: **the tenancy test proves scoping, not a 404.** No operator route
accepts a venue id, so "request venue B and get a 404" is not expressible as a request; what is
asserted is that an operator signed into A sees only A while B's data exists in the same database at
the same moment. If a route ever does take a venue id, `assertVenueScope` is the guard and it will
need its own test.

- [ ] **Step 2: Check formatting**

Run: `npx prettier --check TODO.md`

- [ ] **Step 3: Commit**

```bash
git add TODO.md
git commit -m "docs(todo): close the deferred debts and record the tenancy proof"
```

---

## Verification

Done when, from a clean tree:

1. `npm run db:seed && npm run typecheck && npm run lint && npm test && npm run test:e2e` is green.
2. `npm run db:seed` produces exactly two venues, and `The Pilot Kitchen` is identical to what it was
   before this plan — same slug, 30 tables, same operator, same PINs.
3. `git grep -n "addOnCount" src/` returns nothing.
4. `git grep -n "\.played\b" src/core/measurement/` shows a boolean per session, not a count of plays.
5. Every pre-existing E2E spec passes without having been edited to accommodate the second venue.
