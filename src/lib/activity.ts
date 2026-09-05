import 'server-only'

import type { Mechanic } from '@/core/prize-engine'

import { db } from '@/lib/db'
import { getArmRows } from '@/lib/service'
import { compareLabels, partitionByArm } from '@/core/measurement/arm-assignment'
import { summariseFunnel, type FunnelSummary } from '@/core/measurement/funnel'

/**
 * What happened at each table this service.
 *
 * One row per `GuestSession`, never merged by table: two phones at one table are
 * two guests who each had their own experience, and merging them would hide a
 * second scan behind the first one's result.
 *
 * No identity of any kind. A session knows its table and nothing about the
 * person holding the phone (PLATFORM.md §7).
 */

export interface ActivityRow {
  sessionId: string
  tableLabel: string
  scannedAt: Date
  mechanic: Mechanic | null
  score: number | null
  maxScore: number | null
  outcome: 'WIN' | 'LOSE' | null
  completed: boolean
  awardItemName: string | null
  awardKind: 'FREE' | 'PERCENT_OFF' | 'FIXED_PRICE' | null
  awardPercentOff: number | null
  awardFixedPricePaise: number | null
  awardItemPricePaise: number | null
  awardStatus: 'PENDING' | 'CONFIRMED' | 'EXPIRED' | null
  confirmedAt: Date | null
}

export interface ServiceActivity {
  rows: ActivityRow[]
  controlTableLabels: string[]
  funnel: FunnelSummary
  /** True when the service has more sessions than `rows` shows. */
  truncated: boolean
  /** Per-mechanic play count, in the order the guest surface lists them. */
  mechanicBreakdown: Array<{ mechanic: Mechanic; count: number }>
  /** Add-on requests and confirmations tonight. */
  addOns: { requested: number; confirmed: number; totalPaise: number }
  /** Sessions bucketed by 15-minute wall-clock windows in the venue's tz. */
  scanTimeline: Array<{ startMs: number; endMs: number; count: number }>
  /** Bounds the operator reads off the page: the first scan and the latest. */
  firstScanAt: Date | null
  lastScanAt: Date | null
}

const EMPTY_FUNNEL: FunnelSummary = {
  tentedTables: 0,
  scannedTables: 0,
  scannedSessions: 0,
  playedSessions: 0,
  claimedSessions: 0,
}

/**
 * How many sessions the activity table renders.
 *
 * A service at one venue does not approach this. It exists so that the query
 * cannot grow without limit as venues are added, and it is deliberately *not*
 * the same read the funnel counts from — bounding a list that a summary is
 * derived from is how a dashboard starts under-reporting a busy night and
 * saying nothing about it.
 */
export const ACTIVITY_ROW_LIMIT = 250

/** Width of one bar on the scan timeline. */
const TIMELINE_BUCKET_MS = 15 * 60 * 1000

