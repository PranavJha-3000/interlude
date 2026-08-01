import { expect, test } from '@playwright/test'
import { arrangeService, db, signInWithPassword, venueBy } from './fixtures'

/**
 * The owner dashboard (§9.4).
 *
 * Three of these assert design contracts rather than behaviour, because §8.5
 * and §9.4 state them as rules and a rule nobody checks is a preference. The
 * accent one in particular: money is not a promotion, and a P&L that looks
 * promotional undercuts the single claim this product rests on.
 */

const OWNER = process.env.SEED_OPERATOR_EMAIL ?? 'owner@example.com'
const OWNER_PASSWORD = process.env.SEED_OPERATOR_PASSWORD ?? 'pilot-owner-dev'

/**
 * Sign in, having first cleared the per-IP attempt log.
 *
 * Every test here signs in, the suite runs serially, and the throttle counts
 * per IP — so by the fourth test the owner is locked out and the failure looks
 * like a broken dashboard rather than a working rate limiter. The throttle is
 * genuinely tested in `operator-password-auth.spec.ts`; this file should not be
 * fighting it.
 */
async function signInFresh(page: import('@playwright/test').Page) {
  await db.operatorLoginAttempt.deleteMany({})
  await signInWithPassword(page, OWNER, OWNER_PASSWORD)
}

async function openDashboard(page: import('@playwright/test').Page) {
  await arrangeService()
  await signInFresh(page)
  await page.goto('/dash')
  await expect(page).toHaveURL(/\/dash$/)
}

test('leads with net contribution, in the mono, and names the tier beside it', async ({ page }) => {
  await openDashboard(page)

  const headline = page.locator('p.text-6xl').first()
  await expect(headline).toBeVisible()

  // The figure is set in the mono. §8.4: every figure, no exceptions.
  await expect(headline).toHaveClass(/font-mono/)

  // The tier is named next to the number, so the figure is never read without
  // knowing what produced it.
  await expect(page.getByText('App estimate').first()).toBeVisible()
})

test('carries the caveat and a link to edit the assumption behind it', async ({ page }) => {
  await openDashboard(page)

  const body = await page.locator('main').innerText()
  expect(body).toContain('cash tips')
  expect(body).toContain('would have ordered anyway')

  await expect(page.getByRole('link', { name: /edit that assumption/i })).toBeVisible()
})

test('shows both tiers and never merges them into one figure', async ({ page }) => {
  await openDashboard(page)

  // Matched case-insensitively: these labels are uppercased in CSS, and
  // `innerText` reports text as rendered rather than as authored.
  const body = await page.locator('main').innerText()
  expect(body).toMatch(/app estimate/i)
  expect(body).toMatch(/point-of-sale backed/i)

  // Told apart by label and a dashed underline, never by colour (§9.4).
  await expect(page.locator('.border-dashed').first()).toBeVisible()
})

test('no accent anywhere on the money screen (§8.5)', async ({ page }) => {
  await openDashboard(page)

  // The accent ledger has four slots and this screen is not one of them. A
  // positive figure stays ink and stays in the mono; only a negative one is
  // allowed to raise its voice, and it does that in the loss colour.
  await expect(page.locator('[class*="bg-accent"]')).toHaveCount(0)
  await expect(page.locator('[class*="text-accent"]')).toHaveCount(0)
})

test('the refusal log is present and reads louder than the acceptance', async ({ page }) => {
  await openDashboard(page)

  await expect(page.getByRole('heading', { name: /refused/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: /cleared/i })).toBeVisible()
})

test('a negative night is explained rather than hidden', async ({ page }) => {
  const { serviceId } = await arrangeService()
  const venue = await venueBy('pilot')

  // A confirmed award with a real food cost and no add-on behind it: the night
  // conceded something and earned nothing against it.
  const run = await db.tableRun.create({
    data: {
      serviceId,
      tableId: (await db.table.findFirstOrThrow({ where: { venueId: venue.id } })).id,
    },
  })
  const item = await db.menuItem.findFirstOrThrow({ where: { venueId: venue.id } })
  const device = await db.deviceSession.create({
    data: { tableRunId: run.id, consentAt: new Date() },
  })
  const session = await db.guestSession.create({
    data: {
      tableId: run.tableId,
      serviceId,
      armAtScan: 'TREATMENT',
      consentAt: new Date(),
    },
  })
  const play = await db.play.create({
    data: {
      guestSessionId: session.id,
      mechanic: 'BEAT_THE_KITCHEN',
      endsAt: new Date(),
      maxScore: 6,
    },
  })
  await db.award.create({
    data: {
      playId: play.id,
      tableRunId: run.id,
      menuItemId: item.id,
      kind: 'FREE',
      valuePaise: item.pricePaise,
      foodCostPaise: item.foodCostPaise,
      reason: 'test',
      status: 'CONFIRMED',
      rung: 2,
    },
  })

  await signInFresh(page)
  await page.goto('/dash')

  const body = await page.locator('main').innerText()

  // A negative night is a trade the operator made, not an error. Silence here
  // reads as a bug, and a pilot gets cancelled by someone who thinks the
  // software is broken.
  expect(body).toMatch(/cost more than|nothing was added|red for|switched off/)
  await expect(page.getByRole('link', { name: /refused/i })).toBeVisible()

  // The loss colour and the display face are earned only by a negative figure.
  await expect(page.locator('p.text-6xl').first()).toHaveClass(/text-loss/)

  await db.award.deleteMany({ where: { tableRunId: run.id } })
  await db.deviceSession.delete({ where: { id: device.id } })
})
