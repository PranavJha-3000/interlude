import { expect, test } from '@playwright/test'
import {
  arrangeService,
  correctAnswerFor,
  db,
  fireOrderFor,
  issueMagicLinkFor,
  optionsFor,
} from './fixtures'

/**
 * Game selection. The guest chooses a stake; the operator chooses whether there
 * is a choice at all.
 */

test.afterAll(async () => {
  await db.$disconnect()
})

/** Both games on, which is how a venue is created. */
async function enableGames(mechanics: Array<'KITCHEN_ROUND' | 'MYSTERY_PLATE'>) {
  const venue = await db.venue.findFirstOrThrow()
  await db.venueGame.updateMany({ where: { venueId: venue.id }, data: { enabled: false } })
  if (mechanics.length > 0) {
    await db.venueGame.updateMany({
      where: { venueId: venue.id, mechanic: { in: mechanics } },
      data: { enabled: true },
    })
  }
  return venue.id
}

test.afterEach(async () => {
  await enableGames(['KITCHEN_ROUND', 'MYSTERY_PLATE'])
})

test('with both games on, the guest picks a stake and the choice is what gets played', async ({
  page,
}) => {
  await enableGames(['KITCHEN_ROUND', 'MYSTERY_PLATE'])
  const { serviceId, treatmentToken, treatmentTableId } = await arrangeService()
  await fireOrderFor(serviceId, treatmentTableId)

  await page.goto(`/t/${treatmentToken}`)
  await page.getByRole('button', { name: 'Start' }).click()

  // Not `getByRole('button', { name: 'Beat the kitchen' })`: that substring also
  // appears inside the mystery-plate blurb ("Beat the kitchen and you can
  // have…"), so a non-exact accessible-name match resolves to both buttons.
  // Filtering by the heading span's own exact text disambiguates without
  // touching the copy.
  await expect(
    page.getByRole('button').filter({ has: page.getByText('Beat the kitchen', { exact: true }) })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Tonight’s chef’s plate' }).click()

  await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible()
  const play = await db.play.findFirstOrThrow({ where: { guestSession: { serviceId } } })
  expect(play.mechanic, 'the guest chose the stake, not the server').toBe('MYSTERY_PLATE')

  // Play it out, so the award proves the mechanic reached the prize engine.
  const heading = page.locator('h1')
  let previous = ''
  for (let i = 0; i < play.maxScore; i++) {
    if (previous) await expect(heading).not.toHaveText(previous, { timeout: 10_000 })
    const prompt = (await heading.innerText()).trim()
    previous = prompt
    const [answerIndex, options] = await Promise.all([correctAnswerFor(prompt), optionsFor(prompt)])
    await page.getByRole('button', { name: options[answerIndex]!, exact: true }).click()
  }

  await expect(page.getByRole('heading', { level: 1 })).toContainText('You beat the kitchen', {
    timeout: 15_000,
  })

  const award = await db.award.findFirstOrThrow({
    where: { play: { guestSession: { serviceId } } },
  })
  expect(award.kind, 'the mystery plate is a fixed price, never a discount').toBe('FIXED_PRICE')
  expect(award.fixedPricePaise ?? 0).toBeGreaterThan(0)

  const pool = await db.prizePool.findFirstOrThrow({
    where: { serviceId },
    orderBy: { snapshotAt: 'desc' },
  })
  expect(pool.mechanic, 'the audit trail records the game that was played').toBe('MYSTERY_PLATE')
})

test('with one game on, there is no picker and the round starts as it always did', async ({
  page,
}) => {
  await enableGames(['KITCHEN_ROUND'])
  const { serviceId, treatmentToken, treatmentTableId } = await arrangeService()
  await fireOrderFor(serviceId, treatmentTableId)

  await page.goto(`/t/${treatmentToken}`)
  await page.getByRole('button', { name: 'Start' }).click()

  await expect(page.getByRole('button', { name: 'Pick your stake' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Tonight’s chef’s plate' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Start the round' }).click()

  await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible()
  const play = await db.play.findFirstOrThrow({ where: { guestSession: { serviceId } } })
  expect(play.mechanic).toBe('KITCHEN_ROUND')
})

test('with every game off, the venue looks closed and nothing is recorded', async ({ page }) => {
  await enableGames([])
  const { serviceId, treatmentToken, treatmentTableId } = await arrangeService()
  await fireOrderFor(serviceId, treatmentTableId)

  await page.goto(`/t/${treatmentToken}`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Nothing running right now')
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0)

  expect(await db.guestSession.count({ where: { serviceId } })).toBe(0)
})

test('the operator turns a game off and the guest stops being offered it', async ({ page }) => {
  await enableGames(['KITCHEN_ROUND', 'MYSTERY_PLATE'])

  const token = await issueMagicLinkFor('games-operator@example.com')
  await page.goto(`/signin/verify?token=${token}`)
  await page.goto('/dash/games')

  await expect(page.getByRole('heading', { name: 'Games' })).toBeVisible()
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Mystery plate' })
    .getByRole('button', { name: 'Turn off' })
    .click()

  await expect
    .poll(async () => {
      const venue = await db.venue.findFirstOrThrow()
      const row = await db.venueGame.findFirstOrThrow({
        where: { venueId: venue.id, mechanic: 'MYSTERY_PLATE' },
      })
      return row.enabled
    })
    .toBe(false)

  // And the guest surface follows immediately — no picker, straight to the round.
  const { serviceId, treatmentToken, treatmentTableId } = await arrangeService()
  await fireOrderFor(serviceId, treatmentTableId)

  await page.context().clearCookies()
  await page.goto(`/t/${treatmentToken}`)
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByRole('button', { name: 'Tonight’s chef’s plate' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Start the round' })).toBeVisible()
})
