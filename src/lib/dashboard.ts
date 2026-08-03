import 'server-only'

import { db } from '@/lib/db'
import { summariseContribution, type ContributionSummary } from '@/core/measurement/contribution'
import {
  explainNegative,
  minutesInState,
  tierFor,
  totalLedger,
  type LedgerRow,
  type LedgerTotals,
  type Tier,
} from '@/core/measurement/ledger'
import { computeMetrics, computeSpend, type Metrics } from '@/core/measurement/metrics'
import { summariseReviewFunnel, type ReviewFunnelRates } from '@/core/review/prompt'
import { reviewFunnelFor } from '@/lib/review-funnel'

/**
 * Everything `/dash` and the Monday email render (§9.4).
 *
 * One reader, two surfaces. The email carries the same figures and the same
 * caveat as the screen, and the only way to guarantee that is for both to call
 * this rather than each doing its own arithmetic.
 */

export interface DashboardData {
  serviceId: string
  serviceName: string
  startedAtMs: number
  endedAtMs: number | null
  tier: Tier
  contribution: ContributionSummary
  metrics: Metrics
  ledger: LedgerRow[]
  totals: LedgerTotals
  negativeReason: string | null
  /** POS-backed spend, present only once an export has landed. */
  pos: { billCount: number; spendPerCoverPaise: number | null; attachRatePct: number | null }
  /**
   * The review funnel (§7.2) — counts only, and there is no rating to report
   * because none is ever stored. Collected since the review screen shipped and
   * shown to nobody until now.
   */
  review: ReviewFunnelRates
  /** The engine's own audit trail for the night — what cleared, what did not. */
  pool: {
    cleared: Array<{ item: string; why: string }>
    refused: Array<{ item: string; why: string }>
  }
}

