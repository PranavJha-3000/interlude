import { expect, test } from '@playwright/test'
import { db, issueMagicLinkFor, signInWithPassword } from './fixtures'

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

test('a first-time signup with no venue lands in the wizard, not on a dashboard', async ({
  page,
}) => {
  const token = await issueMagicLinkFor('brand-new-owner@example.com', { withVenue: false })

  await page.goto(`/signin/verify?token=${encodeURIComponent(token)}`)

  // A dashboard about a venue that does not exist has nothing on it, and the
  // only thing it could say is "go and set your venue up" — which is /onboarding.
  await expect(page).toHaveURL(/\/onboarding$/)
  await expect(page.locator('main')).toContainText('Tell us about the venue')
})

test('a staff session is redirected away from /dash, to /floor', async ({ page }) => {
  await page.goto('/floor/pilot')
  await page.getByLabel('Your PIN').fill('1234')
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ])
  // Wait for the sign-in round trip to fully settle before navigating away —
  // checking the URL alone can race the cookie actually landing in the
  // browser's jar, since the redirect can paint before that completes.
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveURL(/\/floor$/)

  await page.goto('/dash')
  await expect(page).toHaveURL(/\/floor$/)
})

// The "requesting a link answers identically for known and unknown addresses"
// test used to live here, driving the `/signin` form. That form is a password
// form now (SECURITY.md §7a), so the assertion moved to
// `src/lib/operator-auth.test.ts`, where it can call `requestMagicLink`
// directly. It is a property of the link path, not of the page, and it has to
// survive the page changing — the link returns to the front door once there is
// a verified sending domain.

test('a signed-out visitor to the dashboard is sent to sign in', async ({ page }) => {
  await page.context().clearCookies()
  await page.goto('/dash')
  await expect(page).toHaveURL(/\/signin$/)
})

test('a venue-less operator keeps nav and sign-out, and is not bounced off activity', async ({
  page,
}) => {
  const token = await issueMagicLinkFor('brand-new-owner@example.com', { withVenue: false })
  await page.goto(`/signin/verify?token=${encodeURIComponent(token)}`)
  await expect(page).toHaveURL(/\/onboarding$/)

  // Signed in is signed in. The shell must not treat "no venue yet" as
  // "no session" — that leaves them with no way to sign out of a session
  // they demonstrably have.
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Tonight' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Activity' })).toBeVisible()

  await page.goto('/dash/activity')
  await expect(page).toHaveURL(/\/dash\/activity$/)
  await expect(page.locator('main')).toContainText('No service running')
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
})

/**
 * The flood test that used to sit here drove `/signin` past the per-IP limit.
 * It cannot, for two reasons: that form no longer requests a link (§7a), and a
 * flood driven through the *password* endpoints would burn the shared per-IP
 * budget for the whole window and starve `operator-password-auth.spec.ts`,
 * which runs after this file.
 *
 * What it asserted is now split. That a refusal happens *before* the write, so
 * a rate-limited request leaves no junk `OperatorUser` behind, is asserted
 * directly against both services in `src/lib/operator-auth.test.ts` and
 * `src/lib/operator-password-auth.test.ts`. What only a real server can show —
 * that a client IP is actually visible to the action behind `next start` — is
 * the one thing kept here, and it costs a single attempt.
 */
test('a client IP reaches the action behind next start, so the throttle can see it', async ({
  page,
}) => {
  const before = await db.operatorLoginAttempt.count()

  await signInWithPassword(page, 'throttle-probe@example.com', 'a-long-enough-password')

  // No proxy sits in front of `next start` in this harness and none needs to be
  // faked: Next synthesises `x-forwarded-for` from the socket address when the
  // header is absent, which is the same shape production sees (one IP, many
  // requests). If this ever regresses to undefined, `throttled()` short-circuits
  // and every password endpoint silently loses its brake.
  const recorded = await db.operatorLoginAttempt.findFirst({ orderBy: { createdAt: 'desc' } })
  expect(await db.operatorLoginAttempt.count()).toBe(before + 1)
  expect(recorded?.ip, 'no IP means no throttle at all').toBeTruthy()
})

test('a signed-in operator can open the tent sheet from the nav', async ({ page }) => {
  const token = await issueMagicLinkFor('owner@example.com')
  await page.goto(`/signin/verify?token=${encodeURIComponent(token)}`)
  await expect(page).toHaveURL(/\/dash$/)

  await page.getByRole('link', { name: 'Tents' }).click()
  await expect(page).toHaveURL(/\/tents$/)
  await expect(page.getByRole('heading', { name: 'Table tents' })).toBeVisible()
  await expect(page.locator('main')).toContainText('Scan it while you wait')
})
