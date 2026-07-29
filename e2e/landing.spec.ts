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
