import 'dotenv/config'
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

/** Opens a fresh service, splits the arms, and clears prior play state. */
export async function arrangeService(): Promise<Arranged> {
  const venue = await db.venue.findFirstOrThrow()

  await db.service.updateMany({
    where: { venueId: venue.id, endedAt: null },
    data: { endedAt: new Date() },
  })

  // Old play data would make the assertions ambiguous.
  await db.award.deleteMany()
  await db.addOnRequest.deleteMany()
  await db.play.deleteMany()
  await db.guestSession.deleteMany()
  await db.chefVeto.deleteMany()
  await db.kitchenLoad.deleteMany()

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
