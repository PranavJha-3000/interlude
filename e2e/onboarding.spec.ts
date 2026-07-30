import { expect, test, type Page } from '@playwright/test'
import { db, signInWithPassword, signUpWithPassword } from './fixtures'

/**
 * Self-serve onboarding, end to end: the front door to a working venue without
 * anyone helping.
 *
 * Landing → get started → email and password → venue details → tables → menu →
 * staff PINs → QR → games → dashboard.
 */

const PASSWORD = 'a-long-enough-password'

/**
 * Every venue this file creates is named with this prefix, and every one of
 * them is deleted again afterwards.
 *
 * Onboarding is the only spec that makes *durable* venues — the rest arrange a
 * service against a seeded one — so without this the database gains half a
 * dozen venues per run and the suite stops being the same suite twice.
 */
const E2E_VENUE = 'E2E Onboarding'

test.beforeAll(async () => {
  // The password endpoints share one per-IP window with the rest of the suite,
  // and the window outlives a run. See operator-password-auth.spec.ts.
  await db.operatorLoginAttempt.deleteMany()
})

test.afterAll(async () => {
  // Venue deletes cascade to its tables, menu, staff, games, prize rules and
  // its operator, so this is the whole footprint.
  await db.venue.deleteMany({ where: { name: { startsWith: E2E_VENUE } } })
  await db.operatorUser.deleteMany({ where: { email: { contains: '-onboarding-e2e-' } } })
  await db.$disconnect()
})

/** A venue name nothing else in the suite will collide with. */
async function uniqueVenueName(label: string): Promise<string> {
  return `${E2E_VENUE} ${label} ${await db.venue.count()}${Date.now().toString().slice(-5)}`
}

async function fillDetails(page: Page, name: string): Promise<void> {
  await page.getByLabel('Venue name').fill(name)
  await page.getByLabel('City').fill('Bengaluru')
  await page.getByRole('button', { name: 'Continue' }).click()
}

async function addItem(page: Page, name: string, price: string, cost: string): Promise<void> {
  await page.getByLabel('Item').fill(name)
  await page.getByLabel('Price ₹').fill(price)
  await page.getByLabel('Food cost ₹').fill(cost)
  await page.getByRole('button', { name: 'Add item' }).click()
}

