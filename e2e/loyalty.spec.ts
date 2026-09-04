import { expect, test, type Page } from '@playwright/test'
import { arrangeServiceFor, db, fireOrderFor, venueBy } from './fixtures'

/**
 * The stamp card, end to end.
 *
 * Three things are being proved here, and only one of them is "the feature
 * works":
 *
 * 1. **The number never lands anywhere.** Not in a row, not in an event. The
 *    only trace is an HMAC, and a different one at every venue.
 * 2. **Every fence the game respects, loyalty respects** — because it is the
 *    same `decidePrizePool` call, not a second one. A returning guest cannot be
 *    given a hero item, a vetoed item, or value the service budget has spent.
 * 3. **The offer on the spent screen is real.** "Leave a phone number" was
 *    advertised to guests for the whole of V1 with no route behind it.
 */

const NUMBER = '98765 43210'

async function seatAndConsent(page: Page, slug = 'pilot') {
  const arranged = await arrangeServiceFor(slug)
  await fireOrderFor(arranged.serviceId, arranged.treatmentTableId)

  await page.goto(`/t/${arranged.treatmentToken}`)
  await page.getByRole('button', { name: 'Start' }).first().click()
  await page.getByRole('button', { name: 'Beat the Kitchen' }).click()
  await expect(page.getByText('Beat the kitchen')).toBeVisible()

  return arranged
}

/** Set this venue's loyalty fences for one test. */
async function configure(slug: string, data: Record<string, unknown>) {
  const venue = await venueBy(slug)
  await db.venueConfig.update({ where: { venueId: venue.id }, data })
  return venue
}

test.beforeEach(async () => {
  // Each test owns the guest list and the loyalty ledger outright. Scoping the
  // wipe to one venue is not enough: the cross-venue test writes at Copper, and
  // the counts below are global by design — a loyalty award leaking in from a
  // previous test would make "no reward was given" pass or fail for the wrong
  // reason.
  await db.guestVisit.deleteMany({})
  await db.guestIdentity.deleteMany({})
  await db.award.deleteMany({ where: { origin: 'LOYALTY' } })

  await configure('pilot', {
    loyaltyEnabled: true,
    loyaltyVisitsRequired: 2,
    loyaltyRewardMaxValuePaise: 100_000,
    depthCapPerServicePaise: 500_000,
    depthCapPerItemPct: 100,
  })
})

test('the spent screen offers a phone number, and the offer goes somewhere', async ({ page }) => {
  const { treatmentToken, treatmentTableId, serviceId } = await seatAndConsent(page)

  // Spend the device so the earning actions are on screen.
  const device = await db.deviceSession.findFirstOrThrow({
    where: { tableRun: { serviceId, tableId: treatmentTableId } },
  })
  await db.deviceSession.update({ where: { id: device.id }, data: { spentAt: new Date() } })

  await page.goto(`/t/${treatmentToken}`)
  const offer = page.getByRole('link', { name: /Leave a phone number/i })
  await expect(offer, 'this was inert text for the whole of V1').toBeVisible()

  await offer.click()
  await expect(page).toHaveURL(new RegExp(`/t/${treatmentToken}/phone`))
  await expect(page.getByLabel('Your mobile number')).toBeVisible()
})

