import 'dotenv/config'
import { createHash, randomBytes } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { planArmAssignments } from '../src/core/measurement/arm-assignment'

/**
 * Direct database access for the E2E test.
 *
 * Used to arrange state the UI cannot reach yet (opening a service) and to
 * read the quiz answer key, so the test can deliberately *win* rather than
 * clicking hopefully and asserting whatever came out.
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

/** The answer key, so the test can win on purpose. */
export async function correctAnswerFor(prompt: string): Promise<number> {
  const q = await db.quizQuestion.findFirstOrThrow({ where: { prompt } })
  return q.answerIndex
}

export async function optionsFor(prompt: string): Promise<string[]> {
  const q = await db.quizQuestion.findFirstOrThrow({ where: { prompt } })
  return q.options as string[]
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
 */
export async function issueMagicLinkFor(
  email: string,
  options: { expiresInMs?: number; withVenue?: boolean } = {}
): Promise<string> {
  const withVenue = options.withVenue ?? true
  const venueId = withVenue ? (await db.venue.findFirstOrThrow({ select: { id: true } })).id : null

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
