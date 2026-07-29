import 'server-only'

import { db } from '@/lib/db'
import { getArmRows } from '@/lib/service'
import { partitionByArm } from '@/core/measurement/arm-assignment'
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
  mechanic: 'KITCHEN_ROUND' | 'MYSTERY_PLATE' | null
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
  addOnCount: number
}

export interface ServiceActivity {
  rows: ActivityRow[]
  controlTableLabels: string[]
  funnel: FunnelSummary
}

export async function getServiceActivity(
  serviceId: string,
  venueId: string,
  nowMs: number
): Promise<ServiceActivity> {
  const [sessions, tables, armRows] = await Promise.all([
    db.guestSession.findMany({
      where: { serviceId },
      orderBy: { startedAt: 'desc' },
      include: {
        table: { select: { id: true, label: true } },
        addOnRequests: { select: { id: true } },
        plays: {
          orderBy: { startedAt: 'desc' },
          include: { award: { include: { menuItem: { select: { name: true, pricePaise: true } } } } },
        },
      },
    }),
    db.table.findMany({
      where: { venueId, active: true },
      select: { id: true, label: true },
    }),
    getArmRows(serviceId),
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
      addOnCount: s.addOnRequests.length,
    }
  })

  // Counting is a pure function taking these rows as arguments — no I/O in it,
  // so the arithmetic is unit-tested without a database.
  const funnelSessions = sessions.map((s) => {
    const plays = s.plays
    const awards = plays.map((p) => p.award).filter((a) => a !== null)
    return {
      tableId: s.tableId,
      playCount: plays.length,
      completedCount: plays.filter((p) => p.completedAt !== null).length,
      wonCount: plays.filter((p) => p.outcome === 'WIN').length,
      awardCount: awards.length,
      claimedCount: awards.filter((a) => a.status === 'CONFIRMED').length,
    }
  })

  return {
    rows,
    controlTableLabels: control
      .map((id) => labelById.get(id) ?? id)
      .sort((a, b) => Number(a) - Number(b)),
    funnel: summariseFunnel({ tentedTableIds: treatment, sessions: funnelSessions }),
  }
}
