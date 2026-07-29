import { expect, test } from '@playwright/test'
import { arrangeServiceFor, db, issueMagicLinkFor, venueBy } from './fixtures'

/**
 * Multi-tenant isolation.
 *
 * **What this proves, and what it does not.** No operator route accepts a venue
 * id — the session is the only source of one (SECURITY.md §8) — so "ask for
 * venue B and get a 404" is not expressible as a request. What is expressible,
 * and is the property that actually matters, is that an operator signed into A
 * sees only A, while B's data demonstrably exists in the same database at the
 * same moment. That is what this asserts.
 */

test.afterAll(async () => {
  await db.$disconnect()
})

test('an operator signed into one venue sees none of the other', async ({ page }) => {
  const pilot = await venueBy('pilot')
  const copper = await venueBy('copper')
  expect(pilot.id).not.toBe(copper.id)

  // Both venues are live at once. If the dashboards did not scope, this is the
  // moment the numbers would blend.
  const a = await arrangeServiceFor('pilot')
  const b = await arrangeServiceFor('copper')

  const copperTables = await db.table.findMany({
    where: { venueId: copper.id },
    select: { label: true },
  })

  const token = await issueMagicLinkFor('owner@example.com')
  await page.goto(`/signin/verify?token=${token}`)

  // The dashboard's own venue, and nothing else.
  await page.goto('/dash')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  // Give the *other* venue a scan, and only the other venue. Venue A's
  // activity page must stay empty — an assertion that fails loudly if the
  // service scope ever widens, unlike "the page does not contain B's name",
  // which would pass even if scoping were removed entirely.
  const copperTable = await db.table.findFirstOrThrow({
    where: { venueId: copper.id },
    select: { id: true },
  })
  await db.guestSession.create({
    data: {
      tableId: copperTable.id,
      serviceId: b.serviceId,
      armAtScan: 'TREATMENT',
      consentAt: new Date(),
    },
  })

  await page.goto('/dash/activity')
  const activityText = await page.locator('main').innerText()
  expect(activityText, "venue B's scan must not appear on venue A's activity page").toContain(
    'No scans yet'
  )
  expect(await db.guestSession.count({ where: { serviceId: b.serviceId } })).toBe(1)

  // The tent sheet is the surface that lists every table by label, so it is
  // where a leak would be most visible. The operator session from above is
  // still live, so this renders straight from `getOperatorWithoutVenue()` —
  // no PIN pad, because that guard exists for a staff tablet that never signed
  // in as an operator at all (src/app/(operator)/tents/page.tsx).
  await page.goto('/tents')

  const tentsText = await page.locator('body').innerText()

  // Presence before absence. Every check below is `not.toContain`, so a
  // redirect, a 404 or a render error would satisfy all of them at once and
  // report an isolation this test never performed. Pilot's own treatment table
  // is on this sheet — its token is printed under the QR — so this pins the
  // sheet as genuinely rendered and genuinely Pilot's before anything is
  // asserted to be missing from it.
  expect(tentsText, "venue A's own tent sheet did not render").toContain(a.treatmentToken)

  expect(tentsText).not.toContain(copper.qrToken)
  for (const t of copperTables) {
    const stillCopper = await db.table.findFirst({
      where: { venueId: copper.id, label: t.label },
      select: { qrToken: true },
    })
    expect(tentsText, `venue B's table token leaked onto venue A's tent sheet`).not.toContain(
      stillCopper!.qrToken
    )
  }

  expect(a.serviceId).not.toBe(b.serviceId)
})

test("a venue's QR resolves only to its own tables", async ({ page }) => {
  const pilot = await venueBy('pilot')
  const copper = await venueBy('copper')

  const copperTokens = (
    await db.table.findMany({ where: { venueId: copper.id }, select: { qrToken: true } })
  ).map((t) => t.qrToken)
  const pilotTable = await db.table.findFirstOrThrow({
    where: { venueId: pilot.id, active: true },
    select: { qrToken: true },
  })

  await page.goto(`/v/${pilot.qrToken}`)
  const html = await page.content()

  // Presence before absence. The picker renders a `noTables` empty state
  // whenever the list comes back empty, so any regression that returns zero
  // tables — a broken `resolveVenueScan`, a changed `active` filter, an
  // over-narrowed scoping fix — would make every `not.toContain` below pass
  // and report an isolation that was never checked.
  expect(html, "venue A's own tables must be in its own picker").toContain(pilotTable.qrToken)

  for (const token of copperTokens) {
    expect(html, "the other venue's table tokens must not appear in this picker").not.toContain(
      token
    )
  }
})

test("one venue's staff PIN does not open the other venue's floor", async ({ page }) => {
  // Copper's server PIN is 4321. The pilot venue's is 1234. A PIN is scoped to
  // the venue that issued it, so Copper's must be refused here — and refused
  // with the same words a wrong PIN gets, or the message would tell someone
  // probing which venue a PIN belongs to.
  await page.context().clearCookies()
  await page.goto('/floor/pilot')
  await page.getByLabel('Your PIN').fill('4321')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByText("That PIN didn't work.")).toBeVisible()
  await expect(page).toHaveURL(/\/floor\/pilot/)
})

/**
 * The positive control. Without it the refusal above would also pass if PIN
 * 4321 simply worked nowhere — it proves the refusal is about scoping.
 */
test("a venue's own PIN opens its own floor", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto('/floor/copper')
  await page.getByLabel('Your PIN').fill('4321')
  await page.getByRole('button', { name: 'Sign in' }).click()

  // URL first: it is the assertion that waits for the round trip, so the
  // "no error shown" check below cannot pass merely by running too early.
  await expect(page).toHaveURL(/\/floor$/)
  await expect(page.getByText("That PIN didn't work.")).toHaveCount(0)

  // The session it minted names Copper, not the venue whose floor refused it.
  const copper = await venueBy('copper')
  await page.goto('/tents')
  await expect(page.locator('body')).toContainText(copper.name)
})
