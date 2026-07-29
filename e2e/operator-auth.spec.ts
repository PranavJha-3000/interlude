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

test('a first-time signup with no venue lands on the dashboard empty state', async ({ page }) => {
  const token = await issueMagicLinkFor('brand-new-owner@example.com', { withVenue: false })

  await page.goto(`/signin/verify?token=${encodeURIComponent(token)}`)
  await expect(page).toHaveURL(/\/dash$/)
  await expect(page.locator('main')).toContainText('No service running')
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
  await expect(page).toHaveURL(/\/dash$/)

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

test('a signed-in operator can open the tent sheet from the nav', async ({ page }) => {
  const token = await issueMagicLinkFor('owner@example.com')
  await page.goto(`/signin/verify?token=${encodeURIComponent(token)}`)
  await expect(page).toHaveURL(/\/dash$/)

  await page.getByRole('link', { name: 'Tents' }).click()
  await expect(page).toHaveURL(/\/tents$/)
  await expect(page.getByRole('heading', { name: 'Table tents' })).toBeVisible()
  await expect(page.locator('main')).toContainText('Scan it while you wait')
})
