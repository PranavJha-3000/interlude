import { expect, test } from '@playwright/test'
import { arrangeServiceFor, db, signInWithPassword } from './fixtures'

/**
 * Bill import, end to end: a known file imports with the right count and
 * totals, a re-import doubles nothing, and an unjoinable row surfaces for
 * mapping rather than disappearing (§6.5).
 */

const OWNER = process.env.SEED_OPERATOR_EMAIL ?? 'owner@example.com'
const PASSWORD = process.env.SEED_OPERATOR_PASSWORD ?? 'pilot-owner-dev'

function exportCsv(): string {
  // Close times inside the service the fixture just opened.
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const stamp = `${day}/${month}/${now.getFullYear()} ${hh}:${mm}`
  return [
    'bill no,table,time,total,covers',
    `B-9001,1,${stamp},1240.50,3`,
    `B-9002,2,${stamp},860,2`,
    `B-9003,MYSTERY-REF,${stamp},420,1`,
  ].join('\r\n')
}

test.beforeAll(async () => {
  await db.operatorLoginAttempt.deleteMany()
})

test.afterAll(async () => {
  const venue = await db.venue.findUniqueOrThrow({ where: { slug: 'pilot' } })
  await db.ticket.deleteMany({
    where: { service: { venueId: venue.id }, externalRef: { startsWith: 'B-90' } },
  })
  await db.posTableMap.deleteMany({ where: { venueId: venue.id, posRef: 'MYSTERY-REF' } })
  await db.$disconnect()
})

test('a known export imports once, re-imports nothing, and surfaces the unjoinable row', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const arranged = await arrangeServiceFor('pilot')
  const csv = exportCsv()

  await signInWithPassword(page, OWNER, PASSWORD)
  await page.goto('/dash/import')

  await page.getByLabel('End-of-day export (CSV)').setInputFiles({
    name: 'bills.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  })
  await page.getByRole('button', { name: 'Import bills' }).click()

  // 3 imported: two joined, one with no mapped table — imported anyway.
  await expect(page.locator('main')).toContainText('3 imported · 0 already imported')

  const tickets = await db.ticket.findMany({
    where: { serviceId: arranged.serviceId, externalRef: { startsWith: 'B-90' } },
  })
  expect(tickets).toHaveLength(3)
  expect(tickets.reduce((sum, t) => sum + t.totalPaise, 0)).toBe(124050 + 86000 + 42000)
  expect(tickets.filter((t) => t.tableId === null)).toHaveLength(1)

  // The unjoinable row is on screen with its reference, not dropped.
  await expect(page.locator('main')).toContainText('MYSTERY-REF')

  // Re-import the identical file: nothing doubles.
  await page.getByLabel('End-of-day export (CSV)').setInputFiles({
    name: 'bills.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  })
  await page.getByRole('button', { name: 'Import bills' }).click()
  await expect(page.locator('main')).toContainText('0 imported · 3 already imported')
  expect(
    await db.ticket.count({
      where: { serviceId: arranged.serviceId, externalRef: { startsWith: 'B-90' } },
    })
  ).toBe(3)

  // Map the mystery reference; the stranded ticket joins retroactively.
  await page.getByLabel('“MYSTERY-REF” is table').selectOption({ label: '7' })
  await page.getByRole('button', { name: 'Map' }).click()
  // Wait for the round-trip: the mapping chip renders after the write lands.
  await expect(page.locator('main')).toContainText('“MYSTERY-REF” → 7')
  const joined = await db.ticket.findFirstOrThrow({
    where: { serviceId: arranged.serviceId, externalRef: 'B-9003' },
    select: { table: { select: { label: true } } },
  })
  expect(joined.table?.label).toBe('7')
})
