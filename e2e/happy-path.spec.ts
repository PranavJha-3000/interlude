import { expect, test } from '@playwright/test'
import { arrangeService, correctAnswerFor, db, fireOrderFor, optionsFor } from './fixtures'

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

test('a guest scans, beats the kitchen, adds a dessert, and staff confirms it', async ({
  page,
}) => {
  const { serviceId, treatmentToken, treatmentTableId } = await arrangeService()
  await fireOrderFor(serviceId, treatmentTableId)

  // ── Consent ────────────────────────────────────────────────────────────
  await page.goto(`/t/${treatmentToken}`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('while you wait')

  const before = await db.guestSession.count({ where: { serviceId } })
  expect(before, 'nothing may be recorded before the consent tap').toBe(0)

  await page.getByRole('button', { name: 'Start' }).click()

  // ── Waiting for the kitchen ────────────────────────────────────────────
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your food is on its way')
  await expect(page.getByText(/minutes out/)).toBeVisible()
  expect(await db.guestSession.count({ where: { serviceId } })).toBe(1)

  // ── The round ──────────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Start the round' }).click()
  await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible()

  const play = await db.play.findFirstOrThrow({
    where: { guestSession: { serviceId } },
  })
  expect(play.endsAt.getTime(), 'the end time is issued by the server').toBeGreaterThan(Date.now())

  // Answer every question correctly, so the win is deliberate rather than luck.
  // The round advances on a short delay, so wait for the heading to actually
  // change before reading it — otherwise we look up the answer to the question
  // we just finished.
  const heading = page.locator('h1')
  let previous = ''

  for (let i = 0; i < play.maxScore; i++) {
    if (previous) await expect(heading).not.toHaveText(previous, { timeout: 10_000 })
    const prompt = (await heading.innerText()).trim()
    previous = prompt

    const [answerIndex, options] = await Promise.all([correctAnswerFor(prompt), optionsFor(prompt)])
    await page.getByRole('button', { name: options[answerIndex]!, exact: true }).click()
  }

  // ── Outcome ────────────────────────────────────────────────────────────
  await expect(page.getByRole('heading', { level: 1 })).toContainText('You beat the kitchen', {
    timeout: 15_000,
  })

  const award = await db.award.findFirstOrThrow({
    where: { play: { guestSession: { serviceId } } },
    include: { menuItem: true },
  })
  expect(award.status).toBe('PENDING')
  expect(award.reason.trim().length, 'every award carries a reason').toBeGreaterThan(0)
  expect(award.menuItem.isHero, 'a hero item is never given away').toBe(false)

  // ── Add-on ─────────────────────────────────────────────────────────────
  await expect(page.getByRole('heading', { name: /Add something/ })).toBeVisible()
  const addOnButton = page.locator('form button[type="submit"]').first()
  await addOnButton.click()
  await expect(page.getByText('Sent to your server.')).toBeVisible()

  const addOn = await db.addOnRequest.findFirstOrThrow({
    where: { guestSession: { serviceId } },
  })
  expect(addOn.status).toBe('REQUESTED')
  expect(addOn.pricePaise, 'price is snapshotted at request time').toBeGreaterThan(0)

  // ── Staff confirms ─────────────────────────────────────────────────────
  await page.goto('/floor')
  await page.getByLabel('Your PIN').fill('1234')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByText('Redemptions')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /claims:/ }).click()

  await expect
    .poll(async () => (await db.award.findUniqueOrThrow({ where: { id: award.id } })).status, {
      timeout: 15_000,
    })
    .toBe('CONFIRMED')
})

test('a control table cannot play, and cannot tell that it is a control table', async ({
  page,
}) => {
  const { serviceId, controlToken, treatmentToken } = await arrangeService()

  await page.goto(`/t/${controlToken}`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Nothing running right now')
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0)

  // The wording must be indistinguishable from a closed venue. A guest who
  // works out they are a control behaves differently, which would contaminate
  // the comparison the control exists to provide.
  const controlText = await page.locator('main').innerText()
  await page.context().clearCookies()

  await db.service.update({ where: { id: serviceId }, data: { endedAt: new Date() } })
  await page.goto(`/t/${treatmentToken}`)
  const closedText = await page.locator('main').innerText()
  expect(controlText).toBe(closedText)

  expect(await db.guestSession.count({ where: { serviceId } })).toBe(0)
})

test('an unknown QR token is a 404, not a blank page', async ({ page }) => {
  const res = await page.goto('/t/definitely-not-a-real-token')
  expect(res?.status()).toBe(404)
})
