import { expect, test, type Page } from '@playwright/test'
import { arrangeService, db, fireOrderFor, signInWithPassword, venueBy } from './fixtures'

/**
 * The review hand-off, end to end (§7.2) — and the field that makes it work.
 *
 * `Venue.googlePlaceId` was read by the review screen and written by nothing:
 * no onboarding step, no dashboard form, not even the seed. So on any real
 * deployment it was permanently null, the hand-off button never rendered, and
 * the funnel would have recorded 100% shown and 0% handed off as though that
 * were a finding about guests. Unit tests could not catch it — each half was
 * correct on its own. Only the whole path shows it.
 *
 * The boundary assertions come along too: the screen must render identically
 * for a table that never played, and the guest's words must never reach us.
 */

const OWNER = process.env.SEED_OPERATOR_EMAIL ?? 'owner@example.com'
const OWNER_PASSWORD = process.env.SEED_OPERATOR_PASSWORD ?? 'pilot-owner-dev'

/** A real Place ID shape. Opaque by design — this one is Google's own sample. */
const PLACE_ID = 'ChIJN1t_tDeuEmsRUsoyG83frY4'

async function signInFresh(page: Page) {
  // Same reason as dashboard.spec.ts: the suite is serial and the throttle
  // counts per IP, so a working rate limiter would otherwise look like a broken
  // settings page.
  await db.operatorLoginAttempt.deleteMany({})
  await signInWithPassword(page, OWNER, OWNER_PASSWORD)
}

/** Unlink the venue, so each test starts from the state a real deployment has. */
async function unlink() {
  const venue = await venueBy('pilot')
  await db.venue.update({ where: { id: venue.id }, data: { googlePlaceId: null } })
  return venue
}

const HAND_OFF = 'Open Google reviews'
const NO_PLACE_ID = /hasn.t linked its Google profile/i

/**
 * Arrange a table that has ordered and consented — the state a guest is in when
 * the bill arrives, which is the only state the review screen is reachable from.
 *
 * The fire is not optional: without it the guest sits on "your food hasn't hit
 * the fire yet" and never gets a run, so the review screen has no `TableRun` to
 * attach its funnel row to.
 */
async function seatedAndConsented(page: Page): Promise<{ serviceId: string; token: string }> {
  const { serviceId, treatmentToken, treatmentTableId } = await arrangeService()
  await fireOrderFor(serviceId, treatmentTableId)

  await page.goto(`/t/${treatmentToken}`)
  await page.getByRole('button', { name: 'Start' }).first().click()
  await page.getByRole('button', { name: 'Beat the Kitchen' }).click()
  await expect(page.getByText('Beat the kitchen')).toBeVisible()

  return { serviceId, token: treatmentToken }
}

test('an owner links their Google profile and the guest hand-off starts working', async ({
  page,
}) => {
  const venue = await unlink()
  const { token } = await seatedAndConsented(page)

  // --- Before: the guest screen has nowhere to send anyone -------------------
  await page.goto(`/t/${token}/review`)
  await expect(page.getByText(NO_PLACE_ID)).toBeVisible()
  await expect(page.getByRole('button', { name: HAND_OFF })).toHaveCount(0)

  // --- The owner links it ---------------------------------------------------
  await signInFresh(page)
  await page.goto('/dash/settings')
  await page.getByLabel('Your Google Place ID').fill(PLACE_ID)
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText(/Linked\./)).toBeVisible()
  expect((await db.venue.findUniqueOrThrow({ where: { id: venue.id } })).googlePlaceId).toBe(
    PLACE_ID
  )

  // The exact URL a guest gets, on the screen. A wrong Place ID errors nowhere
  // — it just sends people to another restaurant — so looking is the only check.
  await expect(page.getByText(`writereview?placeid=${PLACE_ID}`)).toBeVisible()

  // --- After: the same guest, same table, now hands off ---------------------
  // The guest cookie is still in the jar, so this is the same visit rather than
  // a fresh arrangement — which is the point: nothing about the guest changed.
  await page.goto(`/t/${token}/review`)
  await expect(page.getByText(NO_PLACE_ID)).toHaveCount(0)
  await expect(page.getByRole('button', { name: HAND_OFF })).toBeVisible()
})

test('a pasted Google short link is refused by name, not as "invalid"', async ({ page }) => {
  await unlink()
  await signInFresh(page)
  await page.goto('/dash/settings')

  // What Google Business Profile actually hands an owner under "ask for
  // reviews". It contains no Place ID, so the right answer is to say so.
  await page.getByLabel('Your Google Place ID').fill('https://g.page/r/CQVpaBpTHPvzEAI/review')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText(/short link/i)).toBeVisible()
  const venue = await venueBy('pilot')
  expect(venue.googlePlaceId, 'a refused value must not be stored').toBeNull()
})

