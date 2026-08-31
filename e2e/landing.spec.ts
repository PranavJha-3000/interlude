import { expect, test } from '@playwright/test'

test('the landing page offers one way in', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Merchandising wait times')

  // The front door is for an owner who has no account yet, so the one way in is
  // signup. Signing in is a link from there, not the thing they are shown first.
  await expect(page.getByRole('link', { name: 'Get started' }).first()).toHaveAttribute(
    'href',
    '/signup'
  )
})

test('the landing page implies no draw, wheel or lottery', async ({ page }) => {
  await page.goto('/')
  const text = (await page.locator('body').innerText()).toLowerCase()
  for (const banned of [
    'lottery',
    'raffle',
    'draw',
    'spin',
    'wheel',
    'scratch',
    'jackpot',
    'luck',
  ]) {
    expect(text, `landing copy must not contain "${banned}" (PLATFORM.md §7)`).not.toContain(banned)
  }
})

test('the landing explains the wait-time flow in four steps', async ({ page }) => {
  await page.goto('/')
  // The signature of the current page is the numbered how-it-works strip.
  await expect(page.getByRole('heading', { name: /Three bites/ })).toBeVisible()
  await expect(page.locator('ol.steps .step')).toHaveCount(4)
})

test('the landing does not overclaim in certification language', async ({ page }) => {
  await page.goto('/')
  const text = (await page.locator('body').innerText()).toLowerCase()
  for (const banned of ['trusted by', 'certified', 'guaranteed', 'case study', 'rated #1']) {
    expect(text).not.toContain(banned)
  }
})

test('every CTA reaches a real surface', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Get started' }).first()).toHaveAttribute(
    'href',
    '/signup'
  )
  await expect(page.getByRole('link', { name: 'Refer a Restaurant' }).first()).toHaveAttribute(
    'href',
    '/refer'
  )
})

test('Get started reaches the signup form, not the sign-in one', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Get started' }).first().click()

  // The front door is for an owner who is not signed up yet. Sending them to
  // /signin makes the first thing they see a form they cannot fill in.
  await expect(page).toHaveURL(/\/signup$/)
  await expect(page.getByLabel('Your email')).toBeVisible()
  await expect(page.getByLabel('Choose a password')).toBeVisible()
})
