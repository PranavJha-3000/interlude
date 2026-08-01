import 'server-only'

import { db } from '@/lib/db'
import {
  joinBills,
  parseBillExport,
  type ColumnMap,
  type JoinedBill,
  type ParsedBill,
  type UnjoinableBill,
} from '@/core/measurement/bill-import'

/**
 * The database side of bill import. The parser stays pure in
 * `core/measurement/bill-import.ts`; this attributes, joins and writes.
 *
 * Idempotent by construction: `Ticket` is unique on (serviceId, externalRef)
 * and the insert skips duplicates, so re-importing the same file changes
 * nothing — §6.5's requirement, and the property the test asserts.
 *
 * Unjoinable bills are written as tickets with `tableId: null` and their
 * `posRef` kept, never dropped: a silent drop biases the dataset toward
 * whichever tables the POS names oddly. Mapping the reference later joins
 * every ticket carrying it.
 */

export interface ImportSummary {
  imported: number
  duplicate: number
  rejected: number
  unattributed: number
}

export async function importBillExport(
  venueId: string,
  text: string,
  columns: ColumnMap
): Promise<{ ok: true; summary: ImportSummary } | { ok: false; reason: 'PARSE' | 'NO_SERVICE' }> {
  const parsed = parseBillExport(text, columns)
  if (parsed.bills.length === 0) return { ok: false, reason: 'PARSE' }

  const mapRows = await db.posTableMap.findMany({
    where: { venueId },
    select: { posRef: true, tableId: true },
  })
  const posMap = new Map(mapRows.map((r) => [r.posRef, r.tableId]))
  const { joined, unjoinable } = joinBills(parsed.bills, posMap)

  // Attribute each bill to the service whose window contains its close time.
  const services = await db.service.findMany({
    where: { venueId },
    select: { id: true, startedAt: true, endedAt: true },
    orderBy: { startedAt: 'desc' },
    take: 200,
  })
  const serviceFor = (closedAtMs: number): string | null => {
    for (const s of services) {
      const end = s.endedAt?.getTime() ?? Number.POSITIVE_INFINITY
      if (closedAtMs >= s.startedAt.getTime() && closedAtMs <= end) return s.id
    }
    return null
  }

  const rows: Array<{
    serviceId: string
    tableId: string | null
    posRef: string
    externalRef: string
    closedAt: Date
    totalPaise: number
    covers: number | null
    lines: object
  }> = []
  let unattributed = 0

  const toRow = (bill: ParsedBill, tableId: string | null) => {
    const serviceId = serviceFor(bill.closedAtMs)
    if (!serviceId) {
      unattributed++
      return
    }
    rows.push({
      serviceId,
      tableId,
      posRef: bill.posRef,
      externalRef: bill.externalRef,
      closedAt: new Date(bill.closedAtMs),
      totalPaise: bill.totalPaise,
      covers: bill.covers,
      lines: bill.lines as unknown as object,
    })
  }
  for (const bill of joined as JoinedBill[]) toRow(bill, bill.tableId)
  for (const bill of unjoinable as UnjoinableBill[]) toRow(bill, null)

  if (rows.length === 0) return { ok: false, reason: 'NO_SERVICE' }

  const created = await db.ticket.createMany({ data: rows, skipDuplicates: true })

  return {
    ok: true,
    summary: {
      imported: created.count,
      duplicate: rows.length - created.count,
      rejected: parsed.rejected.length,
      unattributed,
    },
  }
}

/**
 * Map one POS reference to a table, then join every unjoined ticket carrying
 * it — past imports included, which is the point of never dropping them.
 */
export async function mapPosRef(
  venueId: string,
  posRef: string,
  tableId: string
): Promise<boolean> {
  const table = await db.table.findFirst({
    where: { id: tableId, venueId },
    select: { id: true },
  })
  if (!table || !posRef.trim()) return false

  await db.posTableMap.upsert({
    where: { venueId_posRef: { venueId, posRef } },
    create: { venueId, posRef, tableId },
    update: { tableId },
  })

  await db.ticket.updateMany({
    where: { tableId: null, posRef, service: { venueId } },
    data: { tableId },
  })
  return true
}

/** date,covers,tables,total,attached — day-first dates, one pre-launch night per row. */
export async function importHistoricalBaseline(
  venueId: string,
  text: string
): Promise<{ ok: true; count: number } | { ok: false }> {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '')
  if (lines.length < 2) return { ok: false }

  const header = lines[0]!.toLowerCase().split(',')
  const col = (name: string) => header.findIndex((h) => h.trim() === name)
  const dateCol = col('date')
  const coversCol = col('covers')
  const tablesCol = col('tables')
  const totalCol = col('total')
  const attachedCol = col('attached')
  if (dateCol === -1 || coversCol === -1 || totalCol === -1) return { ok: false }

  const rows: Array<{
    venueId: string
    serviceDate: Date
    weekday: number
    covers: number
    tableCount: number
    totalPaise: number
    attachedTableCount: number
  }> = []

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i]!.split(',')
    const date = parseDayFirstDate(fields[dateCol] ?? '')
    const covers = Number(fields[coversCol] ?? '')
    const totalRupees = Number((fields[totalCol] ?? '').replace(/[₹\s]/g, ''))
    if (!date || !Number.isFinite(covers) || !Number.isFinite(totalRupees)) continue

    rows.push({
      venueId,
      serviceDate: date,
      weekday: date.getUTCDay(),
      covers: Math.round(covers),
      tableCount: tablesCol === -1 ? 0 : Math.round(Number(fields[tablesCol] ?? '0')) || 0,
      totalPaise: Math.round(totalRupees * 100),
      attachedTableCount:
        attachedCol === -1 ? 0 : Math.round(Number(fields[attachedCol] ?? '0')) || 0,
    })
  }
  if (rows.length === 0) return { ok: false }

  // Upsert by (venue, date): re-importing a corrected sheet fixes nights
  // rather than doubling them.
  for (const row of rows) {
    await db.historicalService.upsert({
      where: { venueId_serviceDate: { venueId, serviceDate: row.serviceDate } },
      create: row,
      update: row,
    })
  }
  return { ok: true, count: rows.length }
}

/** "31/07/2026", "31-07-2026" or "2026-07-31" → a UTC date-only Date. */
function parseDayFirstDate(raw: string): Date | null {
  const cleaned = raw.trim()
  let year: number, month: number, day: number
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleaned)
  if (match) {
    ;[year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  } else {
    match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(cleaned)
    if (!match) return null
    ;[day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])]
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return new Date(Date.UTC(year, month - 1, day))
}
