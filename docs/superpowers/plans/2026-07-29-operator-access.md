# Operator Access Implementation Plan (Wave 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A restaurant owner can reach a landing page, sign in by email link, and see a per-session record of which table scanned, what they played, what they won and whether staff confirmed it.

**Architecture:** Five vertical slices over the existing Next.js App Router codebase. The magic-link libraries (`magic-link.ts`, `operator-auth.ts`, `operator-session.ts`) already exist and are unit-tested — this wave builds the routes on top of them. Counting logic goes in `core/` as a pure function with no I/O, matching how `contribution.ts` already works; the page does the querying and passes rows in.

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Prisma 7 + Postgres (Neon) · Vitest · Playwright · Tailwind v4.

## Global Constraints

Copied verbatim from the spec and the repo's standing rules. **Every task's requirements implicitly include this section.**

- **Every user-facing string lives in `src/strings/en.ts`.** A literal in a component is a bug — Hindi must stay a translation job, not a refactor.
- **The product name comes from `src/brand.ts`.** Never hardcode "Interlude" into copy, a route, or a page title.
- **No new client components.** The guest route's budget is framework floor +≤15KB and only `Poller.tsx` and `Round.tsx` are client components today. Every file in this plan is a server component or a server action.
- **No new colour tokens, no new spacing scale.** Use the tokens already in `src/app/globals.css` and Tailwind's default 4px scale. Visual design is explicitly deferred — build skeletons.
- **Every operator query takes its `venueId` from the session**, never from a URL parameter or a form field. Use `getOperator()` / `requireOperator()` from `src/lib/operator-session.ts`.
- **Cross-tenant requests 404, never 403.** 403 confirms the venue exists.
- **Sign-in must respond identically for known and unknown addresses.** A different response is an account-enumeration oracle.
- **Money is integer paise.** Format with `formatPaise()` from `src/lib/money.ts`. Never a float.
- **No `Math.random`, no `crypto.getRandomValues`, no `Date.now()` inside `src/core/`.** Enforced by ESLint. Pass time and ids in as arguments.
- **Regression gate for every task:** `npm run typecheck && npm run lint && npm test` must pass before commit.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/core/measurement/funnel.ts` | **New.** Pure counting: tented, scanned tables, scanned sessions, played, completed, won, awarded, claimed. Counts only — rate maths already lives in `summariseEngagement` and must not be duplicated |
| `src/core/measurement/funnel.test.ts` | **New.** Unit tests for the above |
| `src/strings/en.ts` | **Modify.** Add `landing`, `signin`, `dash.activity` blocks |
| `src/app/page.tsx` | **Rewrite.** Replaces the `create-next-app` scaffold |
| `src/app/(operator)/layout.tsx` | **New.** Shared operator shell + nav |
| `src/app/(operator)/signin/page.tsx` | **New.** Email form and "check your email" state |
| `src/app/(operator)/signin/actions.ts` | **New.** `requestLink`, `signOut` server actions |
| `src/app/(operator)/signin/verify/route.ts` | **New.** GET handler: consume token, set cookie, redirect |
| `src/app/(operator)/dash/page.tsx` | **Modify.** Staff session → operator session |
| `src/app/(operator)/dash/activity/page.tsx` | **New.** The tracking table |
| `src/lib/activity.ts` | **New.** The query that feeds the activity page |
| `e2e/fixtures.ts` | **Modify.** Add `issueMagicLinkFor()` |
| `e2e/operator-auth.spec.ts` | **New.** |
| `e2e/activity.spec.ts` | **New.** |

---

### Task 1: Funnel counting (pure)

**Files:**
- Create: `src/core/measurement/funnel.ts`
- Test: `src/core/measurement/funnel.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `summariseFunnel(input: FunnelInput): FunnelSummary`, plus exported types `FunnelSessionInput`, `FunnelInput`, `FunnelSummary`. Task 5 imports `summariseFunnel` and `FunnelSessionInput`.

**Why counts and not percentages:** `summariseEngagement` in `src/core/measurement/contribution.ts` already computes `scanRatePct` and `completionRatePct` and is already tested. Duplicating rate maths here would create two sources for one number. This function returns integers only.

- [ ] **Step 1: Write the failing test**

