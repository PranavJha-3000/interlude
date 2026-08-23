import { expect, test, type Page } from '@playwright/test'
import { arrangeService, db } from './fixtures'

/**
 * The three V1 games, end to end.
 *
 * Beat the Kitchen keeps its own spec; everything here is the shared spine
 * wearing two new skins: selector → game → result → claim, with every claim
 * landing through `decideAndWriteAward` so the prize engine, depth caps and
 * kitchen constraints stay the only path to a reward.
 */

/** The venue a table belongs to — `Arranged` carries ids, not the venue row. */
async function venueIdOf(tableId: string): Promise<string> {
  const t = await db.table.findUniqueOrThrow({ where: { id: tableId }, select: { venueId: true } })
  return t.venueId
}

/** Enable both mini-games for a venue with deterministic, menu-driven data. */
async function enableGames(venueId: string) {
  const menu = await db.menuItem.findMany({
    where: { venueId, active: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: 6,
  })
  expect(menu.length).toBeGreaterThanOrEqual(4)
  const a = menu[0]!
  const b = menu[1]!
  const c = menu[2]!
  const rest = menu.slice(3)
  const d = rest[0]
  const combos = [
    // Ids throughout — `reveals` must be a MenuItem id, never a name.
    { id: 'combo-1', ingredients: [a.id, b.id, c.id], reveals: c.id },
    ...(d ? [{ id: 'combo-decoy', ingredients: [a.id, d.id], reveals: d.id }] : []),
  ]
  const data = { combos }

  await db.venueGame.upsert({
    where: { venueId_mechanic: { venueId, mechanic: 'SECRET_RECIPE' } },
    create: { venueId, mechanic: 'SECRET_RECIPE', enabled: true, displayOrder: 2, data },
    update: { enabled: true, data },
  })
  await db.venueGame.upsert({
    where: { venueId_mechanic: { venueId, mechanic: 'MYSTERY_CUSTOMER' } },
    create: {
      venueId,
      mechanic: 'MYSTERY_CUSTOMER',
      enabled: true,
      displayOrder: 3,
      // Slots are the seeded menu categories — 'mains' → 'starters' → 'beverages'.
      data: {
        budgetOptionsPaise: [20000, 40000],
        cravings: ['Spicy'],
        courseOrder: ['mains', 'starters', 'beverages'],
      },
    },
    // `data` belongs in the update branch too: a VenueGame row created before
    // configuration existed must not shadow the brief forever.
    update: {
      enabled: true,
      data: {
        budgetOptionsPaise: [20000, 40000],
        cravings: ['Spicy'],
        courseOrder: ['mains', 'starters', 'beverages'],
      },
    },
  })

  return names(menu)
}

function names(menu: Array<{ name: string }>) {
  return menu.map((m) => m.name)
}

/** Give the table a fire, so the run is bounded by food rather than untimed. */
async function fireFor(serviceId: string, tableId: string, minutesOut = 20) {
  return db.orderFire.create({
    data: {
      tableId,
      serviceId,
      estReadyAt: new Date(Date.now() + minutesOut * 60_000),
      partySize: 4,
    },
  })
}

/** Consent, then land on the start screen with the selector rendered. */
async function consentAndReachSelector(page: Page, token: string) {
  await page.goto(`/t/${token}`)
  // The first screen is consent; the selector lives one tap later, above the
  // Beat-the-Kitchen start card on the same screen — reaching it needs no run
  // to start, and starting one spends a life the mini-games never use.
  await page.getByRole('button', { name: 'Start' }).first().click()
  // Wait on the picker itself, not any one entry: the disabled-game test
  // arrives with Secret Recipe deliberately switched off.
  await expect(page.getByRole('region', { name: 'PLAY WHILE YOU WAIT' })).toBeVisible()
}

test('the guest sees PLAY WHILE YOU WAIT and can launch either mini-game', async ({ page }) => {
  const arranged = await arrangeService()
  const venueId = await venueIdOf(arranged.treatmentTableId)
  const treatmentToken = arranged.treatmentToken
  await enableGames(venueId)
  await fireFor(arranged.serviceId, arranged.treatmentTableId)

  await consentAndReachSelector(page, treatmentToken)

  await expect(page.getByText('PLAY WHILE YOU WAIT')).toBeVisible()
  await expect(page.getByRole('link', { name: /Secret Recipe/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Mystery Customer/ })).toBeVisible()

  // Launch must be immediate — the tap is the launch, no intermediate screen.
  await page.getByRole('link', { name: /Secret Recipe/ }).click()
  await expect(page.getByText('Find the secret combination')).toBeVisible()
})

test('Secret Recipe: invalid combination gives feedback and allows retry', async ({ page }) => {
  const arranged = await arrangeService()
  const venueId = await venueIdOf(arranged.treatmentTableId)
  const treatmentToken = arranged.treatmentToken
  const n = await enableGames(venueId)
  // Neither pair is a configured combination — both stay misses.
  const wrongPair = [n[1], n[3] ?? n[2]]
  await fireFor(arranged.serviceId, arranged.treatmentTableId)

  await consentAndReachSelector(page, treatmentToken)
  await page.getByRole('link', { name: /Secret Recipe/ }).click()
  await expect(page.getByText('Find the secret combination')).toBeVisible()

  for (const name of wrongPair) {
    await page.getByRole('button', { name, exact: true }).click()
  }
  await page.getByRole('button', { name: /^Try/i }).click()

  // Still on the picker — attempts stay open within the session, no dead end.
  await expect(page.getByText('Find the secret combination')).toBeVisible()
  await expect(page.getByText('You found it')).toHaveCount(0)
})

test('Secret Recipe: valid combination reveals and claims through the engine', async ({ page }) => {
  const arranged = await arrangeService()
  const venueId = await venueIdOf(arranged.treatmentTableId)
  const treatmentToken = arranged.treatmentToken
  const { serviceId } = arranged
  const n = await enableGames(venueId)
  await fireFor(serviceId, arranged.treatmentTableId)

  await consentAndReachSelector(page, treatmentToken)
  await page.getByRole('link', { name: /Secret Recipe/ }).click()

  for (const name of [n[0], n[1], n[2]]) {
    await page.getByRole('button', { name, exact: true }).click()
  }
  await page.getByRole('button', { name: /^Try/i }).click()

  await expect(page.getByText('You found it')).toBeVisible()
  // The claim goes through the one award path — no game-specific bypass.
  await page.getByRole('button', { name: 'Claim reward' }).click()
  // The button flips to "Loading…" the tick after the click, so a count-0
  // check proves nothing about the round-trip — wait for the navigation it
  // ends with, exactly like the Mystery Customer claim above.
  await expect(page).toHaveURL(new RegExp(`/t/${treatmentToken}$`), { timeout: 15_000 })
  await expect
    .poll(() => db.award.count({ where: { tableRun: { serviceId } } }), { timeout: 10_000 })
    .toBeGreaterThan(0)
})

test('Mystery Customer: brief → picks → verdict → claim', async ({ page }) => {
  const arranged = await arrangeService()
  const venueId = await venueIdOf(arranged.treatmentTableId)
  const treatmentToken = arranged.treatmentToken
  const { serviceId } = arranged
  await enableGames(venueId)
  await fireFor(serviceId, arranged.treatmentTableId)

  await consentAndReachSelector(page, treatmentToken)
  await page.getByRole('link', { name: /Mystery Customer/ }).click()
  await expect(page.getByText('Serve our mystery customer')).toBeVisible()

  // Choosing collapses a course's group, re-indexing the rest — so always take
  // the first remaining group until every course is filled.
  const groups = page.locator('[role="group"]')
  while ((await groups.count()) > 0) {
    await groups.first().getByRole('button').first().click()
    await page.waitForTimeout(150)
  }
  await page.getByRole('button', { name: 'Serve the meal' }).click()

  await expect(page.getByText('The verdict')).toBeVisible()
  // The claim goes through the one award path and lands on the table won-screen.
  await page.getByRole('button', { name: 'Claim reward' }).click()
  await expect(page).toHaveURL(new RegExp(`/t/${treatmentToken}$`), { timeout: 10_000 })
  expect(await db.award.findFirst({ where: { tableRun: { serviceId } } })).not.toBeNull()
})

test('a disabled mini-game disappears from the selector', async ({ page }) => {
  const arranged = await arrangeService()
  const { treatmentToken, serviceId, treatmentTableId } = arranged
  const venueId = await venueIdOf(treatmentTableId)
  await enableGames(venueId)
  await db.venueGame.update({
    where: { venueId_mechanic: { venueId, mechanic: 'SECRET_RECIPE' } },
    data: { enabled: false },
  })
  await fireFor(serviceId, treatmentTableId)

  await consentAndReachSelector(page, treatmentToken)

  await expect(page.getByRole('link', { name: /Secret Recipe/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Mystery Customer/ })).toBeVisible()
})
