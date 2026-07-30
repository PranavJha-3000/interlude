import 'dotenv/config'
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
await db.$disconnect()

async function measure(path: string) {
  const html = await (await fetch(`${BASE}${path}`)).text()
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