test('leaving a number earns the table a go, and stores no number anywhere', async ({ page }) => {
  const { treatmentToken, serviceId, treatmentTableId } = await seatAndConsent(page)

  const before = await db.tableRun.findFirstOrThrow({
    where: { serviceId, tableId: treatmentTableId },
  })

  await page.goto(`/t/${treatmentToken}/phone`)
  await page.getByLabel('Your mobile number').fill(NUMBER)
  await page.getByRole('button', { name: 'Leave it' }).click()
  await expect(page.getByText(/another go for the table/i)).toBeVisible()

  const after = await db.tableRun.findFirstOrThrow({
    where: { serviceId, tableId: treatmentTableId },
  })
  expect(after.livesRemaining, 'the life the screen promised').toBe(before.livesRemaining + 1)

  const events = await db.event.findMany({ where: { serviceId } })
  expect(events.map((e) => e.type)).toContain('PHONE_SUBMITTED')
  expect(events.map((e) => e.type)).toContain('LOYALTY_STAMPED')

  // The number itself must not exist anywhere — not in an event payload, not on
  // the identity, not on the visit. Only the HMAC.
  const identities = await db.guestIdentity.findMany()
  const visits = await db.guestVisit.findMany()
  const dump = JSON.stringify({ events, identities, visits })
  expect(dump, 'the raw number must never be stored').not.toContain('9876543210')
  expect(identities).toHaveLength(1)
  expect(identities[0]!.phoneHmac).not.toContain('9876543210')
})

test('one number, one service, one stamp — however many times it is typed', async ({ page }) => {
  const { treatmentToken } = await seatAndConsent(page)

  for (const spelling of [NUMBER, '+91 98765 43210', '098765-43210']) {
    await page.goto(`/t/${treatmentToken}/phone`)
    await page.getByLabel('Your mobile number').fill(spelling)
    await page.getByRole('button', { name: 'Leave it' }).click()
    await expect(page.getByText(/Thank you/i)).toBeVisible()
  }

  // All three spellings are one person, so all three are one stamp. If
  // normalisation were wrong this would be three identities — and nothing
  // downstream could ever detect or repair it, because the hash is one-way.
  expect(await db.guestIdentity.count()).toBe(1)
  expect(await db.guestVisit.count()).toBe(1)
})

test('the same number at two venues is two identities that cannot be joined', async ({ page }) => {
  const pilot = await seatAndConsent(page, 'pilot')
  await page.goto(`/t/${pilot.treatmentToken}/phone`)
  await page.getByLabel('Your mobile number').fill(NUMBER)
  await page.getByRole('button', { name: 'Leave it' }).click()
  await expect(page.getByText(/Thank you/i)).toBeVisible()

  await page.context().clearCookies()

  const copper = await seatAndConsent(page, 'copper')
  await page.goto(`/t/${copper.treatmentToken}/phone`)
  await page.getByLabel('Your mobile number').fill(NUMBER)
  await page.getByRole('button', { name: 'Leave it' }).click()
  await expect(page.getByText(/Thank you/i)).toBeVisible()

  const identities = await db.guestIdentity.findMany({ select: { venueId: true, phoneHmac: true } })
  expect(identities.length).toBeGreaterThanOrEqual(2)

  // **The DPDP invariant.** Per-venue salts mean the same number produces
  // different hashes, so no query can join one venue's guest list to another's.
  // If these were ever equal, cross-venue identity would exist by accident.
  const hashes = new Set(identities.map((i) => i.phoneHmac))
  expect(hashes.size, 'the same number must hash differently per venue').toBe(identities.length)
})

test('the Nth visit pays out, through the same engine the game uses', async ({ page }) => {
  // Visit one.
  const first = await seatAndConsent(page)
  await page.goto(`/t/${first.treatmentToken}/phone`)
  await page.getByLabel('Your mobile number').fill(NUMBER)
  await page.getByRole('button', { name: 'Leave it' }).click()
  await expect(page.getByText(/Thank you/i)).toBeVisible()
  expect(await db.award.count({ where: { origin: 'LOYALTY' } })).toBe(0)

  // Visit two — a new service is a new night, and the threshold is 2.
  await page.context().clearCookies()
  const second = await seatAndConsent(page)
  await page.goto(`/t/${second.treatmentToken}/phone`)
  await page.getByLabel('Your mobile number').fill(NUMBER)
  await page.getByRole('button', { name: 'Leave it' }).click()

  await expect(page.getByText(/earned something/i)).toBeVisible()

  const award = await db.award.findFirstOrThrow({ where: { origin: 'LOYALTY' } })
  expect(award.rung, 'a loyalty reward is not a rung').toBeNull()
  expect(award.reason).toContain('visit')
  expect(award.code).toBeTruthy()
  // The audit trail: which pool decided this. Never linked before the extraction.
  expect(award.prizePoolId).not.toBeNull()

  const visit = await db.guestVisit.findFirstOrThrow({ where: { awardId: award.id } })
  expect(visit.visitNumber).toBe(2)
})

