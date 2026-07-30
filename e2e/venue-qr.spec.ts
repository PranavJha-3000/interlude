import { expect, test } from '@playwright/test'
import { arrangeService, db } from './fixtures'

/**
 * The venue QR: one code to print, a table picker, then the ordinary flow.
 *
 * The tests that matter here are not "does the link work" — they are the two
 * ways this feature could quietly destroy the measurement it sits on top of:
 * by omitting control tables from the picker, or by failing differently for
 * them once tapped. Either would tell a guest which arm they are in.
 */

test.afterAll(async () => {
  await db.$disconnect()
})

test('a guest scans the venue QR, picks their table, and reaches consent', async ({ page }) => {
  const { venueToken, treatmentLabel, serviceId } = await arrangeService()

  await page.goto(`/v/${venueToken}`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Which table are you at?')

  // Nothing may be recorded by the picker itself — it sits in front of the
  // consent gate, and DPDP purpose limitation applies to the whole page.
  expect(await db.guestSession.count({ where: { serviceId } })).toBe(0)

  // `exact` matters: "Table 2" would otherwise also match "Table 20".
  await page.getByRole('link', { name: `Table ${treatmentLabel}`, exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('while you wait')
  expect(await db.guestSession.count({ where: { serviceId } })).toBe(0)
})

test('control tables appear in the picker and fail indistinguishably', async ({ page }) => {
  const { venueToken, controlLabel, controlToken, treatmentToken, serviceId } =
    await arrangeService()

  await page.goto(`/v/${venueToken}`)

  // Omitting control tables would be the easiest possible way to leak the arm:
  // a guest whose table is missing from the list learns something.
  const controlLink = page.getByRole('link', { name: `Table ${controlLabel}`, exact: true })
  await expect(controlLink).toBeVisible()

  await controlLink.click()
  // Wait for the destination to actually render before reading it — otherwise
  // this captures the picker still on screen and compares the wrong two pages.
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Nothing running right now')
  const controlText = await page.locator('main').innerText()
  expect(await db.guestSession.count({ where: { serviceId } })).toBe(0)

  // And the failure must read exactly like a closed venue.
  await page.context().clearCookies()
  await db.service.update({ where: { id: serviceId }, data: { endedAt: new Date() } })
  await page.goto(`/t/${treatmentToken}`)
  const closedText = await page.locator('main').innerText()

  expect(controlText).toBe(closedText)

  // Belt and braces: the token itself must not appear in the picker markup in a
  // way that distinguishes the arms. Both are plain hrefs, so assert both are.
  await page.goto(`/v/${venueToken}`)
  const hrefs = await page
    .locator('nav a')
    .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href')))
  expect(hrefs).toContain(`/t/${controlToken}`)
  expect(hrefs).toContain(`/t/${treatmentToken}`)
})

test('an unknown venue token is a 404, and leaks no venue name', async ({ page }) => {
  const res = await page.goto('/v/definitely-not-a-real-venue-token')
  expect(res?.status()).toBe(404)
  await expect(page.locator('body')).not.toContainText('The Pilot Kitchen')
})
