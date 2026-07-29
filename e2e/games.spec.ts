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

  await expect(page.getByRole('button', { name: 'Beat the kitchen' })).toBeVisible()
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

test('a round already in progress finishes after every game is switched off', async ({ page }) => {
  await enableGames(['KITCHEN_ROUND'])
  const { serviceId, treatmentToken, treatmentTableId } = await arrangeService()
  await fireOrderFor(serviceId, treatmentTableId)

  await page.goto(`/t/${treatmentToken}`)
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: 'Start the round' }).click()
  await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible()

  // The operator closes the door mid-round. The promise made on `/dash/games`
  // — "a round already in progress finishes normally" — is this assertion.
  await enableGames([])
  await page.reload()
  await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible()

  const play = await db.play.findFirstOrThrow({ where: { guestSession: { serviceId } } })
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

  // The outcome screen polls every three seconds while the award is pending, so
  // a page that closed on re-render would take the guest's prize away from them
  // without a tap. Reloading is what that poller does.
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('You beat the kitchen')
  expect(
    await db.award.count({ where: { play: { guestSession: { serviceId } } } }),
    'the award the guest is holding is real, and staff can see it on /floor'
  ).toBe(1)
})

test('a mechanic with no row is still listed, and switching it on writes one', async ({ page }) => {
  const venueId = await enableGames(['KITCHEN_ROUND', 'MYSTERY_PLATE'])
  // The state a half-written venue lands in: no row at all, not a row set false.
  await db.venueGame.deleteMany({ where: { venueId, mechanic: 'MYSTERY_PLATE' } })

  const token = await issueMagicLinkFor('games-operator@example.com')
  await page.goto(`/signin/verify?token=${token}`)
  await page.goto('/dash/games')

  const row = page.getByRole('listitem').filter({ hasText: 'Mystery plate' })
  await expect(row, 'a missing row is still a game the operator can see').toBeVisible()
  await row.getByRole('button', { name: 'Turn on' }).click()

  await expect
    .poll(async () => {
      const written = await db.venueGame.findFirst({
        where: { venueId, mechanic: 'MYSTERY_PLATE' },
      })
      return written?.enabled ?? null
    })
    .toBe(true)
})

test('the pass previews a pool for every game the venue is running', async ({ page }) => {
  await enableGames(['KITCHEN_ROUND', 'MYSTERY_PLATE'])

  // The kitchen PIN lands on /pass directly.
  await page.goto('/floor')
  await page.getByLabel('Your PIN').fill('5678')
  await page.getByRole('button', { name: 'Sign in' }).click()

  // Exact: every entry carries the rule's own label as its reason, and the
  // mystery-plate rule's label contains the words "mystery plate".
  await expect(page.getByRole('heading', { name: "Tonight's pool" })).toBeVisible()
  await expect(page.getByText('Kitchen round', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Mystery plate', { exact: true }),
    'a mystery-plate pool is a different set of items, so the chef is shown it'
  ).toBeVisible()

  // One game on, and the chef gets the single unlabelled list back.
  await enableGames(['MYSTERY_PLATE'])
  await page.reload()
  await expect(page.getByText('Kitchen round', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Mystery plate', { exact: true })).toHaveCount(0)
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
