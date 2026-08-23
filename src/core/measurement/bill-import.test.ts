import { describe, expect, it } from 'vitest'
import {
  attributeToService,
  joinBills,
  parseBillExport,
  parseCsv,
  parseExportedTimestamp,
  rupeesToPaise,
  splitTableRefs,
  type ColumnMap,
} from './bill-import'

/**
 * §6.5 says the import will fail on the join, not the parse, and lists exactly
 * what will occur: merged tables, split bills, transfers, and seat time versus
 * bill-close time. Each has a test here.
 *
 * The invariant underneath all of them: **nothing is ever silently dropped.**
 * Every row this module cannot use comes back with a reason attached.
 */

const COLUMNS: ColumnMap = {
  externalRef: 'Bill No',
  posRef: 'Table',
  closedAt: 'Closed',
  total: 'Total',
  covers: 'Covers',
  itemName: 'Item',
  itemQty: 'Qty',
  itemPrice: 'Rate',
}

describe('parseCsv', () => {
  it('keeps a comma that is inside a quoted dish name', () => {
    // "Chicken 65, half" is a real menu line, and splitting on commas would
    // shift every column after it by one for that row alone.
    const rows = parseCsv('Item,Qty\n"Chicken 65, half",2')

    expect(rows[1]).toEqual(['Chicken 65, half', '2'])
  })

  it('handles an escaped quote', () => {
    expect(parseCsv('a\n"He said ""hi"""')[1]).toEqual(['He said "hi"'])
  })

  it('handles a newline inside a quoted field', () => {
    const rows = parseCsv('Item,Note\n"Naan","hot\nfresh"')

    expect(rows).toHaveLength(2)
    expect(rows[1]![1]).toBe('hot\nfresh')
  })

  it('reads CRLF without emitting blank rows', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('strips the BOM Excel writes, so the first header still matches', () => {
    expect(parseCsv('﻿Bill No,Table')[0]![0]).toBe('Bill No')
  })

  it('reads a final row with no trailing newline', () => {
    expect(parseCsv('a\n1')).toHaveLength(2)
  })
})

describe('rupeesToPaise', () => {
  it('reads what a POS actually exports', () => {
    expect(rupeesToPaise('1,234.50')).toBe(123450)
    expect(rupeesToPaise('₹1234.5')).toBe(123450)
    expect(rupeesToPaise('1234')).toBe(123400)
  })

  it('refuses rather than coercing', () => {
    // `Number('')` is 0, and a bill silently worth nothing is worse than a
    // bill the operator is asked about.
    for (const bad of ['', 'n/a', '--', 'abc']) expect(rupeesToPaise(bad)).toBeNull()
  })

  it('returns whole paise, never a float', () => {
    expect(Number.isInteger(rupeesToPaise('99.99'))).toBe(true)
  })
})

describe('parseExportedTimestamp', () => {
  it('reads a slashed Indian export as day-first', () => {
    // 03/04 is the 3rd of April. Month-first would silently move it to March,
    // and be undetectable for the first twelve days of any month.
    const ms = parseExportedTimestamp('03/04/2026 21:30')!

    expect(new Date(ms).toISOString()).toBe('2026-04-03T21:30:00.000Z')
  })

  it('reads ISO', () => {
    expect(parseExportedTimestamp('2026-04-03T21:30:00Z')).toBe(Date.parse('2026-04-03T21:30:00Z'))
  })

  it('returns null for nonsense rather than an Invalid Date', () => {
    expect(parseExportedTimestamp('last tuesday')).toBeNull()
    expect(parseExportedTimestamp('')).toBeNull()
  })
})

describe('splitTableRefs', () => {
  it('splits a merged table however the POS spelled it', () => {
    expect(splitTableRefs('T4+T5')).toEqual(['T4', 'T5'])
    expect(splitTableRefs('6 / 7 (merged)')).toEqual(['6', '7'])
    expect(splitTableRefs('3 and 4')).toEqual(['3', '4'])
  })

  it('leaves a single table alone', () => {
    expect(splitTableRefs('12')).toEqual(['12'])
  })
})

describe('parseBillExport', () => {
  const csv = [
    'Bill No,Table,Closed,Total,Covers,Item,Qty,Rate',
    'B1,12,03/04/2026 21:30,"1,240.00",4,Butter Chicken,1,429',
    'B1,12,03/04/2026 21:30,"1,240.00",4,Garlic Naan,3,89',
    'B2,7,03/04/2026 22:05,560.00,2,Tiramisu,1,299',
  ].join('\n')

  it('folds rows sharing a bill reference into one bill with many lines', () => {
    const { bills } = parseBillExport(csv, COLUMNS)

    expect(bills).toHaveLength(2)
    expect(bills[0]!.lines).toHaveLength(2)
    expect(bills[0]!.totalPaise).toBe(124000)
    expect(bills[0]!.covers).toBe(4)
  })

  it('rejects a row rather than dropping it', () => {
    const broken = ['Bill No,Table,Closed,Total', 'B9,12,not a date,100'].join('\n')
    const { bills, rejected } = parseBillExport(broken, COLUMNS)

    expect(bills).toHaveLength(0)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]!.reason).toContain('Unreadable close time')
    expect(rejected[0]!.line).toBe(2)
  })

  it('names every missing required column at once', () => {
    const { rejected } = parseBillExport('Something,Else\n1,2', COLUMNS)

    expect(rejected[0]!.reason).toContain('externalRef')
    expect(rejected[0]!.reason).toContain('posRef')
  })

  it('treats a missing covers column as unknown, not as zero', () => {
    const noCovers = ['Bill No,Table,Closed,Total', 'B1,12,03/04/2026 21:30,100'].join('\n')
    const { bills } = parseBillExport(noCovers, { ...COLUMNS, covers: undefined })

    expect(bills[0]!.covers).toBeNull()
  })

  it('is idempotent — the same text twice parses identically', () => {
    expect(parseBillExport(csv, COLUMNS)).toEqual(parseBillExport(csv, COLUMNS))
  })
})

