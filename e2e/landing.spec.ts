import { expect, test } from '@playwright/test'

test('the landing page offers one way in', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('unsold inventory')

  // Asserts the href rather than clicking it: /signin arrives in Task 3, and a
  // test that only passes once a later task lands is a test that gets disabled.
  await expect(page.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/signin')
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

test('the decision card shows a refusal, and its reason', async ({ page }) => {
  await page.goto('/')

  // Presence before absence. The signature element of the whole page is the
  // *refused* column — a card that rendered only what the engine cleared would
  // still look fine and would have lost the argument.
  const card = page.getByRole('figure')
  await expect(card.getByText('Cleared')).toBeVisible()
  await expect(card.getByText('Refused')).toBeVisible()

  await expect(card.getByText('Butter chicken')).toBeVisible()
  await expect(card.getByText('Your hero item. Never discounted.')).toBeVisible()
})

test('the landing page claims no customer it does not have', async ({ page }) => {
  await page.goto('/')

  // The decision card is an illustration and has to say so, because the page
  // is built to look like real audit output. No pricing table, no logo wall,
  // no testimonials — inventing social proof for a product whose promise is
  // honest measurement is the most expensive lie available (UI-SPEC.md §6).
  await expect(page.getByRole('figure').getByText('Example')).toBeVisible()

  const text = (await page.locator('body').innerText()).toLowerCase()
  for (const banned of ['trusted by', 'customers', 'testimonial', 'case study', 'rated']) {
    expect(text, `landing copy must not contain "${banned}"`).not.toContain(banned)
  }
})

test('Get started reaches the sign-in form', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Get started' }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.getByLabel('Your email')).toBeVisible()
})
