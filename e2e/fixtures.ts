import 'dotenv/config'
import { createHash, randomBytes } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { expect, type Page } from '@playwright/test'
import { planArmAssignments } from '../src/core/measurement/arm-assignment'

/**
 * Direct database access for the E2E test.
 *
 * Used to arrange state the UI cannot reach yet (opening a service) and to
 * read the venue's own menu prices, so the test can deliberately *climb*
 * rather than clicking hopefully and asserting whatever came out.
 */
export const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

export interface Arranged {
  serviceId: string
  venueToken: string
  treatmentToken: string
  treatmentTableId: string
  treatmentLabel: string
  controlToken: string
  controlLabel: string
}

/**
 * Clears prior play state for one venue, and only that venue.
 *
 * This used to be a global wipe, which was a footgun in a fixture two venues
 * now share: arranging venue A, playing, then arranging venue B silently
 * deleted A's sessions, plays and awards. Every row here reaches a venue —
 * play state hangs off `GuestSession -> Table -> venueId`, vetoes and kitchen
 * load carry `venueId` directly — so scoping it costs nothing and makes
 * arranging a second venue a genuinely independent act.
 *
 * Deletes are ordered child-first. The cascades would cover it, but being
 * explicit means a new model added to this list cannot quietly depend on one.
 */
async function clearPlayStateFor(venueId: string) {
  await db.award.deleteMany({ where: { play: { guestSession: { table: { venueId } } } } })
  await db.addOnRequest.deleteMany({ where: { guestSession: { table: { venueId } } } })
  await db.play.deleteMany({ where: { guestSession: { table: { venueId } } } })
  await db.guestSession.deleteMany({ where: { table: { venueId } } })
  await db.chefVeto.deleteMany({ where: { venueId } })
  await db.kitchenLoad.deleteMany({ where: { venueId } })
}

/** A seeded venue by slug. Named rather than "the first one" — there are two now. */
export async function venueBy(slug: string) {
  return db.venue.findFirstOrThrow({ where: { slug } })
}

/**
 * Opens a fresh service at one venue, splits the arms, and clears that venue's
 * prior play state.
 *
 * Both steps are scoped to `venue.id`, and that scoping is the whole mechanism
 * by which two venues' services coexist: closing Pilot's open service touches
 * no row of Copper's, so `arrangeServiceFor('pilot')` followed by
 * `arrangeServiceFor('copper')` leaves *both* services open. There is no
 * ordering constraint and no once-per-run rule — call it per venue, in any
 * order, as often as a test needs.
 */
export async function arrangeServiceFor(slug: string): Promise<Arranged> {
  const venue = await venueBy(slug)

  await db.service.updateMany({
    where: { venueId: venue.id, endedAt: null },
    data: { endedAt: new Date() },
  })

  // Old play data would make the assertions ambiguous — but only this venue's.
  await clearPlayStateFor(venue.id)

  const service = await db.service.create({
    data: { venueId: venue.id, name: 'e2e' },
  })

  const tables = await db.table.findMany({
    where: { venueId: venue.id, active: true },
    select: { id: true, label: true, qrToken: true },
  })
  const plan = planArmAssignments(tables)
  await db.tableArmAssignment.createMany({
    data: plan.map((p) => ({
      serviceId: service.id,
      tableId: p.tableId,
      arm: p.arm,
      reason: p.reason,
    })),
  })

  const treatment = plan.find((p) => p.arm === 'TREATMENT')!
  const control = plan.find((p) => p.arm === 'CONTROL')!
  const byId = new Map(tables.map((t) => [t.id, t]))

  return {
    serviceId: service.id,
    venueToken: venue.qrToken,
    treatmentToken: byId.get(treatment.tableId)!.qrToken,
    treatmentTableId: treatment.tableId,
    treatmentLabel: byId.get(treatment.tableId)!.label,
    controlToken: byId.get(control.tableId)!.qrToken,
    controlLabel: byId.get(control.tableId)!.label,
  }
}

/** The pilot venue. Kept so every existing spec reads unchanged. */
export async function arrangeService(): Promise<Arranged> {
  return arrangeServiceFor('pilot')
}

/** Fires an order so the countdown has something to race. */
export async function fireOrderFor(serviceId: string, tableId: string, minutesOut = 20) {
  return db.orderFire.create({
    data: {
      tableId,
      serviceId,
      firedAt: new Date(),
      estReadyAt: new Date(Date.now() + minutesOut * 60_000),
    },
  })
}