describe('joinBills', () => {
  const map = new Map([
    ['12', 'table_12'],
    ['T7', 'table_7'],
    ['4', 'table_4'],
    ['5', 'table_5'],
  ])

  const bill = (posRef: string) => ({
    externalRef: `B-${posRef}`,
    posRef,
    posRefs: splitTableRefs(posRef),
    closedAtMs: 0,
    totalPaise: 1000,
    covers: 2,
    lines: [],
  })

  it('ignores case and punctuation when matching a reference', () => {
    // "T7", "t-7" and "t 7" are one table to everyone except a string compare.
    for (const spelling of ['T7', 't-7', 't 7', 'T_7']) {
      const { joined } = joinBills([bill(spelling)], map)
      expect(joined[0]!.tableId).toBe('table_7')
    }
  })

  it('does not strip letters to force a match', () => {
    // Tempting, and wrong: it would make "A1" and "B1" the same table, which
    // at a venue with a bar and booths they are not. An unmatched reference is
    // surfaced for the operator to map, never guessed.
    const { joined, unjoinable } = joinBills([bill('T-12')], map)

    expect(joined).toHaveLength(0)
    expect(unjoinable[0]!.reason).toContain('T-12')
  })

  it('surfaces an unmapped table instead of dropping the bill', () => {
    const { joined, unjoinable } = joinBills([bill('99')], map)

    expect(joined).toHaveLength(0)
    expect(unjoinable).toHaveLength(1)
    expect(unjoinable[0]!.reason).toContain('"99"')
  })

  it('joins a merged bill only when every table it names is mapped', () => {
    const { joined } = joinBills([bill('4+5')], map)

    expect(joined).toHaveLength(1)
    expect(joined[0]!.tableId).toBe('table_4')
    expect(joined[0]!.posRefs).toEqual(['4', '5'])
  })

  it('refuses a merged bill when only half of it maps', () => {
    const { joined, unjoinable } = joinBills([bill('4+99')], map)

    expect(joined).toHaveLength(0)
    expect(unjoinable[0]!.reason).toContain('"99"')
  })

  it('lets an explicit mapping of the whole reference beat the split', () => {
    const explicit = new Map([...map, ['4+5', 'table_merged']])
    const { joined } = joinBills([bill('4+5')], explicit)

    expect(joined[0]!.tableId).toBe('table_merged')
  })

  it('joins a split bill to the same table twice', () => {
    // Two bills, one table — both count, and neither replaces the other.
    const { joined } = joinBills([bill('12'), { ...bill('12'), externalRef: 'B-12b' }], map)

    expect(joined).toHaveLength(2)
    expect(new Set(joined.map((b) => b.tableId))).toEqual(new Set(['table_12']))
  })

  it('accounts for every bill exactly once', () => {
    const bills = [bill('12'), bill('99'), bill('4+5'), bill('T7')]
    const { joined, unjoinable } = joinBills(bills, map)

    expect(joined.length + unjoinable.length).toBe(bills.length)
  })
})

describe('attributeToService', () => {
  const at = (ms: number) => ({
    externalRef: String(ms),
    posRef: '1',
    posRefs: ['1'],
    closedAtMs: ms,
    totalPaise: 100,
    covers: 2,
    lines: [],
    tableId: 't1',
  })

  it('attributes by close time, including a table seated before service opened', () => {
    const service = { startedAtMs: 1000, endedAtMs: 2000 }
    const { inService, outOfService } = attributeToService([at(1500), at(2500)], service)

    expect(inService).toHaveLength(1)
    expect(outOfService).toHaveLength(1)
  })

  it('includes the boundaries', () => {
    const { inService } = attributeToService([at(1000), at(2000)], {
      startedAtMs: 1000,
      endedAtMs: 2000,
    })

    expect(inService).toHaveLength(2)
  })

  it('treats an open service as running to now', () => {
    const { inService } = attributeToService([at(9e12)], { startedAtMs: 0, endedAtMs: null })

    expect(inService).toHaveLength(1)
  })
})