test('an owner signs up from the landing page and reaches a working dashboard', async ({
  page,
}) => {
  test.setTimeout(120_000)

  await page.goto('/')
  await page.getByRole('link', { name: 'Get started' }).click()
  await expect(page).toHaveURL(/\/signup$/)

  await signUpWithPassword(page, PASSWORD, 'onboarding-e2e-owner')
  await expect(page).toHaveURL(/\/onboarding$/)

  // 1 — details
  const name = await uniqueVenueName('Full Walk')
  await fillDetails(page, name)
  await expect(page.locator('main')).toContainText('How many tables?')

  // 2 — tables
  await page.getByLabel('Number of tables').fill('8')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.locator('main')).toContainText('Add your menu')

  // 3 — menu
  await addItem(page, 'Gulab jamun', '90', '20')
  await expect(page.locator('main')).toContainText('1 item so far')
  await addItem(page, 'Masala chai', '60', '9')
  await expect(page.locator('main')).toContainText('2 items so far')
  await page.getByRole('button', { name: 'Done adding' }).click()

  // 4 — staff PINs, minted on request and shown once
  await expect(page.locator('main')).toContainText('Your staff PINs')
  await page.getByRole('button', { name: 'Generate staff PINs' }).click()
  await expect(page.locator('main')).toContainText(/\d{4}/)
  await page.getByRole('button', { name: 'Got them' }).click()

  // 5 — the venue QR, with something to print and something to share
  await expect(page.locator('main')).toContainText('Your venue QR')
  await expect(page.getByRole('link', { name: 'Print table tents' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Share link' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()

  // 6 — games
  await expect(page.locator('main')).toContainText('Which games?')
  await page.getByRole('button', { name: 'Finish setup' }).click()

  // …and out into the dashboard, which no longer bounces them back.
  await expect(page).toHaveURL(/\/dash$/)

  // The venue is genuinely set up, not merely marked as such.
  const venue = await db.venue.findFirstOrThrow({
    where: { name },
    select: { id: true, onboardingStep: true, qrToken: true, config: true },
  })
  expect(venue.onboardingStep).toBe('DONE')
  expect(venue.qrToken).toBeTruthy()
  expect(venue.config, 'a venue is born configured').not.toBeNull()
  expect(await db.table.count({ where: { venueId: venue.id } })).toBe(8)
  expect(await db.menuItem.count({ where: { venueId: venue.id } })).toBe(2)
  expect(await db.staffUser.count({ where: { venueId: venue.id } })).toBe(2)
  expect(
    await db.prizeRule.count({ where: { venueId: venue.id } }),
    'a venue with no prize rules offers nothing on night one'
  ).toBeGreaterThan(0)
  expect(await db.venueGame.count({ where: { venueId: venue.id, enabled: true } })).toBe(2)
})

test('setup resumes where it stopped, on a different session', async ({ page }) => {
  const email = await signUpWithPassword(page, PASSWORD, 'onboarding-e2e-resumer')
  await fillDetails(page, await uniqueVenueName('Resumed'))
  await expect(page.locator('main')).toContainText('How many tables?')

  // Walk away mid-wizard.
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.waitForLoadState('networkidle')
  await page.context().clearCookies()

  await signInWithPassword(page, email, PASSWORD)

  // The cursor is on the venue row, not in the browser, so it survives the
  // cookie jar being emptied.
  await expect(page).toHaveURL(/\/onboarding$/)
  await expect(page.locator('main')).toContainText('How many tables?')
})

test('the menu step refuses to leave an empty menu behind', async ({ page }) => {
  await signUpWithPassword(page, PASSWORD, 'onboarding-e2e-empty-menu')
  await fillDetails(page, await uniqueVenueName('Empty Menu'))
  await page.getByLabel('Number of tables').fill('4')
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.getByRole('button', { name: 'Done adding' }).click()

  // The climb is built from the menu and prizes come off it, so finishing here
  // would produce a venue that cannot run a service.
  await expect(page.locator('main')).toContainText('Add at least one item')
  await expect(page.locator('main')).toContainText('Add your menu')
})

test('a food cost above the price is refused as the typo it almost always is', async ({ page }) => {
  await signUpWithPassword(page, PASSWORD, 'onboarding-e2e-bad-cost')
  const name = await uniqueVenueName('Bad Cost')
  await fillDetails(page, name)
  await page.getByLabel('Number of tables').fill('4')
  await page.getByRole('button', { name: 'Continue' }).click()

  await addItem(page, 'Upside down dish', '50', '500')

  await expect(page.locator('main')).toContainText('Food cost is higher than the price')
  expect(await db.menuItem.count({ where: { name: 'Upside down dish', venue: { name } } })).toBe(0)
})

test('a second venue cannot take a name that is already set up', async ({ page }) => {
  const name = await uniqueVenueName('Contested')

  await signUpWithPassword(page, PASSWORD, 'onboarding-e2e-first')
  await fillDetails(page, name)
  await expect(page.locator('main')).toContainText('How many tables?')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.waitForLoadState('networkidle')

  await signUpWithPassword(page, PASSWORD, 'onboarding-e2e-second')
  await fillDetails(page, name)

  // The slug is the venue's public identity (/floor/<slug>), so this is a real
  // clash rather than a cosmetic one.
  await expect(page.locator('main')).toContainText('already set up')
  await expect(page.locator('main')).toContainText('Tell us about the venue')
})

test('a finished venue is not dragged back into the wizard', async ({ page }) => {
  const seeded = process.env.SEED_OPERATOR_EMAIL ?? 'owner@example.com'
  const seededPassword = process.env.SEED_OPERATOR_PASSWORD ?? 'pilot-owner-dev'

  await signInWithPassword(page, seeded, seededPassword)
  await expect(page).toHaveURL(/\/dash$/)

  // Visiting /onboarding directly must not restart setup on a live venue.
  await page.goto('/onboarding')
  await expect(page).toHaveURL(/\/dash$/)
})
