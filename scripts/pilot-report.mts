import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import {
  pilotReport,
  type VenueCounts,
  type RateEstimate,
} from '../src/core/measurement/pilot-report'
import { formatPaise } from '../src/lib/money'

/**
 * The pooled pilot report (PLATFORM.md §9a) — a script, not a screen.
 *
 * Deliberately ours rather than an operator surface: pooling crosses venues,
 * and a cross-venue page would be an authorisation boundary with no product
 * reason to exist. No operator ever sees another operator's rows; we see the
 * pool because the pilot is ours to run.
 *
 * Usage: `npx tsx scripts/pilot-report.mts [days]` — default the last 7.
 *
 * What it claims and what it refuses to (§9a):
 * - Counts (add-ons, ₹) are exact.
 * - Rates carry a 95% interval.
 * - The attach delta needs bill exports for both arms. It is printed with its
 *   interval and the words NOT YET CONCLUSIVE until the interval excludes
 *   zero, and it is bill-backed only — app rows cannot produce it, because a
 *   control table cannot play.
 */

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

const days = Number(process.argv[2] ?? '7')
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

/** Categories a bill line must hit to count as an attach. */
const ATTACH_CATEGORIES = new Set(['desserts', 'beverages'])

async function countsFor(venue: {
  id: string
  slug: string
  name: string
}): Promise<VenueCounts> {
  const services = await db.service.findMany({
    where: { venueId: venue.id, startedAt: { gte: since } },
    select: { id: true, arm: true },
  })
  const serviceIds = services.map((s) => s.id)
  const liveIds = services.filter((s) => s.arm === 'LIVE').map((s) => s.id)
  const controlIds = services.filter((s) => s.arm === 'CONTROL').map((s) => s.id)
  const tableCount = await db.table.count({ where: { venueId: venue.id, active: true } })

  // Tented tables: every table of a LIVE service is tented — the service is
  // the unit of assignment.
  const tablesTented = liveIds.length * tableCount

  const runs = await db.tableRun.findMany({
    where: { serviceId: { in: serviceIds } },
    select: { id: true, endedAt: true, serviceId: true, tableId: true },
  })
  const runEnds = await db.event.findMany({
    where: { serviceId: { in: serviceIds }, type: 'RUN_END' },
    select: { tableRunId: true, detail: true },
  })
  const abandoned = new Set(
    runEnds
      .filter((e) => {
        const reason = (e.detail as { reason?: string } | null)?.reason
        return reason === 'ABANDONED'
      })
      .map((e) => e.tableRunId)
  )

  const addOns = await db.addOnRequest.findMany({
    where: {
      guestSession: { serviceId: { in: serviceIds } },
      // ACKED is the floor's confirmation tap — the row is a sale a server
      // acknowledged, which is the bar for counting it.
      status: 'ACKED',
      cancelledAt: null,
    },
    select: {
      qty: true,
      pricePaise: true,
      foodCostPaise: true,
      tableRunId: true,
    },
  })

  const awards = await db.award.findMany({
    where: {
      status: 'CONFIRMED',
      OR: [
        { tableRun: { serviceId: { in: serviceIds } } },
        { play: { guestSession: { serviceId: { in: serviceIds } } } },
      ],
    },
    select: { valuePaise: true, foodCostPaise: true, fixedPricePaise: true, kind: true },
  })

  // Bill-backed attach arms. Only tickets that joined to a table count — an
  // unjoined ticket has no arm to sit in.
  const menu = await db.menuItem.findMany({
    where: { venueId: venue.id },
    select: { name: true, category: true },
  })
  const attachNames = new Set(
    menu.filter((m) => ATTACH_CATEGORIES.has(m.category)).map((m) => m.name.toLowerCase())
  )
  const tickets = await db.ticket.findMany({
    where: { serviceId: { in: serviceIds }, tableId: { not: null } },
    select: { serviceId: true, tableId: true, lines: true },
  })
  const ticketAttaches = (arm: string[]) => {
    const inArm = tickets.filter((t) => arm.includes(t.serviceId))
    const attached = inArm.filter((t) => {
      const lines = (t.lines as Array<{ name?: string }> | null) ?? []
      return lines.some((l) => attachNames.has(String(l.name ?? '').toLowerCase()))
    })
    return { tables: inArm.length, attached: attached.length }
  }
  const treatment = ticketAttaches(liveIds)
  const control = ticketAttaches(controlIds)

  // Prize cost: what the venue genuinely spent — food cost minus anything
  // collected, floored at zero, same arithmetic as prizeCostPaise().
  const prizeCostPaise = awards.reduce((sum, a) => {
    const collected = a.kind === 'FIXED_PRICE' ? (a.fixedPricePaise ?? 0) : 0
    return sum + Math.max(0, a.foodCostPaise - collected)
  }, 0)

  const scannedTables = new Set(runs.map((r) => `${r.serviceId}:${r.tableId}`))
  const runsWithAddOn = new Set(addOns.filter((a) => a.tableRunId).map((a) => a.tableRunId)).size

  return {
    slug: venue.slug,
    name: venue.name,
    tablesTented,
    tablesScanned: scannedTables.size,
    runsStarted: runs.length,
    runsCompleted: runs.filter((r) => r.endedAt !== null && !abandoned.has(r.id)).length,
    runsWithAddOn,
    confirmedAddOns: addOns.reduce((sum, a) => sum + a.qty, 0),
    addOnGrossPaise: addOns.reduce((sum, a) => sum + a.pricePaise * a.qty, 0),
    addOnContributionPaise: addOns.reduce(
      (sum, a) => sum + (a.pricePaise - a.foodCostPaise) * a.qty,
      0
    ),
    prizeCostPaise,
    prizesClaimed: awards.length,
    treatmentTables: treatment.tables,
    treatmentAttached: treatment.attached,
    controlTables: control.tables,
    controlAttached: control.attached,
  }
}

