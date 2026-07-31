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

/**
 * The climb-era happy path and the per-table control test lived here.
 *
 * Both are superseded rather than broken. The guest loop is now Beat the
 * Kitchen and is covered in `beat-the-kitchen.spec.ts`; the control arm moved
 * from the table to the service (§3), so "a control *table* cannot play" is no
 * longer a thing the product does — a control *night* puts no tents out at all,
 * and that invariant is asserted in the new spec.
 */

test('an unknown QR token is a 404, not a blank page', async ({ page }) => {
  const res = await page.goto('/t/definitely-not-a-real-token')
  expect(res?.status()).toBe(404)
})