test('every fence the game respects, loyalty respects', async ({ page }) => {
  const venue = await venueBy('pilot')

  // Visit one, no reward yet.
  const first = await seatAndConsent(page)
  await page.goto(`/t/${first.treatmentToken}/phone`)
  await page.getByLabel('Your mobile number').fill(NUMBER)
  await page.getByRole('button', { name: 'Leave it' }).click()
  await expect(page.getByText(/Thank you/i)).toBeVisible()

  // Spend the entire service budget, so the engine can afford nothing at all.
  // This is the fence that only started working when the conceded total was
  // fixed — see e2e/depth-cap.spec.ts.
  await configure('pilot', { depthCapPerServicePaise: 1 })

  await page.context().clearCookies()
  const second = await seatAndConsent(page)
  await page.goto(`/t/${second.treatmentToken}/phone`)
  await page.getByLabel('Your mobile number').fill(NUMBER)
  await page.getByRole('button', { name: 'Leave it' }).click()

  // The stamp still counts — a fence is not a reason to forget the guest came.
  await expect(page.getByText(/Thank you/i)).toBeVisible()
  await expect(page.getByText(/earned something/i)).toHaveCount(0)
  expect(await db.award.count({ where: { origin: 'LOYALTY' } })).toBe(0)

  const stamped = await db.guestVisit.count({ where: { venueId: venue.id } })
  expect(stamped, 'both visits counted, neither paid').toBe(2)
})

test('the chef’s kill switch stops the reward but not the stamp', async ({ page }) => {
  const first = await seatAndConsent(page)
  await page.goto(`/t/${first.treatmentToken}/phone`)
  await page.getByLabel('Your mobile number').fill(NUMBER)
  await page.getByRole('button', { name: 'Leave it' }).click()
  await expect(page.getByText(/Thank you/i)).toBeVisible()

  await page.context().clearCookies()
  const second = await seatAndConsent(page)
  await db.service.update({ where: { id: second.serviceId }, data: { killedAt: new Date() } })

  await page.goto(`/t/${second.treatmentToken}/phone`)
  await page.getByLabel('Your mobile number').fill(NUMBER)
  await page.getByRole('button', { name: 'Leave it' }).click()
  await expect(page.getByText(/Thank you/i)).toBeVisible()

  expect(await db.award.count({ where: { origin: 'LOYALTY' } })).toBe(0)
  const events = await db.event.findMany({ where: { serviceId: second.serviceId } })
  expect(events.map((e) => e.type)).toContain('LOYALTY_STAMPED')
  expect(events.map((e) => e.type)).not.toContain('LOYALTY_REWARDED')
})

test('loyalty switched off accumulates stamps and pays nothing', async ({ page }) => {
  await configure('pilot', { loyaltyEnabled: false })

  for (let i = 0; i < 2; i++) {
    await page.context().clearCookies()
    const arranged = await seatAndConsent(page)
    await page.goto(`/t/${arranged.treatmentToken}/phone`)
    await page.getByLabel('Your mobile number').fill(NUMBER)
    await page.getByRole('button', { name: 'Leave it' }).click()
    await expect(page.getByText(/Thank you/i)).toBeVisible()
  }

  expect(await db.guestVisit.count()).toBe(2)
  expect(await db.award.count({ where: { origin: 'LOYALTY' } })).toBe(0)
})