export async function getDashboardData(venueId: string, serviceId: string): Promise<DashboardData> {
  const service = await db.service.findUniqueOrThrow({ where: { id: serviceId } })
  const endMs = service.endedAt?.getTime() ?? Date.now()

  // Its first application caller. `summariseReviewFunnel` has been exported and
  // tested since the review screen shipped and called from nowhere, so the
  // funnel was recorded every night and read by nobody.
  const review = summariseReviewFunnel(await reviewFunnelFor(serviceId))

  const [runs, awards, addOns, events, tickets, loads, pool] = await Promise.all([
    db.tableRun.findMany({
      where: { serviceId },
      include: { table: { select: { label: true } } },
    }),
    db.award.findMany({
      where: { status: 'CONFIRMED', tableRun: { serviceId } },
      include: { menuItem: { select: { name: true } }, tableRun: { include: { table: true } } },
    }),
    db.addOnRequest.findMany({
      where: { status: 'ACKED', tableRun: { serviceId } },
      include: { tableRun: { include: { table: true } } },
    }),
    db.event.findMany({
      where: { serviceId },
      select: { type: true, tableRunId: true, deviceSessionId: true, at: true, detail: true },
    }),
    db.ticket.findMany({ where: { serviceId } }),
    db.kitchenLoad.findMany({ where: { serviceId }, orderBy: { setAt: 'asc' } }),
    db.prizePool.findFirst({ where: { serviceId }, orderBy: { snapshotAt: 'desc' } }),
  ])

  const contribution = summariseContribution(
    addOns.map((a) => ({
      qty: a.qty,
      pricePaise: a.pricePaise,
      foodCostPaise: a.foodCostPaise,
    })),
    awards.map((w) => ({
      kind: w.kind,
      valuePaise: w.valuePaise,
      foodCostPaise: w.foodCostPaise,
    }))
  )

  const metrics = computeMetrics(
    events.map((e) => ({
      type: e.type,
      tableRunId: e.tableRunId,
      deviceSessionId: e.deviceSessionId,
      at: e.at.getTime(),
      detail: (e.detail ?? {}) as Record<string, unknown>,
    })),
    // Every table carries a tent on a live night — the service is the unit of
    // assignment, so the denominator is the venue's active table count.
    await db.table.count({ where: { venueId, active: true } })
  )

  // ── The ledger, one row per table that did something ─────────────────────
  const spendByRun = new Map<string, number>()
  for (const a of addOns) {
    if (!a.tableRunId) continue
    const contributionPaise = (a.pricePaise - a.foodCostPaise) * Math.max(0, a.qty)
    spendByRun.set(a.tableRunId, (spendByRun.get(a.tableRunId) ?? 0) + contributionPaise)
  }

  const awardByRun = new Map<string, (typeof awards)[number]>()
  for (const w of awards) if (w.tableRunId) awardByRun.set(w.tableRunId, w)

  const ledger: LedgerRow[] = runs
    .filter((r) => awardByRun.has(r.id) || spendByRun.has(r.id))
    .map((r) => {
      const award = awardByRun.get(r.id)
      const extraSpendPaise = spendByRun.get(r.id) ?? 0
      const prizeCostPaise = award?.foodCostPaise ?? 0

      return {
        atMs: r.openedAt.getTime(),
        tableLabel: r.table.label,
        result: award ? `Rung ${award.rung ?? r.currentRung}` : 'No prize',
        prizeName: award?.menuItem.name ?? null,
        prizeCostPaise,
        extraSpendPaise,
        netPaise: extraSpendPaise - prizeCostPaise,
      }
    })
    .sort((a, b) => a.atMs - b.atMs)

  const totals = totalLedger(ledger)

  // ── Why a negative night went negative ───────────────────────────────────
  const minutesAtRed = minutesInState(
    loads.map((l) => ({ state: l.level, atMs: l.setAt.getTime() })),
    'RED',
    endMs
  )
  const minutesKilled = service.killedAt
    ? Math.max(0, Math.round((endMs - service.killedAt.getTime()) / 60_000))
    : 0

  const negative = explainNegative({
    netContributionPaise: contribution.netContributionPaise,
    minutesAtRed,
    minutesKilled,
    prizeCostPaise: contribution.prizeCostPaise,
    addOnContributionPaise: contribution.addOnContributionPaise,
  })

  const spend = computeSpend(
    tickets.map((t) => ({
      tableId: t.tableId,
      totalPaise: t.totalPaise,
      covers: t.covers,
      attached: attachedFromLines(t.lines),
    }))
  )

  return {
    serviceId,
    serviceName: service.name,
    startedAtMs: service.startedAt.getTime(),
    endedAtMs: service.endedAt?.getTime() ?? null,
    tier: tierFor(tickets.length),
    contribution,
    metrics,
    ledger,
    totals,
    negativeReason: negative?.reason ?? null,
    review,
    pos: {
      billCount: tickets.length,
      spendPerCoverPaise: spend.spendPerCoverPaise,
      attachRatePct: spend.attachRatePct,
    },
    pool: readPoolSnapshot(pool),
  }
}

/** Did this bill carry a dessert or a beverage line? Drives attach rate. */
function attachedFromLines(lines: unknown): boolean {
  if (!Array.isArray(lines)) return false
  return lines.some((l) => {
    const name = String((l as { name?: unknown })?.name ?? '').toLowerCase()
    return /dessert|kulfi|jamun|tiramisu|brownie|cheesecake|halwa|rasmalai|lassi|coffee|chai|soda|panna|buttermilk/.test(
      name
    )
  })
}

/**
 * The refusal log, read back out of the snapshot the engine wrote (§9.4).
 *
 * Read from `PrizePool` rather than recomputed. The point of the audit trail is
 * that it says what was decided *at the time* — recomputing it tonight against
 * a menu edited since would produce a plausible answer to a different question.
 */
function readPoolSnapshot(pool: { entries: unknown; excluded: unknown } | null) {
  const cleared: Array<{ item: string; why: string }> = []
  const refused: Array<{ item: string; why: string }> = []

  if (pool) {
    if (Array.isArray(pool.entries)) {
      for (const e of pool.entries) {
        const row = e as { itemName?: string; itemId?: string; reason?: string }
        cleared.push({ item: row.itemName ?? row.itemId ?? '—', why: row.reason ?? '' })
      }
    }
    if (Array.isArray(pool.excluded)) {
      for (const e of pool.excluded) {
        const row = e as { itemName?: string; itemId?: string; reason?: string }
        refused.push({ item: row.itemName ?? row.itemId ?? '—', why: row.reason ?? '' })
      }
    }
  }

  return { cleared, refused }
}
