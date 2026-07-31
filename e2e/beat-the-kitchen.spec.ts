import { expect, test } from '@playwright/test'
import { arrangeService, db, venueBy } from './fixtures'

/**
 * Beat the Kitchen, end to end (§4).
 *
 * The assertions that matter are the ones a screenshot cannot make: that the
 * answer never reaches the phone, that the streak belongs to the table rather
 * than the device, and that a control night is byte-identical to a closed one.
 */

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

/** The venue's menu, ranked, so a test can know the right answer itself. */
async function menuRanking(slug = 'pilot') {
  const venue = await venueBy(slug)
  const items = await db.menuItem.findMany({
    where: { venueId: venue.id, active: true },
    select: { id: true, name: true, trailingSales: true },
  })
  return new Map(items.map((i) => [i.name, i.trailingSales]))
}

/**
 * Consent, then begin the run.
 *
 * The wait between the two taps is load-bearing rather than defensive: both
 * screens offer a button reading "Start", so clicking twice without waiting
 * races the consent round trip and can hit the same button twice.
 */
async function consentAndBegin(page: import('@playwright/test').Page, token: string) {
  await page.goto(`/t/${token}`)
  await page.getByRole('button', { name: 'Start' }).first().click()
  await expect(page.getByText('Beat the kitchen')).toBeVisible()
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByText(/Which one/)).toBeVisible()
}

test('a guest consents, plays, and the answer never reaches the phone', async ({ page }) => {
  const { serviceId, treatmentToken, treatmentTableId } = await arrangeService()
  await fireFor(serviceId, treatmentTableId)

  await page.goto(`/t/${treatmentToken}`)

  // Nothing is written before the consent tap (§7.3).
  expect(await db.tableRun.count({ where: { serviceId, tableId: treatmentTableId } })).toBe(0)

  await page.getByRole('button', { name: 'Start' }).first().click()
  await expect(page.getByText('Beat the kitchen')).toBeVisible()

  const run = await db.tableRun.findFirstOrThrow({
    where: { serviceId, tableId: treatmentTableId },
  })
  expect(run.livesRemaining).toBeGreaterThan(0)

  // Begin the run — this spends a life and deals the first pair.
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByText(/Which one/)).toBeVisible()

  // **The answer is not on the page.** The whole game is worth nothing if the
  // higher seller can be read out of the markup or the RSC payload.
  const ranking = await menuRanking()
  const html = await page.content()
  expect(html).not.toContain('higherId')
  expect(html).not.toContain('gapRatio')
  for (const sold of ranking.values()) {
    // A raw sales count would give the answer away just as completely.
    expect(html).not.toContain(`"unitsSold":${sold}`)
  }

  const afterStart = await db.tableRun.findFirstOrThrow({ where: { id: run.id } })
  expect(afterStart.livesRemaining).toBe(run.livesRemaining - 1)
  expect(afterStart.pairsShown).toHaveLength(1)
})

test('the streak belongs to the table, so a second phone inherits it', async ({ browser }) => {
  const { serviceId, treatmentToken, treatmentTableId } = await arrangeService()
  await fireFor(serviceId, treatmentTableId)

  // First phone: consent, start, answer once.
  const first = await browser.newContext()
  const p1 = await first.newPage()
  await consentAndBegin(p1, treatmentToken)

  const run = await db.tableRun.findFirstOrThrow({
    where: { serviceId, tableId: treatmentTableId },
  })

  // Answer correctly by reading the ranking from the database, not the page.
  const shown = run.pairsShown[0]!.split(':')
  const items = await db.menuItem.findMany({
    where: { id: { in: shown } },
    select: { id: true, name: true, trailingSales: true },
  })
  const higher = [...items].sort((a, b) => b.trailingSales - a.trailingSales)[0]!
  await p1.getByRole('button', { name: higher.name }).click()
  await expect
    .poll(async () => (await db.tableRun.findFirstOrThrow({ where: { id: run.id } })).currentRung)
    .toBeGreaterThan(0)

  const afterFirst = await db.tableRun.findFirstOrThrow({ where: { id: run.id } })
  await first.close()

  // Second phone, same tent. It must pick the table up where the first left it.
  const second = await browser.newContext()
  const p2 = await second.newPage()
  await p2.goto(`/t/${treatmentToken}`)
  await p2.getByRole('button', { name: 'Start' }).first().click()

  await expect(p2.getByText(`Rung ${afterFirst.currentRung}`)).toBeVisible()

  // One run for the table, two devices under it — the §6.1 distinction.
  expect(await db.tableRun.count({ where: { serviceId, tableId: treatmentTableId } })).toBe(1)
  expect(await db.deviceSession.count({ where: { tableRunId: run.id } })).toBe(2)
  await second.close()
})

test('a control night is indistinguishable from a closed venue', async ({ page }) => {
  const { serviceId, treatmentToken } = await arrangeService()

  // Flip the service to control. Tents went out on nobody, so a scan is a guest
  // holding last week's tent — and they must learn nothing from the screen.
  await db.service.update({ where: { id: serviceId }, data: { arm: 'CONTROL' } })

  await page.goto(`/t/${treatmentToken}`)
  const control = await page.locator('main').innerText()

  await db.service.update({ where: { id: serviceId }, data: { endedAt: new Date() } })
  await page.goto(`/t/${treatmentToken}`)
  const closed = await page.locator('main').innerText()

  expect(control).toBe(closed)
  expect(await db.tableRun.count({ where: { serviceId } })).toBe(0)
})

test('the event log records the funnel', async ({ page }) => {
  const { serviceId, treatmentToken, treatmentTableId } = await arrangeService()
  await fireFor(serviceId, treatmentTableId)

  await consentAndBegin(page, treatmentToken)

  const types = (await db.event.findMany({ where: { serviceId }, select: { type: true } })).map(
    (e) => e.type
  )

  // Every metric in §6.3 computes from these rows alone, so their presence is
  // the measurement working — not decoration.
  expect(types).toContain('SESSION_OPEN')
  expect(types).toContain('CONSENT_GIVEN')
  expect(types).toContain('RUN_START')
  expect(types).toContain('PAIR_SHOWN')

  // Arm is denormalised onto every row, so no metric needs a join to know it.
  const rows = await db.event.findMany({ where: { serviceId }, select: { arm: true } })
  expect(rows.every((r) => r.arm === 'LIVE')).toBe(true)
})