test('a malformed number is refused by name, and writes nothing', async ({ page }) => {
  const { treatmentToken } = await seatAndConsent(page)

  await page.goto(`/t/${treatmentToken}/phone`)
  await page.getByLabel('Your mobile number').fill('12345')
  await page.getByRole('button', { name: 'Leave it' }).click()

  await expect(page.getByText(/ten digits/i)).toBeVisible()
  expect(await db.guestIdentity.count()).toBe(0)
  expect(await db.guestVisit.count()).toBe(0)
})

test('a control night cannot leave a number either', async ({ page }) => {
  // The service is the unit of arm assignment, not the table — a control night
  // put no tents out at all, so a scan is a guest holding last week's tent.
  const { serviceId, treatmentToken } = await seatAndConsent(page)
  await db.service.update({ where: { id: serviceId }, data: { arm: 'CONTROL' } })

  await page.goto(`/t/${treatmentToken}/phone`)
  const control = await page.locator('main').innerText()

  await db.service.update({ where: { id: serviceId }, data: { endedAt: new Date() } })
  await page.goto(`/t/${treatmentToken}/phone`)
  const closed = await page.locator('main').innerText()

  // Byte-identical to the closed-venue screen. If a guest could tell a control
  // night apart on *any* route, the experiment is contaminated — and the phone
  // route is a new route, so it is a new way to leak it.
  expect(control).toBe(closed)
  expect(await db.guestIdentity.count()).toBe(0)
})

test('erasure removes the guest but never the sale', async ({ page }) => {
  // Two visits, so the second pays out and there is an Award to protect.
  const first = await seatAndConsent(page)
  await page.goto(`/t/${first.treatmentToken}/phone`)
  await page.getByLabel('Your mobile number').fill(NUMBER)
  await page.getByRole('button', { name: 'Leave it' }).click()
  await expect(page.getByText(/Thank you/i)).toBeVisible()

  await page.context().clearCookies()
  const second = await seatAndConsent(page)
  await page.goto(`/t/${second.treatmentToken}/phone`)
  await page.getByLabel('Your mobile number').fill(NUMBER)
  await page.getByRole('button', { name: 'Leave it' }).click()
  await expect(page.getByText(/earned something/i)).toBeVisible()

  const awardsBefore = await db.award.count({ where: { origin: 'LOYALTY' } })
  expect(awardsBefore).toBe(1)

  await page.goto(`/t/${second.treatmentToken}/phone/erase`)
  await page.getByLabel('The number to remove').fill(NUMBER)
  await page.getByRole('button', { name: 'Remove it' }).click()
  await expect(page.getByText(/it and its visits are gone/i)).toBeVisible()

  expect(await db.guestIdentity.count()).toBe(0)
  expect(await db.guestVisit.count()).toBe(0)
  // The award is the money record. Erasing a person must not erase a sale.
  expect(await db.award.count({ where: { origin: 'LOYALTY' } })).toBe(awardsBefore)
})

test('erasing an unknown number is indistinguishable from erasing a known one', async ({
  page,
}) => {
  const { treatmentToken, serviceId } = await seatAndConsent(page)

  await page.goto(`/t/${treatmentToken}/phone/erase`)
  await page.getByLabel('The number to remove').fill('99999 99999')
  await page.getByRole('button', { name: 'Remove it' }).click()

  // Same words, same screen. Any difference makes this an oracle for "does this
  // person eat here", which is the question SECURITY.md §6 says we cannot answer.
  await expect(page.getByText(/it and its visits are gone/i)).toBeVisible()

  // Scoped to this service: the event log is append-only and never cleared, so
  // a global query would pick up the previous test's genuine erasure.
  const events = await db.event.findMany({ where: { serviceId, type: 'PHONE_ERASED' } })
  expect(events, 'nothing to record — nothing was there').toHaveLength(0)
})

test.afterAll(async () => {
  // Restore the seeded fences so a later spec does not inherit this file's.
  await configure('pilot', {
    loyaltyEnabled: false,
    loyaltyVisitsRequired: 5,
    loyaltyRewardMaxValuePaise: 25_000,
    depthCapPerServicePaise: 500_000,
  })
  await db.$disconnect()
})
