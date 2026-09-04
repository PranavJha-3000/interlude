import { expect, test, type Page } from '@playwright/test'
import { arrangeService, db, fireOrderFor, signInWithPassword, venueBy } from './fixtures'

/**
 * Private feedback, and the boundary that keeps it away from Google.
 *
 * The pair of assertions that matter are mirror images:
 *
 * - Here the guest's **words are stored**, deliberately, because they go to the
 *   owner and nowhere public.
 * - On `/review` the guest's words are **never stored**, because storing
 *   sentiment before a public hand-off is what would make gating on it possible.
 *
 * Both are asserted, in this file and in `review-handoff.spec.ts`, so the pair
 * cannot quietly converge.
 */

const OWNER = process.env.SEED_OPERATOR_EMAIL ?? 'owner@example.com'
const OWNER_PASSWORD = process.env.SEED_OPERATOR_PASSWORD ?? 'pilot-owner-dev'
const WORDS = 'The biryani took a while but the kulfi made up for it.'

async function seatAndConsent(page: Page) {
  const arranged = await arrangeService()
  await fireOrderFor(arranged.serviceId, arranged.treatmentTableId)

  await page.goto(`/t/${arranged.treatmentToken}`)
  await page.getByRole('button', { name: 'Start' }).first().click()
  await page.getByRole('button', { name: 'Beat the Kitchen' }).click()
  await expect(page.getByText('Beat the kitchen')).toBeVisible()

  return arranged
}

async function signInFresh(page: Page) {
  await db.operatorLoginAttempt.deleteMany({})
  await signInWithPassword(page, OWNER, OWNER_PASSWORD)
}

test.beforeEach(async () => {
  // The inbox is not scoped to a service, so a note left by an earlier test in
  // this file would still be on the page — and every test here writes the same
  // sentence.
  await db.venueFeedback.deleteMany({})
})

test('feedback reaches the owner, with the words and the rating', async ({ page }) => {
  const { treatmentToken, serviceId } = await seatAndConsent(page)

  await page.goto(`/t/${treatmentToken}/feedback`)
  await page.getByLabel('Your words').fill(WORDS)
  // The input is sr-only and the label is the target — which is what a guest
  // taps, so the test taps it too.
  await page.getByText('4', { exact: true }).click()
  await page.getByRole('button', { name: /Send it to the restaurant/i }).click()
  await expect(page.getByText(/Thank you/i)).toBeVisible()

  const row = await db.venueFeedback.findFirstOrThrow({ where: { serviceId } })
  // The mirror of the review test: here the words ARE stored, on purpose.
  expect(row.body).toBe(WORDS)
  expect(row.rating, 'this table may carry a rating; the review prompt may not').toBe(4)

  await signInFresh(page)
  await page.goto('/dash/feedback')
  await expect(page.getByText(WORDS)).toBeVisible()
  await expect(page.getByText(/4 out of 5/)).toBeVisible()
})

test('feedback earns exactly one life per run, however many notes are left', async ({ page }) => {
  const { treatmentToken, serviceId, treatmentTableId } = await seatAndConsent(page)

  const before = await db.tableRun.findFirstOrThrow({
    where: { serviceId, tableId: treatmentTableId },
  })

  for (const words of ['First note.', 'Second note.']) {
    await page.goto(`/t/${treatmentToken}/feedback`)
    await page.getByLabel('Your words').fill(words)
    await page.getByRole('button', { name: /Send it to the restaurant/i }).click()
    await expect(page.getByText(/Thank you/i)).toBeVisible()
  }

  const after = await db.tableRun.findFirstOrThrow({
    where: { serviceId, tableId: treatmentTableId },
  })

  // A table could otherwise write notes all evening and play forever.
  expect(after.livesRemaining).toBe(before.livesRemaining + 1)
  expect(await db.venueFeedback.count({ where: { serviceId } })).toBe(2)
})

test('feedback writes no review row, and the two routes never link to each other', async ({
  page,
}) => {
  const { treatmentToken, serviceId } = await seatAndConsent(page)

  await page.goto(`/t/${treatmentToken}/feedback`)
  const feedbackScreen = await page.locator('main').innerText()

  await page.getByLabel('Your words').fill(WORDS)
  await page.getByRole('button', { name: /Send it to the restaurant/i }).click()
  await expect(page.getByText(/Thank you/i)).toBeVisible()

  // Private feedback must not touch the Google funnel at all — not even to
  // record that a table said something.
  expect(await db.reviewPrompt.count({ where: { serviceId } })).toBe(0)

  // Neither screen offers a route to the other. Sharing a surface is how "they
  // rated us 2, skip the Google prompt" becomes one `if`.
  //
  // The feedback screen *names* Google on purpose — "this goes to the
  // restaurant, not to Google" is the distinction the guest needs to make an
  // informed choice. What it must not do is link there, so the assertion is
  // about hrefs rather than words.
  await page.goto(`/t/${treatmentToken}/feedback`)
  await expect(page.locator('a[href*="/review"]')).toHaveCount(0)

  await page.goto(`/t/${treatmentToken}/review`)
  await expect(page.locator('a[href*="/feedback"]')).toHaveCount(0)
  const reviewScreen = await page.locator('main').innerText()
  expect(reviewScreen).not.toMatch(/out of five/i)
  expect(feedbackScreen).toMatch(/straight to the restaurant/i)
})

test('an empty note is refused and stores nothing', async ({ page }) => {
  const { treatmentToken, serviceId } = await seatAndConsent(page)

  await page.goto(`/t/${treatmentToken}/feedback`)
  await page.getByLabel('Your words').fill('   ')
  await page.getByRole('button', { name: /Send it to the restaurant/i }).click()

  await expect(page.getByText(/Write something first/i)).toBeVisible()
  expect(await db.venueFeedback.count({ where: { serviceId } })).toBe(0)
})

test('one venue’s feedback never reaches the other venue’s owner', async ({ page }) => {
  const { treatmentToken, serviceId } = await seatAndConsent(page)
  await page.goto(`/t/${treatmentToken}/feedback`)
  await page.getByLabel('Your words').fill(WORDS)
  await page.getByRole('button', { name: /Send it to the restaurant/i }).click()
  await expect(page.getByText(/Thank you/i)).toBeVisible()

  const copper = await venueBy('copper')
  const otherOwner = await db.operatorUser.findFirst({ where: { venueId: copper.id } })
  test.skip(!otherOwner, 'the second venue has no operator seeded')

  await page.context().clearCookies()
  await db.operatorLoginAttempt.deleteMany({})
  await signInWithPassword(page, otherOwner!.email, OWNER_PASSWORD)
  await page.goto('/dash/feedback')

  // The venue scope is the join through Service — that join *is* the
  // authorisation, so this is the assertion that it holds.
  await expect(page.getByText(WORDS)).toHaveCount(0)
  expect(await db.venueFeedback.count({ where: { serviceId } })).toBe(1)
})

test.afterAll(async () => {
  await db.$disconnect()
})