export async function getServiceActivity(
  serviceId: string,
  venueId: string,
  nowMs: number
): Promise<ServiceActivity> {
  // The venue scope is re-checked here rather than trusted from the caller.
  // Today the only caller derives `serviceId` from the operator's own session,
  // so this cannot fire — which is exactly when to make it structural, before a
  // second caller passes an id from somewhere less careful and this function
  // happily reads another restaurant's service (SECURITY.md §8).
  const service = await db.service.findFirst({
    where: { id: serviceId, venueId },
    select: { id: true },
  })
  if (!service) {
    return {
      rows: [],
      controlTableLabels: [],
      funnel: EMPTY_FUNNEL,
      truncated: false,
      mechanicBreakdown: [],
      addOns: { requested: 0, confirmed: 0, totalPaise: 0 },
      scanTimeline: [],
      firstScanAt: null,
      lastScanAt: null,
    }
  }

  // The rendered rows are bounded; the funnel is not. These are deliberately
  // separate reads — see ACTIVITY_ROW_LIMIT and the funnel.ts docblock for why
  // deriving the funnel from the bounded row array would silently under-report
  // a busy service the moment `take` is added to it.
  const [
    sessions,
    tables,
    armRows,
    tableCounts,
    playedSessions,
    claimedSessions,
    sessionTotal,
    addOns,
    playCounts,
  ] = await Promise.all([
    db.guestSession.findMany({
      where: { serviceId },
      orderBy: { startedAt: 'desc' },
      take: ACTIVITY_ROW_LIMIT,
      include: {
        table: { select: { id: true, label: true } },
        plays: {
          orderBy: { startedAt: 'desc' },
          include: {
            award: { include: { menuItem: { select: { name: true, pricePaise: true } } } },
          },
        },
      },
    }),
    db.table.findMany({
      where: { venueId, active: true },
      select: { id: true, label: true },
    }),
    getArmRows(serviceId),
    // One row per table that opened a session — the input
    // countScannedTreatmentTables wants, over every session, not just the
    // bounded rows the table renders.
    db.guestSession.groupBy({ by: ['tableId'], where: { serviceId } }),
    db.guestSession.count({ where: { serviceId, plays: { some: {} } } }),
    db.guestSession.count({
      where: { serviceId, plays: { some: { award: { status: 'CONFIRMED' } } } },
    }),
    db.guestSession.count({ where: { serviceId } }),
    db.addOnRequest.groupBy({
      by: ['status'],
      where: { tableRun: { serviceId } },
      _count: { _all: true },
      _sum: { pricePaise: true },
    }),
    // Unbounded read over every play: the mechanic breakdown must not be
    // derived from the bounded `sessions` array above, or a busy service
    // silently under-reports "what they played" once ACTIVITY_ROW_LIMIT rows
    // are reached. Each play row has a non-null `mechanic`.
    db.play.groupBy({
      by: ['mechanic'],
      where: { guestSession: { serviceId } },
      _count: { _all: true },
    }),
  ])

  // One pass gives both arms — do not also filter with `armAt`, which would
  // walk the same rows again and give a second place for the split to drift.
  const { treatment, control } = partitionByArm(
    armRows,
    tables.map((t) => t.id),
    nowMs
  )
  const labelById = new Map(tables.map((t) => [t.id, t.label]))

  const rows: ActivityRow[] = sessions.map((s) => {
    const play = s.plays[0] ?? null
    const award = play?.award ?? null

    return {
      sessionId: s.id,
      tableLabel: s.table.label,
      scannedAt: s.startedAt,
      mechanic: play?.mechanic ?? null,
      score: play?.score ?? null,
      maxScore: play?.maxScore ?? null,
      outcome: play?.outcome ?? null,
      completed: play?.completedAt !== null && play?.completedAt !== undefined,
      awardItemName: award?.menuItem.name ?? null,
      awardKind: award?.kind ?? null,
      awardPercentOff: award?.percentOff ?? null,
      awardFixedPricePaise: award?.fixedPricePaise ?? null,
      awardItemPricePaise: award?.menuItem.pricePaise ?? null,
      awardStatus: award?.status ?? null,
      confirmedAt: award?.confirmedAt ?? null,
    }
  })

  // ── Per-mechanic breakdown ─────────────────────────────────────────────
  // Built from the unbounded `playCounts` groupBy read above, not the bounded
  // `sessions` array — a busy service must not lose play counts once ACTIVITY_ROW_LIMIT rows have been loaded.
  const mechanicBreakdown = playCounts
    .map((g) => ({ mechanic: g.mechanic as Mechanic, count: g._count._all ?? 0 }))
    .sort((a, b) => b.count - a.count)

  // ── Add-ons ─────────────────────────────────────────────────────────────
  const addOnsSummary = { requested: 0, confirmed: 0, totalPaise: 0 }
  for (const row of addOns) {
    addOnsSummary.requested += row._count._all
    if (row.status === 'ACKED') {
      addOnsSummary.confirmed += row._count._all
      addOnsSummary.totalPaise += row._sum.pricePaise ?? 0
    }
  }

  // ── Scan timeline ──────────────────────────────────────────────────────
  // Buckets are wall-clock windows in the venue's own timezone, not the
  // server's. Using `nowMs` for the upper bound keeps the rightmost bucket
  // current as new scans land — a bar that doesn't grow reads as broken on
  // the live page even when it isn't.
  const firstScanAt = sessions.length > 0 ? sessions.at(-1)!.startedAt : null
  const lastScanAt = sessions.length > 0 ? sessions[0]!.startedAt : null
  const timeline = buildTimeline(sessions, firstScanAt, lastScanAt, nowMs)

  return {
    rows,
    controlTableLabels: control.map((id) => labelById.get(id) ?? id).sort(compareLabels),
    funnel: summariseFunnel({
      tentedTableIds: treatment,
      scannedTableIds: tableCounts.map((g) => g.tableId),
      scannedSessions: sessionTotal,
      playedSessions,
      claimedSessions,
    }),
    truncated: sessionTotal > ACTIVITY_ROW_LIMIT,
    mechanicBreakdown,
    addOns: addOnsSummary,
    scanTimeline: timeline,
    firstScanAt,
    lastScanAt,
  }
}

/**
 * Bucket the session starts into 15-minute wall-clock windows. The first
 * bucket starts at the first scan, not at midnight, so the chart never
 * carries a long empty tail of zero-bars on the left.
 */
function buildTimeline(
  sessions: Array<{ startedAt: Date }>,
  firstScanAt: Date | null,
  lastScanAt: Date | null,
  nowMs: number
): Array<{ startMs: number; endMs: number; count: number }> {
  if (sessions.length === 0 || firstScanAt === null || lastScanAt === null) return []

  const firstMs = firstScanAt.getTime()
  const lastMs = Math.max(lastScanAt.getTime(), nowMs)
  const startAligned = Math.floor(firstMs / TIMELINE_BUCKET_MS) * TIMELINE_BUCKET_MS
  const endAligned =
    Math.ceil((lastMs + 1) / TIMELINE_BUCKET_MS) * TIMELINE_BUCKET_MS

  const buckets: Array<{ startMs: number; endMs: number; count: number }> = []
  for (let t = startAligned; t < endAligned; t += TIMELINE_BUCKET_MS) {
    buckets.push({ startMs: t, endMs: t + TIMELINE_BUCKET_MS, count: 0 })
  }
  for (const s of sessions) {
    const ms = s.startedAt.getTime()
    const idx = Math.floor((ms - startAligned) / TIMELINE_BUCKET_MS)
    const bucket = buckets[idx]
    if (bucket) bucket.count += 1
  }
  return buckets
}