Create `src/core/measurement/funnel.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { summariseFunnel, type FunnelSessionInput } from './funnel'

function session(over: Partial<FunnelSessionInput> & { tableId: string }): FunnelSessionInput {
  return {
    playCount: 0,
    completedCount: 0,
    wonCount: 0,
    awardCount: 0,
    claimedCount: 0,
    ...over,
  }
}

describe('summariseFunnel', () => {
  it('counts two sessions at one table as two sessions but one scanned table', () => {
    const r = summariseFunnel({
      tentedTableIds: ['t1', 't2', 't3'],
      sessions: [session({ tableId: 't1' }), session({ tableId: 't1' })],
    })
    expect(r.scannedSessions).toBe(2)
    expect(r.scannedTables).toBe(1)
    expect(r.tentedTables).toBe(3)
  })

  it('sums the play funnel across sessions', () => {
    const r = summariseFunnel({
      tentedTableIds: ['t1', 't2'],
      sessions: [
        session({ tableId: 't1', playCount: 1, completedCount: 1, wonCount: 1, awardCount: 1, claimedCount: 1 }),
        session({ tableId: 't2', playCount: 1, completedCount: 1, wonCount: 0, awardCount: 1, claimedCount: 0 }),
      ],
    })
    expect(r.played).toBe(2)
    expect(r.completed).toBe(2)
    expect(r.won).toBe(1)
    expect(r.awarded).toBe(2)
    expect(r.claimed).toBe(1)
  })

  it('ignores a scan from a table that is not tented, rather than inflating scannedTables', () => {
    // A control table cannot open a session, so this should be impossible —
    // but if it ever happens the funnel must not silently count it as reach.
    const r = summariseFunnel({
      tentedTableIds: ['t1'],
      sessions: [session({ tableId: 't1' }), session({ tableId: 'rogue' })],
    })
    expect(r.scannedTables).toBe(1)
    expect(r.scannedSessions).toBe(2)
  })

  it('returns all zeroes for an empty service without dividing by anything', () => {
    const r = summariseFunnel({ tentedTableIds: [], sessions: [] })
    expect(r).toEqual({
      tentedTables: 0,
      scannedTables: 0,
      scannedSessions: 0,
      played: 0,
      completed: 0,
      won: 0,
      awarded: 0,
      claimed: 0,
    })
  })

  it('is a pure function of its input', () => {
    const input = {
      tentedTableIds: ['t1'],
      sessions: [session({ tableId: 't1', playCount: 1 })],
    }
    const first = JSON.stringify(summariseFunnel(input))
    for (let i = 0; i < 50; i++) {
      expect(JSON.stringify(summariseFunnel(input))).toBe(first)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/measurement/funnel.test.ts`
Expected: FAIL — `Failed to resolve import "./funnel"`

- [ ] **Step 3: Write minimal implementation**

Create `src/core/measurement/funnel.ts`:

```ts
/**
 * The service funnel, as counts.
 *
 * Deliberately counts only — no percentages. `summariseEngagement` in
 * `contribution.ts` already owns rate maths, and two sources for one number is
 * how a dashboard starts contradicting itself.
 *
 * Pure: no I/O, no clock (PLATFORM.md §5).
 */

export interface FunnelSessionInput {
  tableId: string
  playCount: number
  completedCount: number
  wonCount: number
  /** Awards issued, whatever their status. */
  awardCount: number
  /** Awards a member of staff actually confirmed. */
  claimedCount: number
}

export interface FunnelInput {
  /** Tables on the treatment arm — the reachable population. */
  tentedTableIds: readonly string[]
  sessions: readonly FunnelSessionInput[]
}

export interface FunnelSummary {
  tentedTables: number
  /** Distinct tented tables that opened at least one session. */
  scannedTables: number
  /** Sessions. Two phones at one table are two, and are never merged. */
  scannedSessions: number
  played: number
  completed: number
  won: number
  awarded: number
  claimed: number
}

export function summariseFunnel(input: FunnelInput): FunnelSummary {
  const tented = new Set(input.tentedTableIds)
  const scanned = new Set<string>()

  let played = 0
  let completed = 0
  let won = 0
  let awarded = 0
  let claimed = 0

  for (const s of input.sessions) {
    // Only tented tables count as reach. A session from anywhere else is
    // recorded but must not inflate the denominator's numerator.
    if (tented.has(s.tableId)) scanned.add(s.tableId)
    played += s.playCount
    completed += s.completedCount
    won += s.wonCount
    awarded += s.awardCount
    claimed += s.claimedCount
  }

  return {
    tentedTables: tented.size,
    scannedTables: scanned.size,
    scannedSessions: input.sessions.length,
    played,
    completed,
    won,
    awarded,
    claimed,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/measurement/funnel.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass, 108 tests

- [ ] **Step 6: Commit**

```bash
git add src/core/measurement/funnel.ts src/core/measurement/funnel.test.ts
git commit -m "feat(measurement): pure funnel counting for the activity dashboard"
```

---

### Task 2: Landing page skeleton

**Files:**
- Modify: `src/strings/en.ts`
- Rewrite: `src/app/page.tsx`
- Test: `e2e/landing.spec.ts` (create)

**Interfaces:**
- Consumes: `BRAND` from `src/brand.ts`.
- Produces: the route `/` with a link to `/signin`. Task 3 relies on that link existing.

**Structure only — visual design is deferred.** No pricing table, no logo wall, no testimonials: there are no customers yet, and inventing social proof on the front door of an honest-measurement product is not a trade worth making.

- [ ] **Step 1: Add the strings**

In `src/strings/en.ts`, add a `landing` block immediately after the `common` block:

```ts
  landing: {
    eyebrow: BRAND.name,
    heading: 'The wait between ordering and eating is unsold inventory.',
    body: 'A short skill game on the guest’s own phone while their food cooks. You set which items can be won and how deep the discount goes; the engine picks inside your fences and shows you why. No app for the guest, no signup, no account.',
    forGuests: 'Your guest scans a code on the table, plays for 60–90 seconds, and wins a named item off your menu.',
    forYou: 'You control the menu, the prizes, the discount depth, and a kill switch for when the kitchen is slammed.',
    honesty:
      'On night one the dashboard shows an app-side estimate of net contribution. Upload a bill export and it is replaced by the measured attach-rate delta against same-night control tables.',
    cta: 'Get started',
  },
