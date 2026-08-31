import { expect, test, type Page } from '@playwright/test'
import { db, signInWithPassword, signOutViaNav, signUpWithPassword } from './fixtures'
import { defaultVenueGames } from '../src/lib/venue-setup'

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
  // The three V1 games ship enabled at venue creation; assert against the
  // setup default rather than a magic number, so the day a game is added or
  // retired at the source this expectation moves with it.
  const shipped = defaultVenueGames().filter((g) => g.enabled).length
  expect(await db.venueGame.count({ where: { venueId: venue.id, enabled: true } })).toBe(shipped)
})

test('setup resumes where it stopped, on a different session', async ({ page }) => {
  const email = await signUpWithPassword(page, PASSWORD, 'onboarding-e2e-resumer')
  await fillDetails(page, await uniqueVenueName('Resumed'))
  await expect(page.locator('main')).toContainText('How many tables?')

  // Walk away mid-wizard.
  await signOutViaNav(page)
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

test('a CSV upload lands in a draft grid, and only confirm writes items', async ({ page }) => {
  await signUpWithPassword(page, PASSWORD, 'onboarding-e2e-csv')
  const name = await uniqueVenueName('CSV Upload')
  await fillDetails(page, name)
  await page.getByLabel('Number of tables').fill('4')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.locator('main')).toContainText('Add your menu')

  const csv = 'name,category,price\nButter Chicken,mains,520\nGarlic Naan,breads,90\n'
  await page.getByLabel('Menu file').setInputFiles({
    name: 'menu.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  })
  await page.getByRole('button', { name: 'Read my menu' }).click()

  // A draft, not data: nothing written yet.
  await expect(page.locator('main')).toContainText('Check what we read')
  await expect(page.locator('main')).toContainText('2 items read from your csv')
  expect(await db.menuItem.count({ where: { venue: { name } } })).toBe(0)

  // Untick the naan, give each category a rough cost, confirm.
  await page.locator('input[name="rowInclude"][value="1"]').uncheck()
  await page.getByLabel('mains — cost as % of price').fill('40')
  await page.getByLabel('breads — cost as % of price').fill('25')
  await page.getByRole('button', { name: 'Save these items' }).click()

  await expect(page.locator('main')).toContainText('1 item so far')
  const item = await db.menuItem.findFirstOrThrow({
    where: { venue: { name } },
    select: { name: true, pricePaise: true, foodCostPaise: true, marginTier: true },
  })
  expect(item.name).toBe('Butter Chicken')
  expect(item.pricePaise).toBe(52000)
  expect(item.foodCostPaise).toBe(20800) // 40% of the price, computed — never extracted
  expect(item.marginTier).toBe('MID')
})

test('a photo upload uses the extractor draft, and discarding writes nothing', async ({ page }) => {
  await signUpWithPassword(page, PASSWORD, 'onboarding-e2e-photo')
  const name = await uniqueVenueName('Photo Upload')
  await fillDetails(page, name)
  await page.getByLabel('Number of tables').fill('4')
  await page.getByRole('button', { name: 'Continue' }).click()

  // The suite runs with AI_TRANSPORT=mock, so this exercises the whole
  // photo path against the deterministic fixture.
  await page.getByLabel('Menu file').setInputFiles({
    name: 'menu.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('not-a-real-jpeg-but-the-mock-does-not-look'),
  })
  await page.getByRole('button', { name: 'Read my menu' }).click()

  await expect(page.locator('main')).toContainText('Check what we read')
  // Draft rows are editable inputs, so the names live in values, not text.
  await expect(page.locator('input[value="Paneer Tikka"]')).toBeVisible()

  await page.getByRole('button', { name: 'Discard draft' }).click()

  // Abandoning the draft wrote nothing — the §6a promise.
  await expect(page.locator('main')).toContainText('Nothing added yet')
  expect(await db.menuItem.count({ where: { venue: { name } } })).toBe(0)
})

test('a second venue cannot take a name that is already set up', async ({ page }) => {
  const name = await uniqueVenueName('Contested')

  await signUpWithPassword(page, PASSWORD, 'onboarding-e2e-first')
  await fillDetails(page, name)
  await expect(page.locator('main')).toContainText('How many tables?')
  await signOutViaNav(page)

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
