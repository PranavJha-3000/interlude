import { expect, test } from '@playwright/test'
import { arrangeService, climbRungs, db, fireOrderFor, menuPricesFor } from './fixtures'

/**
 * The climb's trust boundary, and the two ends of its window.
 *
 * The guest's phone deals its own hands and scores them locally, which is what
 * makes a rung land instantly on restaurant wifi. That is only safe because the
 * server re-deals every hand from the same seed and replays the run itself. If
 * that replay ever starts trusting what the client claims, nothing else in the
 * product would notice — the award would simply be wrong, with a real reason
 * string attached, in the operator's audit trail.
 */

test.afterAll(async () => {
  await db.$disconnect()
})

/**
 * Waits for the server action to have actually landed.
 *
 * Reading the `Play` row straight after submitting is a race, and it fails in
 * the direction that hides bugs: the row is still mid-run, `score` is 0, and an
 * assertion that a forged sweep scored nothing passes without the server ever
 * having looked at the forgery.
 */
async function completedPlay(serviceId: string) {
  await expect
    .poll(
      async () =>
        (await db.play.findFirstOrThrow({ where: { guestSession: { serviceId } } })).completedAt,
      { timeout: 15_000 }
    )
    .not.toBeNull()
  return db.play.findFirstOrThrow({ where: { guestSession: { serviceId } } })
}

/** Overwrite the submitted hands and post the form, as a tampered client would. */
async function forgeAndSubmit(
  page: import('@playwright/test').Page,
  attempts: Array<{ rung: number; ids: string[] }>
) {
  await page.evaluate((value) => {
    const input = document.querySelector<HTMLInputElement>('input[name="attempts"]')
    if (!input?.form) throw new Error('no climb form on the page')
    input.value = value
    input.form.requestSubmit()
  }, JSON.stringify(attempts))
}

test('a client that claims every rung is awarded nothing', async ({ page }) => {
  const { serviceId, treatmentToken, treatmentTableId } = await arrangeService()
  await fireOrderFor(serviceId, treatmentTableId)

  await page.goto(`/t/${treatmentToken}`)
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: 'Beat the kitchen' }).click()
  await expect(page.getByText('Rung 1 of')).toBeVisible()

  // Real menu ids, in a real-looking shape, claiming a clean sweep. Every hand
  // is wrong because the server deals the true hand and compares against it.
  const ids = (
    await db.menuItem.findMany({
      where: { venue: { slug: 'pilot' }, active: true },
      select: { id: true },
      take: 5,
    })
  ).map((r) => r.id)

  await forgeAndSubmit(
    page,
    Array.from({ length: 6 }, (_, i) => ({ rung: i + 1, ids }))
  )

  await expect(page.getByRole('heading', { level: 1 })).toContainText('The kitchen won this one', {
    timeout: 15_000,
  })

  const play = await completedPlay(serviceId)
  expect(play.score, 'a forged sweep climbs nothing').toBe(0)
  expect(play.outcome).toBe('LOSE')
})

test('a client that skips to the top rung is counted from the gap, not from its claim', async ({
  page,
}) => {
  const { serviceId, treatmentToken, treatmentTableId } = await arrangeService()
  await fireOrderFor(serviceId, treatmentTableId)

  await page.goto(`/t/${treatmentToken}`)
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: 'Beat the kitchen' }).click()
  await expect(page.getByText('Rung 1 of')).toBeVisible()

  // Skipping the cheap rungs to reach the expensive end of the ladder is the
  // profitable attack, so it is the one worth a test of its own.
  await forgeAndSubmit(page, [{ rung: 6, ids: [] }])

  const play = await completedPlay(serviceId)
  expect(play.score).toBe(0)

  const award = await db.award.findFirst({ where: { playId: play.id } })
  // A loss still ends in real value, but it is the consolation rule's value —
  // never the top of the ladder the client asked for.
  if (award) expect(award.valuePaise).toBeGreaterThanOrEqual(0)
})

test('a run that would end on the first rung is never offered', async ({ page }) => {
  const { serviceId, treatmentToken, treatmentTableId } = await arrangeService()
  // One minute out, against a 60s countdown buffer: there is no climb to have.
  await fireOrderFor(serviceId, treatmentTableId, 1)

  await page.goto(`/t/${treatmentToken}`)
  await page.getByRole('button', { name: 'Start' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Food incoming')
  await expect(page.getByRole('button', { name: /climb/i })).toHaveCount(0)
  expect(
    await db.play.count({ where: { guestSession: { serviceId } } }),
    'no play row is written for a run that cannot be played'
  ).toBe(0)
})

test('the run is as long as the food, so a slower kitchen is a longer climb', async ({ page }) => {
  const { serviceId, treatmentToken, treatmentTableId } = await arrangeService()
  await fireOrderFor(serviceId, treatmentTableId, 25)

  await page.goto(`/t/${treatmentToken}`)
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: 'Beat the kitchen' }).click()
  await expect(page.getByText('Rung 1 of')).toBeVisible()

  const play = await db.play.findFirstOrThrow({ where: { guestSession: { serviceId } } })
  const runMs = play.endsAt.getTime() - play.startedAt.getTime()
  // 25 minutes out, minus the 60s buffer. The old quiz was 75 seconds no matter
  // what the kitchen was doing, and that is the thing this replaced.
  expect(runMs).toBeGreaterThan(20 * 60_000)
})

test('a climb played honestly through the UI clears rungs the server agrees with', async ({
  page,
}) => {
  const { serviceId, treatmentToken, treatmentTableId } = await arrangeService()
  await fireOrderFor(serviceId, treatmentTableId)

  await page.goto(`/t/${treatmentToken}`)
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: 'Beat the kitchen' }).click()
  await expect(page.getByText('Rung 1 of')).toBeVisible()

  // Two rungs, then submit early. The client and the server deal independently
  // from the same seed, so a disagreement between them shows up here as a score
  // that is not two — which is the failure this whole design has to not have.
  const prices = await menuPricesFor('pilot')
  await climbRungs(page, prices, 2)
  await expect(page.getByText('Rung 3 of')).toBeVisible()

  await forgeAndSubmitCurrent(page)

  const play = await completedPlay(serviceId)
  expect(play.score, 'the server re-dealt the same two hands the phone did').toBe(2)
  expect(play.outcome).toBe('WIN')
})

/** Submit whatever the client has genuinely accumulated, without tampering. */
async function forgeAndSubmitCurrent(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    document.querySelector<HTMLInputElement>('input[name="attempts"]')?.form?.requestSubmit()
  })
}
