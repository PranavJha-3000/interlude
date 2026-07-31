import { expect, test } from '@playwright/test'
import { arrangeService, db, venueBy } from './fixtures'

/**
 * The Manual POS adapter, through the surface that actually uses it.
 *
 * These assertions are about one number — `OrderFire.estReadyAt` — because the
 * climb's whole run is derived from it. Getting it wrong in the late direction
 * means a guest is still playing when their food is put down, which is the
 * failure the countdown buffer exists to prevent.
 */

const MINUTE = 60_000

async function signInToFloor(page: import('@playwright/test').Page) {
  await page.context().clearCookies()
  await page.goto('/floor/pilot')
  await page.getByLabel('Your PIN').fill('1234')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/floor$/)
}

/** The fire row for a table, or null. Read from the database, not the screen. */
async function fireFor(serviceId: string, tableId: string) {
  return db.orderFire.findFirst({
    where: { serviceId, tableId },
    orderBy: { firedAt: 'desc' },
  })
}

function minutesOut(fire: { firedAt: Date; estReadyAt: Date }) {
  return Math.round((fire.estReadyAt.getTime() - fire.firedAt.getTime()) / MINUTE)
}

/**
 * One table's tile. Matched by its own label rather than by position, because
 * the arm split decides which table is treatment and that is not table 1.
 */
function tileFor(page: import('@playwright/test').Page, label: string) {
  return page
    .locator('div.rounded-xl')
    .filter({ has: page.getByText(label, { exact: true }) })
    .first()
}

test('firing with one tap uses the venue default and records no courses', async ({ page }) => {
  const { serviceId, treatmentTableId, treatmentLabel } = await arrangeService()
  const venue = await venueBy('pilot')
  const config = await db.venueConfig.findUniqueOrThrow({ where: { venueId: venue.id } })

  await signInToFloor(page)

  const tile = tileFor(page, treatmentLabel)
  await tile.getByRole('button', { name: 'Fire order' }).click()
  await expect(page.getByText(/Fired \d{2}:\d{2}/).first()).toBeVisible()

  const fire = await fireFor(serviceId, treatmentTableId)
  expect(fire).not.toBeNull()

  // No courses named, so the venue's own typical answer applies — not a
  // constant buried in the code.
  expect(fire!.courses).toEqual([])
  expect(minutesOut(fire!)).toBe(config.defaultPrepMinutes)
})

test('naming courses sizes the run to the first plate that lands, not the last', async ({
  page,
}) => {
  const { serviceId, treatmentTableId, treatmentLabel } = await arrangeService()
  const venue = await venueBy('pilot')
  const config = await db.venueConfig.findUniqueOrThrow({ where: { venueId: venue.id } })
  const prep = config.prepMinutesByCategory as Record<string, number>
  const starters = prep.starters!
  const mains = prep.mains!

  await signInToFloor(page)

  const tile = tileFor(page, treatmentLabel)
  await tile.getByText('Courses').click()
  await tile.getByText('Starters', { exact: true }).click()
  await tile.getByText('Mains', { exact: true }).click()
  await tile.getByRole('button', { name: 'Fire order' }).click()
  await expect(page.getByText(/Fired \d{2}:\d{2}/).first()).toBeVisible()

  const fire = await fireFor(serviceId, treatmentTableId)
  expect(fire).not.toBeNull()
  expect([...fire!.courses].sort()).toEqual(['mains', 'starters'])

  // The assertion this whole change exists for. Starters at 8 and mains at 18
  // must resolve to 8 — the run has to be over before the starters arrive.
  expect(minutesOut(fire!)).toBe(starters)
  expect(minutesOut(fire!)).toBeLessThan(mains)
})

test('a fired table offers no way to fire again', async ({ page }) => {
  // The UI half of the idempotency guarantee. The adapter's half — that a
  // replayed write returns the original row rather than resetting the guest's
  // clock — is asserted in src/lib/pos/manual.test.ts, where it can be
  // provoked directly instead of hoping the browser produces a double submit.
  const { serviceId, treatmentTableId, treatmentLabel } = await arrangeService()

  await signInToFloor(page)

  const tile = tileFor(page, treatmentLabel)
  await tile.getByRole('button', { name: 'Fire order' }).click()
  await expect(page.getByText(/Fired \d{2}:\d{2}/).first()).toBeVisible()

  await expect(tile.getByRole('button', { name: 'Fire order' })).toHaveCount(0)
  await expect(tile.getByText('Courses')).toHaveCount(0)

  const rows = await db.orderFire.count({ where: { serviceId, tableId: treatmentTableId } })
  expect(rows).toBe(1)
})
