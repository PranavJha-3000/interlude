import { expect, test } from '@playwright/test'

/**
 * What is left of the wave-1 ship gate.
 *
 * The climb-era happy path and the per-table control test both lived here, and
 * both are superseded rather than broken:
 *
 * - The guest loop is Beat the Kitchen now, covered end to end in
 *   `beat-the-kitchen.spec.ts`.
 * - The control arm moved from the table to the **service** (§3), so "a control
 *   *table* cannot play" is no longer something this product does. A control
 *   *night* puts no tents out at all, and the invariant that replaces it — a
 *   control night reading byte-identically to a closed venue — is asserted in
 *   the new spec.
 *
 * The 404 survives both changes, because an unknown token is an unknown token
 * whatever the guest route happens to be running.
 */

test('an unknown QR token is a 404, not a blank page', async ({ page }) => {
  const res = await page.goto('/t/definitely-not-a-real-token')
  expect(res?.status()).toBe(404)
})
