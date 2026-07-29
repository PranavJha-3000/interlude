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
