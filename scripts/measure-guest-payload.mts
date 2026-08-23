import 'dotenv/config'
import { createHmac } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

/**
 * Measures the JavaScript a guest's phone actually downloads.
 *
 * `next build` stopped printing a First Load JS table under Turbopack, and the
 * budget in PLATFORM.md §11 is a real gate rather than a nice-to-have — our own
 * code may add at most 15KB over the framework floor, with a 200KB ceiling. So
 * this fetches the rendered page from a running server and gzips every script
 * it references, which is the number the guest pays.
 *
 * Usage: `next start -p 3200` in one terminal, then `npx tsx scripts/measure-guest-payload.mts`.
 */
const BASE = process.env.MEASURE_BASE ?? 'http://localhost:3200'

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})
const table = await db.table.findFirstOrThrow({ where: { venue: { slug: 'pilot' } } })

/**
 * A signed guest cookie for a real consented device, minted the way
 * `setGuestSessionCookie` mints one. Without it the V1.5 routes redirect to
 * the game page and this script would measure that page four times — which is
 * exactly what it silently did until 2026-08-14, and why the at-the-floor
 * gate below could never catch a client component creeping into them.
 */
async function guestCookie(): Promise<string | null> {
  const service = await db.service.findFirst({
    where: { venueId: table.venueId, endedAt: null },
  })
  if (!service) return null
  const run = await db.tableRun.upsert({
    where: { serviceId_tableId: { serviceId: service.id, tableId: table.id } },
    create: { serviceId: service.id, tableId: table.id, livesRemaining: 1 },
    update: {},
  })
  const device = await db.deviceSession.create({
    data: { tableRunId: run.id, consentAt: new Date() },
  })
  const sig = createHmac('sha256', process.env.SESSION_SECRET!)
    .update(device.id)
    .digest('base64url')
  return `gs=${device.id}.${sig}`
}

const cookie = await guestCookie()
await db.$disconnect()

async function measure(path: string, withCookie = false) {
  const headers = withCookie && cookie ? { cookie } : undefined
  const html = await (await fetch(`${BASE}${path}`, { headers })).text()
  const srcs = [...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]!)
  let total = 0
  for (const src of new Set(srcs)) {
    const body = Buffer.from(await (await fetch(`${BASE}${src}`)).arrayBuffer())
    total += gzipSync(body).length
  }
  console.log(`${(total / 1024).toFixed(1).padStart(7)} KB gzipped  ${path}`)
  return total
}

// The floor: a route with no client component of ours at all.
const floor = await measure('/signin')
const guest = await measure(`/t/${table.qrToken}`)
console.log(`\n  ours: ${((guest - floor) / 1024).toFixed(1)} KB over the floor (budget 15 KB)`)

/**
 * The V1.5 guest routes, which must each measure **at the floor**.
 *
 * Every one is a server component and a plain `<form>`, so the expected delta is
 * exactly zero. Anything above the floor means a client component crept in — and
 * the 15KB that is ours is already spent on the game and the poller, so there is
 * nothing to spend here.
 */
if (!cookie) {
  console.error('\nNo open service on the pilot venue — run scripts/open-service.mts first;')
  console.error('the V1.5 routes redirect without a session and cannot be measured honestly.')
  process.exitCode = 1
} else {
  console.log('\nV1.5 routes — each must be at the floor:')
  for (const path of [
    `/t/${table.qrToken}/phone`,
    `/t/${table.qrToken}/phone/erase`,
    `/t/${table.qrToken}/feedback`,
    `/t/${table.qrToken}/review`,
  ]) {
    const bytes = await measure(path, true)
    const overFloor = (bytes - floor) / 1024
    if (overFloor > 0.1) {
      console.error(
        `  ✗ ${path} is ${overFloor.toFixed(1)} KB over the floor — a client component crept in.`
      )
      process.exitCode = 1
    }
  }
}