function pct(estimate: RateEstimate): string {
  if (estimate.rate === null) return '—'
  const mid = (estimate.rate * 100).toFixed(1)
  const low = (estimate.low! * 100).toFixed(1)
  const high = (estimate.high! * 100).toFixed(1)
  return `${mid}%  (95% CI ${low}–${high}%, n=${estimate.denominator})`
}

const venues = await db.venue.findMany({ select: { id: true, slug: true, name: true } })
const counts = await Promise.all(venues.map(countsFor))
const active = counts.filter((c) => c.runsStarted > 0 || c.tablesTented > 0)
const report = pilotReport(active)

const line = '─'.repeat(64)
console.log(`\nPILOT REPORT — last ${days} day${days === 1 ? '' : 's'}, ${active.length} venue${active.length === 1 ? '' : 's'}`)
console.log(line)

for (const v of [...report.venues, report.pooled]) {
  const pooled = v.slug === 'pooled'
  console.log(`\n${pooled ? '━━ ' : ''}${v.name}${pooled ? ' ━━' : ` (${v.slug})`}`)
  console.log(`  Tables tented          ${v.tablesTented}`)
  console.log(`  Scan rate              ${pct(v.scanRate)}`)
  console.log(`  Completion rate        ${pct(v.completionRate)}`)
  console.log(`  Add-on conversion      ${pct(v.addOnConversion)}`)
  console.log(`  Confirmed add-ons      ${v.confirmedAddOns}  (exact — every row a confirmed sale)`)
  console.log(`  Add-on gross           ${formatPaise(v.addOnGrossPaise)}`)
  console.log(`  Add-on contribution    ${formatPaise(v.addOnContributionPaise)}`)
  console.log(`  Prize cost             ${formatPaise(v.prizeCostPaise)}  (${v.prizesClaimed} claimed)`)
  console.log(`  Net contribution       ${formatPaise(v.netContributionPaise)}`)
}

console.log(`\n${line}`)
const d = report.attachDelta
if (d.deltaPp === null) {
  console.log('ATTACH-RATE DELTA: unavailable — needs bill exports for both arms.')
} else {
  const label = d.conclusive ? 'CONCLUSIVE' : 'NOT YET CONCLUSIVE'
  console.log(
    `ATTACH-RATE DELTA: ${d.deltaPp.toFixed(1)}pp  (95% CI ${d.lowPp!.toFixed(1)} to ${d.highPp!.toFixed(1)}pp) — ${label}`
  )
  if (!d.conclusive) {
    console.log('Do not put this number on a slide. It accumulates weekend over weekend.')
  }
}
console.log(line)

await db.$disconnect()