test('the review prompt records the funnel and never the words', async ({ page }) => {
  const venue = await unlink()
  await db.venue.update({ where: { id: venue.id }, data: { googlePlaceId: PLACE_ID } })
  const { serviceId, token } = await seatedAndConsented(page)

  await page.goto(`/t/${token}/review`)

  // Shown is counted on render, once.
  const shown = await db.reviewPrompt.findMany({ where: { serviceId } })
  expect(shown).toHaveLength(1)
  expect(shown[0]!.handedOffAt).toBeNull()

  // The action redirects to Google's own dialog, which is the product working
  // and would be a real network call from a test. Blocked, not followed.
  await page.route('https://search.google.com/**', (route) => route.abort())

  await page.getByRole('textbox').fill('The biryani was worth the wait.')
  // The click only dispatches; the funnel row is written by the server action
  // that follows it. Reading the database without waiting races the write.
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST'),
    page.getByRole('button', { name: HAND_OFF }).click(),
  ])

  const after = await db.reviewPrompt.findFirstOrThrow({ where: { serviceId } })
  expect(after.draftedAt, 'a non-empty draft counts as drafted').not.toBeNull()
  expect(after.handedOffAt).not.toBeNull()

  // §7.2: funnel counts only. If any column ever holds what the guest typed,
  // the product has gained the ability to gate on sentiment.
  const stored = JSON.stringify(after)
  expect(stored, "the guest's words must not be in the row").not.toContain('biryani')
})

test('the prompt renders for a table that never played', async ({ page }) => {
  const venue = await unlink()
  await db.venue.update({ where: { id: venue.id }, data: { googlePlaceId: PLACE_ID } })

  // Consent, and then nothing — no run begun, no pair answered, no win.
  const { serviceId, token } = await seatedAndConsented(page)
  await page.goto(`/t/${token}/review`)

  // The screen is structurally forbidden from consulting play state, so this is
  // the visible half of a boundary the ESLint rule enforces invisibly.
  await expect(page.getByRole('textbox')).toBeVisible()
  await expect(page.getByRole('button', { name: HAND_OFF })).toBeVisible()

  expect(await db.play.count({ where: { guestSession: { serviceId } } })).toBe(0)
})

test('the funnel counts tables that were offered the prompt and ignored it', async ({ page }) => {
  const venue = await unlink()
  await db.venue.update({ where: { id: venue.id }, data: { googlePlaceId: PLACE_ID } })
  const { serviceId, token } = await seatedAndConsented(page)

  // Spend the device so the visit-ending screen — the one carrying the entry
  // link — renders.
  const device = await db.deviceSession.findFirstOrThrow({ where: { tableRun: { serviceId } } })
  await db.deviceSession.update({ where: { id: device.id }, data: { spentAt: new Date() } })

  await page.goto(`/t/${token}`)
  await expect(page.getByText(/tell people how it went/i)).toBeVisible()

  // **This row did not exist before.** `shownAt` used to be written when a guest
  // opened /review, so the funnel had no denominator: every row that existed had
  // already converted, and every table that saw the link and ignored it was
  // invisible.
  const shown = await db.reviewPrompt.findFirstOrThrow({ where: { serviceId } })
  expect(shown.openedAt, 'offered, not opened').toBeNull()
  expect(shown.handedOffAt).toBeNull()

  // The guest surface polls, so re-rendering must not inflate the count.
  await page.goto(`/t/${token}`)
  await page.goto(`/t/${token}`)
  expect(await db.reviewPrompt.count({ where: { serviceId } })).toBe(1)

  // Opening stamps `openedAt` once, and a reload does not move it.
  await page.goto(`/t/${token}/review`)
  const opened = await db.reviewPrompt.findFirstOrThrow({ where: { serviceId } })
  expect(opened.openedAt).not.toBeNull()

  await page.goto(`/t/${token}/review`)
  const reopened = await db.reviewPrompt.findFirstOrThrow({ where: { serviceId } })
  expect(reopened.openedAt?.getTime()).toBe(opened.openedAt?.getTime())
})

test('the owner can finally see the funnel on /dash', async ({ page }) => {
  const venue = await unlink()
  await db.venue.update({ where: { id: venue.id }, data: { googlePlaceId: PLACE_ID } })
  const { serviceId, token } = await seatedAndConsented(page)

  await page.goto(`/t/${token}/review`)
  expect(await db.reviewPrompt.count({ where: { serviceId } })).toBe(1)

  await signInFresh(page)
  await page.goto('/dash')

  // Collected every night since the review screen shipped, and read by nobody
  // until now — `summariseReviewFunnel` had no application caller at all.
  const panel = page.getByText(/Google review prompt/i)
  await expect(panel).toBeVisible()
  await panel.click()

  // The honest limit, on the screen rather than only in a doc: a hand-off is
  // not a review, and we do not read Google.
  await expect(page.getByText(/can.t see whether they posted/i)).toBeVisible()
})