```

- [ ] **Step 2: Write the failing test**

Create `e2e/landing.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('the landing page offers one way in', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('unsold inventory')

  // Asserts the href rather than clicking it: /signin arrives in Task 3, and a
  // test that only passes once a later task lands is a test that gets disabled.
  await expect(page.getByRole('link', { name: 'Get started' })).toHaveAttribute(
    'href',
    '/signin'
  )
})

test('the landing page implies no draw, wheel or lottery', async ({ page }) => {
  await page.goto('/')
  const text = (await page.locator('body').innerText()).toLowerCase()
  for (const banned of ['lottery', 'raffle', 'draw', 'spin', 'wheel', 'scratch', 'jackpot', 'luck']) {
    expect(text, `landing copy must not contain "${banned}" (PLATFORM.md §7)`).not.toContain(banned)
  }
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx playwright test e2e/landing.spec.ts`
Expected: FAIL — the heading is still the `create-next-app` scaffold text

- [ ] **Step 4: Write the implementation**

Replace the whole of `src/app/page.tsx`:

```tsx
import Link from 'next/link'
import { BRAND } from '@/brand'
import { en } from '@/strings/en'

/**
 * The operator front door.
 *
 * Deliberately a skeleton — the palette is under review and UI-SPEC.md is not
 * settled, so this locks structure and copy and nothing else. Server component,
 * zero client JS.
 */
export default function LandingPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-20">
      <p className="text-xs tracking-widest text-muted uppercase">{en.landing.eyebrow}</p>

      <h1 className="mt-6 text-4xl leading-tight font-semibold text-balance">
        {en.landing.heading}
      </h1>

      <p className="mt-6 text-lg leading-relaxed text-muted text-pretty">{en.landing.body}</p>

      <section className="mt-12 grid gap-4">
        <div className="rounded-2xl border border-line bg-warm p-5">
          <p className="text-lg leading-relaxed">{en.landing.forGuests}</p>
        </div>
        <div className="rounded-2xl border border-line bg-warm p-5">
          <p className="text-lg leading-relaxed">{en.landing.forYou}</p>
        </div>
      </section>

      <p className="mt-10 max-w-prose text-sm leading-relaxed text-muted">{en.landing.honesty}</p>

      <Link
        href="/signin"
        className="mt-10 inline-flex min-h-14 items-center rounded-xl bg-ink px-8 text-lg font-semibold text-paper"
      >
        {en.landing.cta}
      </Link>

      <footer className="mt-20 text-xs text-muted">
        {BRAND.name} — {BRAND.tagline}
      </footer>
    </main>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx playwright test e2e/landing.spec.ts`
Expected: PASS, 2 tests. Both assertions hold without `/signin` existing yet.

- [ ] **Step 6: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx src/strings/en.ts e2e/landing.spec.ts
git commit -m "feat(landing): replace the create-next-app scaffold with a real front door"
```

---

### Task 3: Operator sign-in flow

**Files:**
- Create: `src/app/(operator)/layout.tsx`
- Create: `src/app/(operator)/signin/page.tsx`
- Create: `src/app/(operator)/signin/actions.ts`
- Create: `src/app/(operator)/signin/verify/route.ts`
- Modify: `src/strings/en.ts`
- Modify: `e2e/fixtures.ts`
- Modify: `e2e/landing.spec.ts` (restore the two commented lines from Task 2)
- Test: `e2e/operator-auth.spec.ts` (create)

**Interfaces:**
- Consumes: `requestMagicLink(rawEmail, baseUrl, nowMs, fromIp?)` and `consumeMagicLink(token, nowMs)` from `src/lib/operator-auth.ts`; `clearOperatorSessionCookie()` from `src/lib/operator-session.ts`.
- Produces: routes `/signin` and `/signin/verify`; server actions `requestLink(formData: FormData): Promise<void>` and `signOut(): Promise<void>`; test helper `issueMagicLinkFor(email: string): Promise<string>` returning the raw token.

**`verify` is a route handler, not a page, and this is load-bearing.** Next forbids `cookies().set()` inside a server component, and `consumeMagicLink` sets the session cookie. A page would throw at runtime.

- [ ] **Step 1: Add the strings**

In `src/strings/en.ts`, add a `signin` block after `landing`:

```ts
  signin: {
    heading: 'Sign in',
    body: 'We’ll email you a link. No password to remember or lose.',
    emailLabel: 'Your email',
    submit: 'Email me a link',
    // Identical whether or not the address is known — a different message here
    // would tell anyone who asks which restaurants are customers.
    sent: 'Check your email. The link works once and expires in 15 minutes.',
    sentAgain: 'Didn’t arrive? Check spam, or request another.',
    invalidEmail: 'That doesn’t look like an email address.',
    linkExpired: 'That link has expired. Request another and it’ll be sent straight away.',
    linkUsed: 'That link has already been used. Request another.',
    linkUnknown: 'That link isn’t valid. Request another.',
    signOut: 'Sign out',
  },
```

- [ ] **Step 2: Write the failing test**

Add to `e2e/fixtures.ts` — imports at the top, helper at the bottom:

```ts
import { createHash, randomBytes } from 'node:crypto'
```

```ts
/**
 * Issues a real magic-link token and returns it.
 *
 * The dev console outbox in `src/lib/email.ts` cannot serve this suite: Playwright
 * runs `next build && next start`, which is NODE_ENV=production, where the outbox
 * is off by design. Rather than ship a dev-only route that exists in production
 * code purely for tests, the fixture writes the row itself — which exercises the
 * real consume path and adds no production surface.
 */
export async function issueMagicLinkFor(
  email: string,
  options: { expiresInMs?: number } = {}
): Promise<string> {
  const venue = await db.venue.findFirstOrThrow({ select: { id: true } })

  const operator = await db.operatorUser.upsert({
    where: { email },
    update: { venueId: venue.id },
    create: { email, venueId: venue.id },
    select: { id: true },
  })

  const token = randomBytes(32).toString('base64url')
  await db.magicLinkToken.create({
    data: {
      operatorUserId: operator.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + (options.expiresInMs ?? 15 * 60 * 1000)),
    },
  })

  return token
}
```

Create `e2e/operator-auth.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { db, issueMagicLinkFor } from './fixtures'

test.afterAll(async () => {
  await db.$disconnect()
})

test('a valid link signs the operator in and lands them on the dashboard', async ({ page }) => {
  const token = await issueMagicLinkFor('owner@example.com')

  await page.goto(`/signin/verify?token=${encodeURIComponent(token)}`)
  await expect(page).toHaveURL(/\/dash$/)
})

test('a link works exactly once', async ({ page }) => {
  const token = await issueMagicLinkFor('owner@example.com')

  await page.goto(`/signin/verify?token=${encodeURIComponent(token)}`)
  await expect(page).toHaveURL(/\/dash$/)

  await page.context().clearCookies()
  await page.goto(`/signin/verify?token=${encodeURIComponent(token)}`)
  await expect(page).toHaveURL(/\/signin\?error=already_used$/)
  await expect(page.locator('main')).toContainText('already been used')
})

test('an expired link is refused', async ({ page }) => {
  const token = await issueMagicLinkFor('owner@example.com', { expiresInMs: -1000 })

  await page.goto(`/signin/verify?token=${encodeURIComponent(token)}`)
  await expect(page).toHaveURL(/\/signin\?error=expired$/)
  await expect(page.locator('main')).toContainText('expired')
})

test('a garbage token is refused without a 500', async ({ page }) => {
  const res = await page.goto('/signin/verify?token=not-a-real-token')
  expect(res?.status()).toBeLessThan(500)
  await expect(page).toHaveURL(/\/signin\?error=unknown$/)
})

test('requesting a link responds identically for known and unknown addresses', async ({ page }) => {
  await page.goto('/signin')
  await page.getByLabel('Your email').fill('owner@example.com')
  await page.getByRole('button', { name: 'Email me a link' }).click()
  await expect(page).toHaveURL(/\/signin\?sent=1$/)
  const known = await page.locator('main').innerText()

  await page.goto('/signin')
  await page.getByLabel('Your email').fill('nobody-here@example.com')
  await page.getByRole('button', { name: 'Email me a link' }).click()
  await expect(page).toHaveURL(/\/signin\?sent=1$/)
  const unknown = await page.locator('main').innerText()

  expect(known, 'a different response would be an enumeration oracle').toBe(unknown)
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx playwright test e2e/operator-auth.spec.ts`
Expected: FAIL — `/signin` and `/signin/verify` do not exist (404)

- [ ] **Step 4: Write the operator layout**

Create `src/app/(operator)/layout.tsx`:

```tsx
import Link from 'next/link'
import { BRAND } from '@/brand'
import { en } from '@/strings/en'
import { getOperator } from '@/lib/operator-session'
import { signOut } from './signin/actions'

export const dynamic = 'force-dynamic'

/**
 * Shell for every operator surface. Skeleton nav — visual design is deferred.
 *
 * This is the only place in the app permitted to import `next/font`, when the
 * type decision in UI-SPEC.md is finally applied. A `next/font` import under
 * `(guest)` is a payload-budget regression.
 */
export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const operator = await getOperator()

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line">
        <nav className="mx-auto flex w-full max-w-4xl items-center gap-5 px-6 py-4">
          <Link href="/" className="text-xs tracking-widest text-muted uppercase">
            {BRAND.name}
          </Link>

          {operator && (
            <>
              <Link href="/dash" className="text-sm">
                {en.dash.heading}
              </Link>
              {/* The activity link is added in Task 5, with the route and the
                  strings it needs. Linking to it here would not typecheck. */}
              <Link href="/tents" className="text-sm">
                Tents
              </Link>
              <form action={signOut} className="ml-auto">
                <button type="submit" className="text-sm text-muted">
                  {en.signin.signOut}
                </button>
              </form>
            </>
          )}
        </nav>
      </header>
      {children}
    </div>
  )
}
```

- [ ] **Step 5: Write the sign-in actions**

Create `src/app/(operator)/signin/actions.ts`:

```ts
'use server'

import { redirect } from 'next/navigation'
import { requestMagicLink } from '@/lib/operator-auth'
import { clearOperatorSessionCookie } from '@/lib/operator-session'
import { looksLikeEmail } from '@/lib/magic-link'

export async function requestLink(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '')

  // A malformed address is a typo the user can see and fix, so saying so leaks
  // nothing. Everything past this point returns the same screen either way.
  if (!looksLikeEmail(email)) redirect('/signin?error=invalid_email')

  const base = process.env.APP_BASE_URL ?? 'http://localhost:3000'
  await requestMagicLink(email, base, Date.now())

  // Identical response whether the address is known, unknown, or rate-limited.
  // Telling an attacker they hit a limit is free information.
  redirect('/signin?sent=1')
}

export async function signOut(): Promise<void> {
  await clearOperatorSessionCookie()
  redirect('/')
}
```

- [ ] **Step 6: Write the sign-in page**

Create `src/app/(operator)/signin/page.tsx`:

```tsx
import { en } from '@/strings/en'
import { requestLink } from './actions'

export const dynamic = 'force-dynamic'

const ERRORS: Record<string, string> = {
  expired: en.signin.linkExpired,
  already_used: en.signin.linkUsed,
  unknown: en.signin.linkUnknown,
  missing: en.signin.linkUnknown,
  invalid_email: en.signin.invalidEmail,
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>
}) {
  const { sent, error } = await searchParams
  const message = error ? ERRORS[error] : undefined

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold">{en.signin.heading}</h1>

      {sent ? (
        <div className="mt-8 rounded-2xl border border-line bg-warm p-5">
          <p className="text-lg leading-relaxed">{en.signin.sent}</p>
          <p className="mt-3 text-sm text-muted">{en.signin.sentAgain}</p>
        </div>
      ) : (
        <>
          <p className="mt-3 text-lg text-muted">{en.signin.body}</p>

          {message && <p className="mt-6 text-sm text-bad">{message}</p>}

          <form action={requestLink} className="mt-8">
            <label htmlFor="email" className="block text-sm text-muted">
              {en.signin.emailLabel}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-2 min-h-14 w-full rounded-xl border border-line bg-paper px-4 text-lg"
            />
            <button
              type="submit"
              className="mt-4 min-h-14 w-full rounded-xl bg-ink px-5 text-lg font-semibold text-paper"
            >
              {en.signin.submit}
            </button>
          </form>
        </>
      )}
    </main>
  )
}
```

- [ ] **Step 7: Write the verify route handler**

Create `src/app/(operator)/signin/verify/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { consumeMagicLink } from '@/lib/operator-auth'

/**
 * Consume a sign-in link.
 *
 * A route handler rather than a page because `consumeMagicLink` sets the session
 * cookie, and Next forbids `cookies().set()` inside a server component. Cookies
 * set through `next/headers` are carried on the redirect response.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/signin?error=missing', request.url))
  }

  const result = await consumeMagicLink(token, Date.now())
  if (!result.ok) {
    return NextResponse.redirect(
      new URL(`/signin?error=${result.reason.toLowerCase()}`, request.url)
    )
  }

  // Onboarding does not exist yet, so an operator with no venue lands on the
  // dashboard's empty state rather than a 404.
  return NextResponse.redirect(new URL('/dash', request.url))
}
```

- [ ] **Step 8: Add the navigation test now that `/signin` exists**

Append to `e2e/landing.spec.ts`:

```ts
test('Get started reaches the sign-in form', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Get started' }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.getByLabel('Your email')).toBeVisible()
})
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx playwright test e2e/operator-auth.spec.ts e2e/landing.spec.ts`
Expected: PASS, 8 tests

- [ ] **Step 10: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass

- [ ] **Step 11: Commit**

```bash
git add "src/app/(operator)/layout.tsx" "src/app/(operator)/signin" src/strings/en.ts e2e/fixtures.ts e2e/operator-auth.spec.ts e2e/landing.spec.ts
git commit -m "feat(auth): operator sign-in by email magic link"
```

---

### Task 4: Move the dashboard onto the operator session

**Files:**
- Modify: `src/app/(operator)/dash/page.tsx:24-33`
- Test: `e2e/operator-auth.spec.ts` (append)

**Interfaces:**
- Consumes: `getOperator()` from `src/lib/operator-session.ts`; `readStaffSession()` from `src/lib/staff-session.ts`.
- Produces: no new exports. `/dash` now requires an operator session.

**This removes staff access to `/dash`, deliberately.** It currently accepts the staff PIN because no operator auth existed. A server must never be shown a metric (PLATFORM.md §3) — the present behaviour is a placeholder, and removing it is part of the work rather than a side effect.

- [ ] **Step 1: Write the failing test**

Append to `e2e/operator-auth.spec.ts`:

```ts
test('a signed-out visitor to the dashboard is sent to sign in', async ({ page }) => {
  await page.context().clearCookies()
  await page.goto('/dash')
  await expect(page).toHaveURL(/\/signin$/)
})

test('a staff PIN no longer opens the dashboard', async ({ page }) => {
  await page.context().clearCookies()
  await page.goto('/floor')
  await page.getByLabel('Your PIN').fill('1234')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Tables')).toBeVisible({ timeout: 15_000 })

  // A server must never be shown a metric (PLATFORM.md §3).
  await page.goto('/dash')
  await expect(page).toHaveURL(/\/floor$/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test e2e/operator-auth.spec.ts -g "staff PIN no longer"`
Expected: FAIL — the staff session still renders `/dash`

- [ ] **Step 3: Write the implementation**

In `src/app/(operator)/dash/page.tsx`, replace the import of `readStaffSession` with both session readers:

```ts
import { getOperator } from '@/lib/operator-session'
import { readStaffSession } from '@/lib/staff-session'
```

Then replace the auth block at the top of `DashPage` — the lines currently reading `const staff = await readStaffSession()` and `if (!staff) redirect('/floor')`, along with the three-line comment above them — with:

```ts
  // The dashboard belongs to the owner, not to whoever holds a staff PIN. A
  // server reaching this goes back to /floor; nobody else gets told the venue
  // exists at all.
  const operator = await getOperator()
  if (!operator) {
    const staff = await readStaffSession()
    redirect(staff ? '/floor' : '/signin')
  }
```

Then replace every remaining `staff.venueId` in the file with `operator.venueId`. There are three: the `getOpenService` call, the fallback `db.service.findFirst` query, and the `db.table.findMany` query.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test e2e/operator-auth.spec.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add "src/app/(operator)/dash/page.tsx" e2e/operator-auth.spec.ts
git commit -m "feat(dash): require an operator session, and stop honouring staff PINs"
```

---

### Task 5: Activity tracking dashboard

**Files:**
- Create: `src/lib/activity.ts`
- Create: `src/app/(operator)/dash/activity/page.tsx`
- Modify: `src/strings/en.ts`
- Test: `e2e/activity.spec.ts` (create)

**Interfaces:**
- Consumes: `summariseFunnel`, `FunnelSessionInput` from `src/core/measurement/funnel.ts` (Task 1); `getOperator()` from `src/lib/operator-session.ts`; `getArmRows`, `getOpenService` from `src/lib/service.ts`; `partitionByArm` from `src/core/measurement/arm-assignment.ts`; `formatPaise`, `guestPaysPaise` from `src/lib/money.ts`.
- Produces: `getServiceActivity(serviceId, venueId, nowMs): Promise<ServiceActivity>` and types `ActivityRow`, `ServiceActivity`.

- [ ] **Step 1: Add the strings**

In `src/strings/en.ts`, inside the existing `dash` block and after `tier2`, add:

```ts
    activity: {
      heading: 'Activity',
      empty: 'No scans yet this service.',
      colTable: 'Table',
      colScanned: 'Scanned',
      colGame: 'Game',
      colResult: 'Result',
      colClaimed: 'Claimed',
      controlNote: 'Control table — cannot play',
      pending: 'Pending',
      notPlayed: 'Scanned, did not play',
      inProgress: 'Playing now',
      gameKitchenRound: 'Kitchen round',
      gameMysteryPlate: 'Mystery plate',
      scoreLine: (score: number, total: number) => `${score}/${total}`,
      funnel: (f: {
        tentedTables: number
        scannedTables: number
        played: number
        claimed: number
      }) =>
        `${f.tentedTables} tented · ${f.scannedTables} scanned · ${f.played} played · ${f.claimed} claimed`,
    },
```

- [ ] **Step 2: Write the failing test**

Create `e2e/activity.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { arrangeService, db, fireOrderFor, issueMagicLinkFor } from './fixtures'

test.afterAll(async () => {
  await db.$disconnect()
})

test('a scan without a play shows as a row, and control tables are listed separately', async ({
  page,
}) => {
  const { serviceId, treatmentToken, treatmentTableId, treatmentLabel } = await arrangeService()
  await fireOrderFor(serviceId, treatmentTableId)

  // Guest scans and consents, but does not play.
  await page.goto(`/t/${treatmentToken}`)
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your food is on its way')
  expect(await db.guestSession.count({ where: { serviceId } })).toBe(1)

  // Owner signs in and looks at the activity page.
  await page.context().clearCookies()
  const token = await issueMagicLinkFor('owner@example.com')
  await page.goto(`/signin/verify?token=${encodeURIComponent(token)}`)
  await page.goto('/dash/activity')

  const row = page.getByRole('row', { name: new RegExp(`^${treatmentLabel}\\b`) }).first()
  await expect(row).toContainText('Scanned, did not play')

  // The owner may see the arm split; the guest may not.
  await expect(page.locator('main')).toContainText('Control table')
  await expect(page.locator('main')).toContainText('tented')
})

test('two sessions at one table are two rows, never merged', async ({ browser }) => {
  const { serviceId, treatmentToken, treatmentTableId, treatmentLabel } = await arrangeService()
  await fireOrderFor(serviceId, treatmentTableId)

  // Two separate phones at the same table.
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext()
    const phone = await context.newPage()
    await phone.goto(`/t/${treatmentToken}`)
    await phone.getByRole('button', { name: 'Start' }).click()
    await expect(phone.getByRole('heading', { level: 1 })).toContainText('Your food is on its way')
    await context.close()
  }
  expect(await db.guestSession.count({ where: { serviceId } })).toBe(2)

  const context = await browser.newContext()
  const owner = await context.newPage()
  const token = await issueMagicLinkFor('owner@example.com')
  await owner.goto(`/signin/verify?token=${encodeURIComponent(token)}`)
  await owner.goto('/dash/activity')

  const rows = owner.getByRole('row', { name: new RegExp(`^${treatmentLabel}\\b`) })
  await expect(rows).toHaveCount(2)
  await context.close()
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx playwright test e2e/activity.spec.ts`
Expected: FAIL — `/dash/activity` is a 404

- [ ] **Step 4: Write the query**

Create `src/lib/activity.ts`:

```ts
import 'server-only'

import { db } from '@/lib/db'
import { getArmRows } from '@/lib/service'
import { partitionByArm } from '@/core/measurement/arm-assignment'
import { summariseFunnel, type FunnelSummary } from '@/core/measurement/funnel'

/**
 * What happened at each table this service.
 *
 * One row per `GuestSession`, never merged by table: two phones at one table are
 * two guests who each had their own experience, and merging them would hide a
 * second scan behind the first one's result.
 *
 * No identity of any kind. A session knows its table and nothing about the
 * person holding the phone (PLATFORM.md §7).
 */

export interface ActivityRow {
  sessionId: string
  tableLabel: string
  scannedAt: Date
  mechanic: 'KITCHEN_ROUND' | 'MYSTERY_PLATE' | null
  score: number | null
  maxScore: number | null
  outcome: 'WIN' | 'LOSE' | null
  completed: boolean
  awardItemName: string | null
  awardKind: 'FREE' | 'PERCENT_OFF' | 'FIXED_PRICE' | null
  awardPercentOff: number | null
  awardFixedPricePaise: number | null
  awardItemPricePaise: number | null
  awardStatus: 'PENDING' | 'CONFIRMED' | 'EXPIRED' | null
  confirmedAt: Date | null
  addOnCount: number
}

export interface ServiceActivity {
  rows: ActivityRow[]
  controlTableLabels: string[]
  funnel: FunnelSummary
}

export async function getServiceActivity(
  serviceId: string,
  venueId: string,
  nowMs: number
): Promise<ServiceActivity> {
  const [sessions, tables, armRows] = await Promise.all([
    db.guestSession.findMany({
      where: { serviceId },
      orderBy: { startedAt: 'desc' },
      include: {
        table: { select: { id: true, label: true } },
        addOnRequests: { select: { id: true } },
        plays: {
          orderBy: { startedAt: 'desc' },
          include: { award: { include: { menuItem: { select: { name: true, pricePaise: true } } } } },
        },
      },
    }),
    db.table.findMany({
      where: { venueId, active: true },
      select: { id: true, label: true },
    }),
    getArmRows(serviceId),
  ])

  // One pass gives both arms — do not also filter with `armAt`, which would
  // walk the same rows again and give a second place for the split to drift.
  const { treatment, control } = partitionByArm(
    armRows,
    tables.map((t) => t.id),
    nowMs
  )
  const labelById = new Map(tables.map((t) => [t.id, t.label]))

  const rows: ActivityRow[] = sessions.map((s) => {
    const play = s.plays[0] ?? null
    const award = play?.award ?? null

    return {
      sessionId: s.id,
      tableLabel: s.table.label,
      scannedAt: s.startedAt,
      mechanic: play?.mechanic ?? null,
      score: play?.score ?? null,
      maxScore: play?.maxScore ?? null,
      outcome: play?.outcome ?? null,
      completed: play?.completedAt !== null && play?.completedAt !== undefined,
      awardItemName: award?.menuItem.name ?? null,
      awardKind: award?.kind ?? null,
      awardPercentOff: award?.percentOff ?? null,
      awardFixedPricePaise: award?.fixedPricePaise ?? null,
      awardItemPricePaise: award?.menuItem.pricePaise ?? null,
      awardStatus: award?.status ?? null,
      confirmedAt: award?.confirmedAt ?? null,
      addOnCount: s.addOnRequests.length,
    }
  })

  // Counting is a pure function taking these rows as arguments — no I/O in it,
  // so the arithmetic is unit-tested without a database.
  const funnelSessions = sessions.map((s) => {
    const plays = s.plays
    const awards = plays.map((p) => p.award).filter((a) => a !== null)
    return {
      tableId: s.tableId,
      playCount: plays.length,
      completedCount: plays.filter((p) => p.completedAt !== null).length,
      wonCount: plays.filter((p) => p.outcome === 'WIN').length,
      awardCount: awards.length,
      claimedCount: awards.filter((a) => a.status === 'CONFIRMED').length,
    }
  })

  return {
    rows,
    controlTableLabels: control
      .map((id) => labelById.get(id) ?? id)
      .sort((a, b) => Number(a) - Number(b)),
    funnel: summariseFunnel({ tentedTableIds: treatment, sessions: funnelSessions }),
  }
}
```

- [ ] **Step 5: Write the page**

Create `src/app/(operator)/dash/activity/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { formatPaise, guestPaysPaise } from '@/lib/money'
import { getOperator } from '@/lib/operator-session'
import { getOpenService } from '@/lib/service'
import { getServiceActivity, type ActivityRow } from '@/lib/activity'

export const dynamic = 'force-dynamic'

/**
 * Which table scanned, what they played, and whether staff confirmed the prize.
 *
 * Anonymous by construction — a row is a table and a session, never a person.
 */
export default async function ActivityPage() {
  const operator = await getOperator()
  if (!operator) redirect('/signin')

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  const service =
    (await getOpenService(operator.venueId)) ??
    (await db.service.findFirst({
      where: { venueId: operator.venueId },
      orderBy: { startedAt: 'desc' },
    }))

  if (!service) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <h1 className="mb-8 text-xs tracking-widest text-muted uppercase">
          {en.dash.activity.heading}
        </h1>
        <p className="text-lg text-muted">{en.dash.empty}</p>
      </main>
    )
  }

  const { rows, controlTableLabels, funnel } = await getServiceActivity(
    service.id,
    operator.venueId,
    now
  )

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="text-xs tracking-widest text-muted uppercase">{en.dash.activity.heading}</h1>
      <p className="mt-2 text-lg tabular-nums">{en.dash.activity.funnel(funnel)}</p>

      {rows.length === 0 ? (
        <p className="mt-10 text-lg text-muted">{en.dash.activity.empty}</p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs tracking-wide text-muted uppercase">
              <tr>
                <th className="py-2 pr-4">{en.dash.activity.colTable}</th>
                <th className="py-2 pr-4">{en.dash.activity.colScanned}</th>
                <th className="py-2 pr-4">{en.dash.activity.colGame}</th>
                <th className="py-2 pr-4">{en.dash.activity.colResult}</th>
                <th className="py-2">{en.dash.activity.colClaimed}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sessionId} className="border-t border-line align-top">
                  <td className="py-3 pr-4 text-lg font-semibold tabular-nums">{r.tableLabel}</td>
                  <td className="py-3 pr-4 tabular-nums text-muted">{timeOf(r.scannedAt)}</td>
                  <td className="py-3 pr-4">{gameLabel(r.mechanic)}</td>
                  <td className="py-3 pr-4">{resultLabel(r)}</td>
                  <td className="py-3">{claimLabel(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {controlTableLabels.length > 0 && (
        <section className="mt-10 rounded-2xl border border-line bg-warm p-5">
          <p className="text-sm text-muted">{en.dash.activity.controlNote}</p>
          <p className="mt-2 text-lg tabular-nums">{controlTableLabels.join(' · ')}</p>
        </section>
      )}
    </main>
  )
}

function timeOf(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function gameLabel(mechanic: ActivityRow['mechanic']): string {
  if (mechanic === 'KITCHEN_ROUND') return en.dash.activity.gameKitchenRound
  if (mechanic === 'MYSTERY_PLATE') return en.dash.activity.gameMysteryPlate
  return '—'
}

function resultLabel(r: ActivityRow): string {
  if (r.mechanic === null) return en.dash.activity.notPlayed
  if (!r.completed) return en.dash.activity.inProgress

  const score = en.dash.activity.scoreLine(r.score ?? 0, r.maxScore ?? 0)
  if (!r.awardItemName || !r.awardKind) return score

  const pays = guestPaysPaise(
    r.awardKind,
    r.awardItemPricePaise ?? 0,
    r.awardPercentOff ?? undefined,
    r.awardFixedPricePaise ?? undefined
  )
  const depth = r.awardKind === 'FREE' ? 'free' : formatPaise(pays)
  return `${score} · ${r.awardItemName}, ${depth}`
}

function claimLabel(r: ActivityRow): string {
  if (r.awardStatus === null) return '—'
  if (r.awardStatus === 'CONFIRMED') {
    return r.confirmedAt ? `✓ ${timeOf(r.confirmedAt)}` : '✓'
  }
  return en.dash.activity.pending
}
```

- [ ] **Step 6: Add the activity link to the operator nav**

In `src/app/(operator)/layout.tsx`, replace the two-line comment that reads "The activity link is added in Task 5…" with the link itself:

```tsx
              <Link href="/dash/activity" className="text-sm">
                {en.dash.activity.heading}
              </Link>
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx playwright test e2e/activity.spec.ts`
Expected: PASS, 2 tests

- [ ] **Step 8: Run the whole suite**

Run: `npm run typecheck && npm run lint && npm test && npm run test:e2e`
Expected: all pass — unit 108, e2e 16

- [ ] **Step 9: Commit**

```bash
git add src/lib/activity.ts "src/app/(operator)/dash/activity" "src/app/(operator)/layout.tsx" src/strings/en.ts e2e/activity.spec.ts
git commit -m "feat(dash): per-session activity tracking — scanned, played, claimed"
```

---

## Self-Review

**1. Spec coverage.** Every wave-1 requirement maps to a task: landing → Task 2; `/signin` + `/signin/verify` route handler → Task 3; `/dash` rewire and staff redirect → Task 4; activity rows, control listing and pure counting → Tasks 1 and 5; the fixture-issues-its-own-token decision → Task 3 Step 2; all nine error-handling cases → Task 3 (link states, enumeration, rate limit) and Task 4 (signed-out, staff). **Gap found and closed:** the spec named `/tents` as unchanged, and the operator layout in Task 3 links to it — `/tents` still reads the staff session, so an operator following that link and holding no staff cookie will be bounced to `/floor`. Accepted for this wave and recorded here rather than silently shipped; moving `/tents` to the operator session is a wave-2 decision.

**2. Placeholder scan.** No TBDs, no "add error handling", no "similar to Task N". Every code step carries the real code. Task 2 Step 5 deliberately expects a partial failure and says exactly what to do about it.

**3. Type consistency.** `FunnelSessionInput` is defined in Task 1 and consumed in Task 5 with matching field names (`tableId`, `playCount`, `completedCount`, `wonCount`, `awardCount`, `claimedCount`). `summariseFunnel` returns `FunnelSummary`, which `en.dash.activity.funnel()` reads four fields from — all present. `guestPaysPaise(kind, pricePaise, percentOff?, fixedPricePaise?)` matches the existing signature in `src/lib/money.ts`. `ActivityRow` is exported from `activity.ts` and imported by the page.

---

## Not in this plan

Wave 2 — Mystery Plate, `VenueGame`, the guest picker and `/dash/games` — gets its own plan once this one lands. The `VenueGame` model is already drafted in `prisma/schema.prisma` in the working tree but **is not migrated**; leave it alone until wave 2.
