import { expect, test } from '@playwright/test'

/**
 * The /refer route backs the landing's "Refer a Restaurant" CTA. Three things
 * are worth an E2E each: the CTA actually reaches somewhere (it spent weeks as
 * href="#"), a complete referral reaches the thank-you state, and a broken one
 * comes back with the specific refusal rather than a blank form.
 *
 * Spam defences are deliberately NOT exercised here — the time trap would make
 * a scripted happy path indistinguishable from a bot (correctly!). Unit tests
 * cover those rules; these tests prove the human-shaped path works.
 */

test('the nav referral CTA reaches the refer form', async ({ page }) => {
  await page.goto('/')

  // Both carriers must promise /refer before anything is clicked — this link
  // spent weeks as href="#", so the promise IS the assertion. (The drawer's
  // link lives outside the accessibility tree while hidden, so both checks
  // here are CSS-based on purpose.)
  await expect(page.locator('header.nav a.nav__refer')).toHaveAttribute('href', '/refer')
  await expect(page.locator('[data-nav-mobile] a[href="/refer"]')).toHaveCount(1)

  // On the phone viewport the desktop link is folded away, so the honest
  // journey is: open the drawer, tap the referral item inside it.
  await page.locator('[data-nav-toggle]').click()
  await page.locator('[data-nav-mobile] a:has-text("Refer a Restaurant")').click()
  await expect(page).toHaveURL(/\/refer$/)
  await expect(page.getByText('Know a kitchen that should run this?')).toBeVisible()
})

test('a complete referral lands on the thank-you state', async ({ page }) => {
  await page.goto('/refer')

  await page.getByLabel('Restaurant name').fill('Test Tandoor')
  await page.getByLabel('Location').fill('Bengaluru')
  await page.getByLabel('Who should we ask for?').fill('Anjali Rao')
  await page.getByLabel(/^Their phone/).fill('+91 98765 43210')
  await page.getByLabel(/role \/ title/i).fill('Owner')
  await page.getByLabel(/^Your name/).fill('Sam Spammer-proof')
  await page.getByLabel(/^Your contact/).fill('sam@example.com')

  // The form's own time trap rejects POSTs faster than a human reads — so the
  // happy path proves its legitimacy by waiting out REFERRAL_MIN_FILL_MS,
  // exactly what a careful visitor does anyway. Without this, the server
  // politely shows the thank-you screen and files nothing.
  await page.waitForTimeout(3_200)

  await page.getByRole('button', { name: 'Send the referral' }).click()

  await expect(page.getByText('Thank you — the referral is ours now.')).toBeVisible()
})

test('a broken referral returns the specific field refusal', async ({ page }) => {
  await page.goto('/refer')

  await page.getByLabel('Restaurant name').fill('Test Tandoor')
  // Everything else left blank: the first failure must surface by name.
  await page.getByLabel(/^Their phone/).fill('not a number')

  await page.getByRole('button', { name: 'Send the referral' }).click()

  // Every field is required, so the first missing one leads the complaint —
  // but the typed-badly phone number must never pass silently either way.
  const banner = page.locator('.rform__error')
  await expect(banner).toBeVisible()
})