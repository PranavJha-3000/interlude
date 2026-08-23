import { expect, test } from '@playwright/test'
import { arrangeService, db, signInWithPassword, venueBy } from './fixtures'
import { en } from '../src/strings/en'

/**
 * The per-service depth cap, which had never fired.
 *
 * `getConcededSoFarPaise` counted awards through `play.guestSession.serviceId`.
 * That was correct when the climb was the game and every award hung off a
 * `Play`. Since the table became the unit, `awardFor` writes `tableRunId` and
 * leaves `playId` null — and a Prisma to-one relation filter does not match a
 * row whose foreign key is null. So the sum was always zero, and
 * `depthCapPerServicePaise` never excluded anything.
 *
 * It failed silently in the worst possible way: the engine kept working, the
 * cap simply never bound. `/pass` and `/dash/prizes` both reported "₹0 conceded
 * so far" all evening while a venue gave away its menu.
 *
 * The reason no test caught it is worth naming. `decide-prize-pool.test.ts`
 * covers the cap thoroughly, but as a pure function with the total passed in as
 * an argument. The bug was in the adapter that supplies the argument, and the
 * only other test that builds an `Award` (`dashboard.spec.ts`) sets **both**
 * `playId` and `tableRunId` — so it exercised a row shape the real code never
 * produces. This file builds awards the way `awardFor` actually does.
 */

const OWNER = process.env.SEED_OPERATOR_EMAIL ?? 'owner@example.com'
const OWNER_PASSWORD = process.env.SEED_OPERATOR_PASSWORD ?? 'pilot-owner-dev'

/** ₹300, comfortably above any per-service cap this test sets. */
const CONCEDED_PAISE = 30_000

async function signInFresh(page: import('@playwright/test').Page) {
  await db.operatorLoginAttempt.deleteMany({})
  await signInWithPassword(page, OWNER, OWNER_PASSWORD)
}

/**
 * An award shaped the way the live code writes one: attached to the table run,
 * with **no `playId`**. That null is the entire bug.
 */
async function concedeOnTableRun(serviceId: string, tableId: string, valuePaise: number) {
  const run = await db.tableRun.upsert({
    where: { serviceId_tableId: { serviceId, tableId } },
    update: {},
    create: { serviceId, tableId },
  })
  const item = await db.menuItem.findFirstOrThrow({
    where: { venue: { services: { some: { id: serviceId } } } },
  })

  await db.award.create({
    data: {
      tableRunId: run.id,
      rung: 1,
      menuItemId: item.id,
      kind: 'FREE',
      valuePaise,
      foodCostPaise: item.foodCostPaise,
      reason: 'arranged by the depth-cap test',
      status: 'CONFIRMED',
    },
  })
  return run
}

test('an award written the way the game writes one counts against the service budget', async ({
  page,
}) => {
  const { serviceId, treatmentTableId } = await arrangeService()
  await concedeOnTableRun(serviceId, treatmentTableId, CONCEDED_PAISE)

  await signInFresh(page)
  await page.goto('/dash/prizes')

  // The screen reads the same `getConcededSoFarPaise` the engine does, so this
  // is the running total the cap is actually compared against — not a display
  // of its own. Before the fix this said "₹0 conceded so far this service."
  await expect(page.getByText(/conceded so far this service/)).toContainText('₹300')
})

test('a spent service budget empties the pool, with the cap as the reason', async ({ page }) => {
  const venue = await venueBy('pilot')
  const { serviceId, treatmentTableId } = await arrangeService()

  // The cap set to exactly what has already been conceded, so the remaining
  // budget is zero and nothing at all may be given. This is the sharp version:
  // `serviceBudgetLeft = perServicePaise - concededSoFarPaise`, so with the
  // total stuck at zero the engine believes it still has the full ₹300 and
  // keeps offering everything under it. The bug is not that the cap never
  // binds — it binds per award, as a fixed ceiling. It is that the budget
  // never *depletes*.
  await db.venueConfig.update({
    where: { venueId: venue.id },
    data: { depthCapPerServicePaise: CONCEDED_PAISE },
  })
  await concedeOnTableRun(serviceId, treatmentTableId, CONCEDED_PAISE)

  await signInFresh(page)
  await page.goto('/dash/prizes')

  // Tonight's pool on this screen is the same `decidePrizePool` call the pass
  // and the guest flow make. With the budget spent it must offer nothing, and
  // it must say why in the engine's own words — a refusal with no reason is
  // exactly what PLATFORM.md §5 exists to prevent. Asserting the engine's
  // literal string rather than a loose /cap/i, because this page also carries
  // form labels containing "cap" that would match whether or not it worked.
  await expect(page.getByText('Service prize budget spent').first()).toBeVisible()
  await expect(page.getByText(en.dash.prizes.pool.empty)).toBeVisible()
})

test.afterAll(async () => {
  // Leave the venue's fences as the seed set them; a later spec reading this
  // config should not inherit a cap this file invented.
  const venue = await venueBy('pilot')
  await db.venueConfig.update({
    where: { venueId: venue.id },
    data: { depthCapPerServicePaise: 500_000 },
  })
  await db.$disconnect()
})
