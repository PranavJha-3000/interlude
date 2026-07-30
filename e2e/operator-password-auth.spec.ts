import { expect, test } from '@playwright/test'
import { db, signInWithPassword, signUpWithPassword } from './fixtures'
import { PASSWORD_MIN_LENGTH } from '../src/lib/password'

/**
 * The password door (SECURITY.md §7a). It exists because sending a magic link
 * needs a verified sending domain the pilot does not have, so every link went
 * nowhere and no operator could sign in at all.
 *
 * The magic-link specs in `operator-auth.spec.ts` are deliberately untouched:
 * that path still works and is expected back at the front once email does.
 */

const SEEDED_OWNER = process.env.SEED_OPERATOR_EMAIL ?? 'owner@example.com'
const SEEDED_PASSWORD = process.env.SEED_OPERATOR_PASSWORD ?? 'pilot-owner-dev'
const GOOD_PASSWORD = 'a-long-enough-password'

/**
 * The per-IP throttle counts attempts in a fifteen-minute window, and this
 * whole suite arrives from one loopback address — including the attempts made
 * by the *previous* run, if it finished less than fifteen minutes ago. Left
 * alone, consecutive runs poison each other and a test asserting `email_taken`
 * starts seeing `rate_limited` instead.
 *
 * Clearing the window here is not ducking the throttle: that it refuses past
 * the cap, and refuses before writing anything, is asserted directly in
 * `src/lib/operator-password-auth.test.ts`, and that a real client IP reaches
 * the action at all is asserted in `operator-auth.spec.ts`. What is left for
 * this file is the behaviour of the doors themselves, which should not be at
 * the mercy of how recently someone last ran it.
 */
test.beforeAll(async () => {
  await db.operatorLoginAttempt.deleteMany()
})

test.afterAll(async () => {
  await db.$disconnect()
})

test('the seeded owner can sign in and reach the dashboard', async ({ page }) => {
  await signInWithPassword(page, SEEDED_OWNER, SEEDED_PASSWORD)
  await expect(page).toHaveURL(/\/dash$/)
})

test('signing up lands on the dashboard empty state, with no venue yet', async ({ page }) => {
  await signUpWithPassword(page, GOOD_PASSWORD)

  await expect(page).toHaveURL(/\/dash$/)
  await expect(page.locator('main')).toContainText('No service running')
  // Signed in is signed in, even before onboarding attaches a venue.
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
})

test('a new account can sign out and sign back in with the same password', async ({ page }) => {
  const email = await signUpWithPassword(page, GOOD_PASSWORD, 'round-trip')

  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.waitForLoadState('networkidle')

  await signInWithPassword(page, email, GOOD_PASSWORD)
  await expect(page).toHaveURL(/\/dash$/)
})

test('a wrong password is refused, and grants no session', async ({ page }) => {
  await signInWithPassword(page, SEEDED_OWNER, 'not-the-right-password')

  await expect(page).toHaveURL(/\/signin\?error=bad$/)
  await expect(page.locator('main')).toContainText('Email or password is incorrect')

  // The refusal must be a refusal, not just a message: nothing may have been
  // issued that would carry a visitor into /dash on the next request.
  await page.goto('/dash')
  await expect(page).toHaveURL(/\/signin$/)
})

test('an unknown address is refused in the same words as a wrong password', async ({ page }) => {
  await signInWithPassword(page, 'definitely-nobody@example.com', GOOD_PASSWORD)
  const unknown = await page.locator('main').innerText()

  await signInWithPassword(page, SEEDED_OWNER, 'not-the-right-password')
  const wrongPassword = await page.locator('main').innerText()

  expect(unknown, 'a different answer here would be an enumeration oracle').toBe(wrongPassword)
})

test('an operator who only ever had a magic link cannot be signed into with a guess', async ({
  page,
}) => {
  // `issueMagicLinkFor` creates operators with no password hash at all. Null
  // must read as "cannot sign in this way", never as "any password will do".
  const email = `link-only-${await db.operatorUser.count()}@example.com`
  await db.operatorUser.create({ data: { email } })

  await signInWithPassword(page, email, GOOD_PASSWORD)

  await expect(page).toHaveURL(/\/signin\?error=bad$/)
  await page.goto('/dash')
  await expect(page).toHaveURL(/\/signin$/)
})

test('signing up twice with one address is refused, and says so', async ({ page }) => {
  const email = await signUpWithPassword(page, GOOD_PASSWORD, 'duplicate')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.waitForLoadState('networkidle')

  await page.goto('/signup')
  await page.getByLabel('Your email').fill(email)
  await page.getByLabel('Choose a password').fill(GOOD_PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()

  // Sign-up is the one place that admits an address is known — there is no
  // other way for someone who forgot they had signed up to act on it.
  await expect(page).toHaveURL(/\/signup\?error=email_taken$/)
  await expect(page.locator('main')).toContainText('already has an account')
})

test('a password under the minimum is refused by the server, not only the browser', async ({
  page,
}) => {
  const short = 'a'.repeat(PASSWORD_MIN_LENGTH - 1)
  const email = `too-short-${await db.operatorUser.count()}@example.com`

  // Posting the form directly, past the `minLength` attribute — that attribute
  // is a courtesy, and anything at all can post to this action.
  await page.goto('/signup')
  await page.evaluate(
    ([e, p]) => {
      const form = document.querySelector('form')!
      form.noValidate = true
      form.querySelector<HTMLInputElement>('#email')!.value = e!
      form.querySelector<HTMLInputElement>('#password')!.value = p!
    },
    [email, short]
  )
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/signup\?error=weak_password$/)
  await expect(await db.operatorUser.count({ where: { email } })).toBe(0)
})

test('the sign-in page no longer offers a link it cannot send', async ({ page }) => {
  await page.goto('/signin')

  // The whole reason this path exists: with no verified sending domain, an
  // offer to email a link is an offer to open a door that does not open.
  await expect(page.getByRole('button', { name: 'Email me a link' })).toHaveCount(0)
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Create one/ })).toBeVisible()
})
