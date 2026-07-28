import 'server-only'

import { db } from '@/lib/db'
import { armAt, canOpenSession, type ArmRow } from '@/core/measurement/arm-assignment'
import type { RoundConfig } from '@/core/mechanics/kitchen-round'

/**
 * Reads the live state a guest surface needs. Everything here is I/O; the
 * decisions themselves live in `core/` and take this data as arguments.
 */

export interface PrepMinutes {
  [category: string]: number
}

/** The venue's own numbers, never constants (PLATFORM.md §10). */
export async function getVenueConfig(venueId: string) {
  const config = await db.venueConfig.findUnique({ where: { venueId } })
  if (!config) throw new Error(`Venue ${venueId} has no config row`)
  return config
}

export function toRoundConfig(config: {
  quizLengthSec: number
  countdownBufferSec: number
  quizQuestionCount: number
  winThresholdPct: number
}): RoundConfig {
  return {
    quizLengthSec: config.quizLengthSec,
    countdownBufferSec: config.countdownBufferSec,
    quizQuestionCount: config.quizQuestionCount,
    winThresholdPct: config.winThresholdPct,
  }
}

/** The service currently running at this venue, or null between services. */
export async function getOpenService(venueId: string) {
  return db.service.findFirst({
    where: { venueId, endedAt: null },
    orderBy: { startedAt: 'desc' },
  })
}

export async function getArmRows(serviceId: string): Promise<ArmRow[]> {
  const rows = await db.tableArmAssignment.findMany({
    where: { serviceId },
    select: { tableId: true, arm: true, effectiveFrom: true, effectiveTo: true },
  })
  return rows.map((r) => ({
    tableId: r.tableId,
    arm: r.arm,
    effectiveFromMs: r.effectiveFrom.getTime(),
    effectiveToMs: r.effectiveTo?.getTime() ?? null,
  }))
}

export type ScanResolution =
  | { kind: 'UNKNOWN_TABLE' }
  | { kind: 'NO_SERVICE'; venueName: string }
  | { kind: 'BLOCKED'; venueName: string; reason: string }
  | {
      kind: 'OK'
      venueId: string
      venueName: string
      serviceId: string
      tableId: string
      tableLabel: string
    }

/**
 * Resolve a scanned QR token into something the page can render.
 *
 * A control table is refused here, before any row is written. PLATFORM.md §7
 * lists this as an enforced invariant: one control table that played
 * contaminates the night's comparison, and afterwards there is no way to tell.
 * The guest sees an ordinary "nothing running" screen — they must never learn
 * they are in a control group, or the behaviour we are measuring changes.
 */
export async function resolveScan(qrToken: string, atMs: number): Promise<ScanResolution> {
  const table = await db.table.findUnique({
    where: { qrToken },
    include: { venue: { select: { id: true, name: true } } },
  })
  if (!table || !table.active) return { kind: 'UNKNOWN_TABLE' }

  const service = await getOpenService(table.venueId)
  if (!service) return { kind: 'NO_SERVICE', venueName: table.venue.name }

  const rows = await getArmRows(service.id)
  const verdict = canOpenSession(rows, table.id, atMs)
  if (!verdict.allowed) {
    return { kind: 'BLOCKED', venueName: table.venue.name, reason: verdict.reason }
  }

  return {
    kind: 'OK',
    venueId: table.venueId,
    venueName: table.venue.name,
    serviceId: service.id,
    tableId: table.id,
    tableLabel: table.label,
  }
}

/** Which arm a table is on right now — used when recording a session. */
export async function armForTable(
  serviceId: string,
  tableId: string,
  atMs: number
): Promise<'TREATMENT' | 'CONTROL' | null> {
  return armAt(await getArmRows(serviceId), tableId, atMs)
}

/**
 * The most recent order fired for this table in this service, which is what
 * drives the #5 countdown through the Manual POS adapter.
 */
export async function getLatestOrderFire(serviceId: string, tableId: string) {
  return db.orderFire.findFirst({
    where: { serviceId, tableId },
    orderBy: { firedAt: 'desc' },
  })
}

/** Current kitchen load. Defaults to GREEN when the chef has not set one. */
export async function getKitchenLoad(venueId: string): Promise<'GREEN' | 'AMBER' | 'RED'> {
  const row = await db.kitchenLoad.findFirst({
    where: { venueId },
    orderBy: { setAt: 'desc' },
  })
  return row?.level ?? 'GREEN'
}

/** Item ids the chef has vetoed. Absolute — the prize engine never overrides. */
export async function getActiveVetoes(venueId: string): Promise<string[]> {
  const rows = await db.chefVeto.findMany({
    where: { venueId, active: true },
    select: { menuItemId: true },
  })
  return rows.map((r) => r.menuItemId)
}

/** Value already conceded this service, so the depth cap is a running total. */
export async function getConcededSoFarPaise(serviceId: string): Promise<number> {
  const result = await db.award.aggregate({
    _sum: { valuePaise: true },
    where: {
      status: { in: ['PENDING', 'CONFIRMED'] },
      play: { guestSession: { serviceId } },
    },
  })
  return result._sum.valuePaise ?? 0
}

/** Minutes from midnight in the venue's own timezone. */
export function serviceClockMinute(atMs: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(atMs))
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return hour * 60 + minute
}

/** Estimated ready time from the venue's configured prep minutes per category. */
export function estimateReadyAt(
  firedAtMs: number,
  categories: readonly string[],
  prepMinutes: PrepMinutes,
  fallbackMinutes = 15
): Date {
  const longest = categories.reduce((max, c) => Math.max(max, prepMinutes[c] ?? 0), 0)
  const minutes = longest > 0 ? longest : fallbackMinutes
  return new Date(firedAtMs + minutes * 60_000)
}