/**
 * The answer key for the climb: dish name to price, for one venue.
 *
 * The climb has no secret answers — the prices are printed on the menu on the
 * guest's table — so this is not privileged access, it is the test reading the
 * same menu the guest is holding. Keyed by name because that is what the guest
 * surface renders.
 */
export async function menuPricesFor(venueSlug = 'pilot'): Promise<Map<string, number>> {
  const rows = await db.menuItem.findMany({
    where: { venue: { slug: venueSlug }, active: true },
    select: { name: true, pricePaise: true },
  })
  return new Map(rows.map((r) => [r.name, r.pricePaise]))
}

/**
 * Climb `rungs` rungs deliberately, through the real UI.
 *
 * Deliberately does not touch the database to decide what to click: it reads
 * the dish names the page is actually showing and orders them by the menu
 * price. A hand dealt pre-sorted, a stale arrangement left over from the
 * previous hand, or a name rendered that is not on the menu would all fail here
 * rather than passing quietly.
 */
export async function climbRungs(
  page: Page,
  prices: Map<string, number>,
  rungs: number
): Promise<void> {
  const priceOf = (name: string) => {
    const p = prices.get(name.trim())
    if (p === undefined) throw new Error(`the climb showed "${name}", which is not on the menu`)
    return p
  }

  for (let rung = 1; rung <= rungs; rung++) {
    await expect(page.getByText(`Rung ${rung} of`)).toBeVisible({ timeout: 15_000 })

    if (rung % 2 === 1) {
      // A pair: tap the dearer of the two.
      const buttons = page.getByRole('button').filter({ hasNotText: /Lock it in/ })
      const names = (await buttons.allInnerTexts())
        .map((t) => t.trim())
        .filter((t) => prices.has(t))
      if (names.length !== 2) throw new Error(`rung ${rung} showed ${names.length} choices, want 2`)
      const dearer = priceOf(names[0]!) >= priceOf(names[1]!) ? names[0]! : names[1]!
      await page.getByRole('button', { name: dearer, exact: true }).click()
    } else {
      // A ladder: bubble the arrangement into ascending price order using the
      // move buttons the guest has, then lock it in.
      for (let pass = 0; pass < 12; pass++) {
        const rows = page.locator('ol > li')
        const count = await rows.count()
        const names: string[] = []
        for (let i = 0; i < count; i++) {
          names.push((await rows.nth(i).locator('span').nth(1).innerText()).trim())
        }
        const wrong = names.findIndex((n, i) => i > 0 && priceOf(names[i - 1]!) > priceOf(n))
        if (wrong === -1) break
        await rows
          .nth(wrong)
          .getByRole('button', { name: /Move .* earlier/ })
          .click()
      }
      await page.getByRole('button', { name: 'Lock it in' }).click()
    }

    await expect(page.getByText('Cleared.')).toBeVisible({ timeout: 10_000 })
  }
}

/**
 * Issues a real magic-link token and returns it.
 *
 * The dev console outbox in `src/lib/email.ts` cannot serve this suite: Playwright
 * runs `next build && next start`, which is NODE_ENV=production, where the outbox
 * is off by design. Rather than ship a dev-only route that exists in production
 * code purely for tests, the fixture writes the row itself — which exercises the
 * real consume path and adds no production surface.
 *
 * `withVenue: false` models a genuine first-time signup: `requestMagicLink`
 * creates the `OperatorUser` with no venue at all, since signup and sign-in
 * are the same request.
 *
 * `venueSlug` is resolved explicitly, the same way `venueBy`/`arrangeServiceFor`
 * are, rather than taking "whichever venue the database hands back first" —
 * that was the bug here: the email argument implied a venue but never
 * selected one, so every call silently bound Pilot regardless of which
 * operator was being signed in. It happened to be invisible with one venue
 * seeded and stayed invisible with two, because Pilot is seeded first. It
 * defaults to `'pilot'` so every caller written before this fix keeps
 * signing Pilot in without having to say so.
 */
export async function issueMagicLinkFor(
  email: string,
  options: { expiresInMs?: number; withVenue?: boolean; venueSlug?: string } = {}
): Promise<string> {
  const withVenue = options.withVenue ?? true
  const venueId = withVenue ? (await venueBy(options.venueSlug ?? 'pilot')).id : null

  const operator = await db.operatorUser.upsert({
    where: { email },
    update: { venueId },
    create: { email, venueId },
    select: { id: true },
  })

  const token = randomBytes(32).toString('base64url')
  await db.magicLinkToken.create({
    data: {
      operatorUserId: operator.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + (options.expiresInMs ?? 15 * 60 * 1000)),
    },
  })

  return token
}
