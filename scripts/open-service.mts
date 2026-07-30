import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { planArmAssignments } from '../src/core/measurement/arm-assignment'

/**
 * Dev helper: opens a service and records the alternating arm split.
 *
 * Usage: `npx tsx scripts/open-service.mts [venue-slug]`, default `pilot`.
 *
 * The slug is not optional decoration. This used to be an unfiltered
 * `findFirstOrThrow`, which was harmless while the seed made one venue and
 * became a coin toss the moment it made two — the same defect that was fixed
 * in `issueMagicLinkFor`. It would end whichever venue's live service Postgres
 * happened to return first.
 */
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

const slug = process.argv[2] ?? 'pilot'
const venue = await db.venue.findUniqueOrThrow({ where: { slug } })
await db.service.updateMany({
  where: { venueId: venue.id, endedAt: null },
  data: { endedAt: new Date() },
})

const service = await db.service.create({
  data: { venueId: venue.id, name: `Dev service ${new Date().toISOString().slice(11, 16)}` },
})

const tables = await db.table.findMany({
  where: { venueId: venue.id },
  select: { id: true, label: true },
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

const t = plan.filter((p) => p.arm === 'TREATMENT').length
console.log(`${venue.slug} service ${service.id}: ${t} treatment / ${plan.length - t} control`)

for (const arm of ['TREATMENT', 'CONTROL'] as const) {
  const first = plan.find((p) => p.arm === arm)!
  const row = await db.table.findUniqueOrThrow({ where: { id: first.tableId } })
  console.log(`${arm.padEnd(9)} table ${row.label.padEnd(2)} -> /t/${row.qrToken}`)
}
await db.$disconnect()
