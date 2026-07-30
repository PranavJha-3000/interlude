import { expect, test } from '@playwright/test'
import { arrangeService, climbRungs, db, fireOrderFor, menuPricesFor } from './fixtures'

/**
 * The wave-1 ship gate: scan → consent → play → win → add-on → staff confirms.
 *
 * Plus the invariant that matters more than the happy path — a control table
 * must be unable to play, and must not be able to tell that it is a control
 * table.
 */

test.afterAll(async () => {
  await db.$disconnect()
})

test('a guest scans, beats the kitchen, adds a dessert, and staff confirms it', async ({
  page,
}) => {
  const { serviceId, treatmentToken, treatmentTableId } = await arrangeService()
  await fireOrderFor(serviceId, treatmentTableId)

  // ── Consent ────────────────────────────────────────────────────────────
  await page.goto(`/t/${treatmentToken}`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('while you wait')

  const before = await db.guestSession.count({ where: { serviceId } })
  expect(before, 'nothing may be recorded before the consent tap').toBe(0)

  await page.getByRole('button', { name: 'Start' }).click()

  // ── Waiting for the kitchen ────────────────────────────────────────────
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your food is on its way')
  await expect(page.getByText(/minutes out/)).toBeVisible()
  expect(await db.guestSession.count({ where: { serviceId } })).toBe(1)

  // ── The climb ──────────────────────────────────────────────────────────
  // Both games are seeded on, so the waiting screen offers the stake picker.
  await page.getByRole('button', { name: 'Beat the kitchen' }).click()
  await expect(page.getByText('Rung 1 of')).toBeVisible()

  const play = await db.play.findFirstOrThrow({
    where: { guestSession: { serviceId } },
  })
  expect(play.endsAt.getTime(), 'the end time is issued by the server').toBeGreaterThan(Date.now())
  expect(
    play.endsAt.getTime() - Date.now(),
    'the run lasts as long as the food does, not a fixed length'
  ).toBeGreaterThan(10 * 60_000)

  // Climb every rung deliberately, reading the dish names off the page and
  // ordering them by the menu's own prices — so the win is earned rather than
  // clicked hopefully.
  const prices = await menuPricesFor('pilot')
  await climbRungs(page, prices, play.maxScore)

  // ── Outcome ────────────────────────────────────────────────────────────
  await expect(page.getByRole('heading', { level: 1 })).toContainText('You beat the kitchen', {
    timeout: 15_000,
  })

  const award = await db.award.findFirstOrThrow({
    where: { play: { guestSession: { serviceId } } },
    include: { menuItem: true },
  })
  expect(award.status).toBe('PENDING')
  expect(award.reason.trim().length, 'every award carries a reason').toBeGreaterThan(0)
  expect(award.menuItem.isHero, 'a hero item is never given away').toBe(false)

  const topped = await db.play.findUniqueOrThrow({ where: { id: play.id } })
  expect(topped.score, 'every rung was cleared, so the top of the ladder was reached').toBe(
    play.maxScore
  )

  // ── Add-on ─────────────────────────────────────────────────────────────
  await expect(page.getByRole('heading', { name: /Add something/ })).toBeVisible()
  const addOnButton = page.locator('form button[type="submit"]').first()
  await addOnButton.click()
  await expect(page.getByText('Sent to your server.')).toBeVisible()

  const addOn = await db.addOnRequest.findFirstOrThrow({
    where: { guestSession: { serviceId } },
  })
  expect(addOn.status).toBe('REQUESTED')
  expect(addOn.pricePaise, 'price is snapshotted at request time').toBeGreaterThan(0)

  // ── Staff confirms ─────────────────────────────────────────────────────
  await page.goto('/floor/pilot')
  await page.getByLabel('Your PIN').fill('1234')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByText('Redemptions')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /claims:/ }).click()

  await expect
    .poll(async () => (await db.award.findUniqueOrThrow({ where: { id: award.id } })).status, {
      timeout: 15_000,
    })
    .toBe('CONFIRMED')
})

test('a control table cannot play, and cannot tell that it is a control table', async ({
  page,
}) => {
  const { serviceId, controlToken, treatmentToken } = await arrangeService()

  await page.goto(`/t/${controlToken}`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Nothing running right now')
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0)

  // The wording must be indistinguishable from a closed venue. A guest who
  // works out they are a control behaves differently, which would contaminate
  // the comparison the control exists to provide.
  const controlText = await page.locator('main').innerText()
  await page.context().clearCookies()

  await db.service.update({ where: { id: serviceId }, data: { endedAt: new Date() } })
  await page.goto(`/t/${treatmentToken}`)
  const closedText = await page.locator('main').innerText()
  expect(controlText).toBe(closedText)

  expect(await db.guestSession.count({ where: { serviceId } })).toBe(0)
})

test('an unknown QR token is a 404, not a blank page', async ({ page }) => {
  const res = await page.goto('/t/definitely-not-a-real-token')
  expect(res?.status()).toBe(404)
})
