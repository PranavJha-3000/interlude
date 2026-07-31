/**
 * The bill export, parsed (§6.5).
 *
 * Pure: text in, structured bills and explicit rejections out. No database, no
 * clock, no filesystem — so every awkward shape a real POS produces can be
 * tested as a string literal rather than by uploading a file.
 *
 * **The import will fail on the join, not the parse.** Reading a CSV is easy;
 * deciding which of the venue's tables a row called "T-12 / 14 (merged)" refers
 * to is not. So the parse stage is deliberately permissive about content and
 * strict about structure, and everything it cannot resolve is *returned*, never
 * dropped. A silently dropped row is a biased dataset, and it biases toward
 * whichever tables the POS happens to spell oddly — which is exactly the busy
 * ones that got merged.
 */

export interface BillLine {
  name: string
  qty: number
  pricePaise: number
}

export interface ParsedBill {
  /** The POS's own bill id. The idempotency key, with the service. */
  externalRef: string
  /** Table reference exactly as exported, before any mapping. */
  posRef: string
  /** All table references on a merged bill, in the order they appeared. */
  posRefs: string[]
  closedAtMs: number
  totalPaise: number
  covers: number | null
  lines: BillLine[]
}

export interface RejectedRow {
  /** 1-based, counting the header, so it matches what a spreadsheet shows. */
  line: number
  reason: string
  raw: string
}

export interface ParseResult {
  bills: ParsedBill[]
  rejected: RejectedRow[]
}

/**
 * Which column holds what. Every POS names them differently and none of them
 * ask us first, so the mapping is configuration rather than a guess.
 */
export interface ColumnMap {
  externalRef: string
  posRef: string
  closedAt: string
  total: string
  covers?: string
  itemName?: string
  itemQty?: string
  itemPrice?: string
}

// ── CSV ────────────────────────────────────────────────────────────────────

/**
 * A real CSV reader, not `split(',')`.
 *
 * Dish names contain commas ("Chicken 65, half"), quoted fields contain
 * newlines, and Excel writes `""` for a literal quote. Every one of those
 * appears in a restaurant export, and each would silently shift every
 * subsequent column by one.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0

  // Strip a UTF-8 BOM — Excel writes one and it corrupts the first header name.
  if (text.charCodeAt(0) === 0xfeff) i = 1

  for (; i < text.length; i++) {
    const c = text[i]

    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += c
      }
      continue
    }

    if (c === '"') {
      quoted = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      // Swallow the \n of a \r\n pair rather than emitting a blank row.
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }

  // A file not ending in a newline still has a final row.
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0))
}

// ── Money and dates ────────────────────────────────────────────────────────

/**
 * Rupees as exported, to integer paise.
 *
 * Accepts what a POS actually emits: "1,234.50", "₹1234.5", "1234". Rejects
 * anything else rather than coercing — `Number('')` is 0, and a zero total that
 * should have been a rejection is a bill silently worth nothing in the
 * comparison.
 */
export function rupeesToPaise(raw: string): number | null {
  const cleaned = raw.replace(/[₹,\s]/g, '').trim()
  if (cleaned === '') return null
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null
  return Math.round(Number(cleaned) * 100)
}

/**
 * Parse an exported timestamp.
 *
 * Handles ISO and the `DD/MM/YYYY HH:mm` that Indian POS exports overwhelmingly
 * use. Day-first is assumed for the slashed form and that assumption is
 * deliberate: guessing month-first would silently reorder a whole service on
 * any day of the month above the twelfth, and be invisible below it.
 */
export function parseExportedTimestamp(raw: string): number | null {
  const s = raw.trim()
  if (s === '') return null

  const slashed = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s)
  if (slashed) {
    const [, d, m, y, hh, mm, ss] = slashed
    const ms = Date.UTC(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss ?? '0')
    )
    return Number.isNaN(ms) ? null : ms
  }

  const ms = Date.parse(s)
  return Number.isNaN(ms) ? null : ms
}

/**
 * Split a table reference into the tables it names.
 *
 * "12" -> ["12"]; "T4+T5" -> ["T4","T5"]; "6 / 7 (merged)" -> ["6","7"].
 * Merged tables are one bill covering several tables, which is why the result
 * is a list — attributing the whole spend to the first of them would overstate
 * that table and erase the other.
 */
export function splitTableRefs(raw: string): string[] {
  return raw
    .replace(/\((?:merged|combined|joined)\)/gi, '')
    .split(/[+/&]|\band\b/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

// ── The parse ──────────────────────────────────────────────────────────────

/**
 * One row per bill, or one row per bill *line* — both shapes occur, and which
 * one you have is not knowable from a single row. When item columns are mapped,
 * rows sharing an `externalRef` are folded into one bill with many lines.
 */
export function parseBillExport(text: string, columns: ColumnMap): ParseResult {
  const rows = parseCsv(text)
  const rejected: RejectedRow[] = []

  if (rows.length === 0) return { bills: [], rejected }

  const header = rows[0]!.map((h) => h.trim().toLowerCase())
  const indexOf = (name: string | undefined): number =>
    name === undefined ? -1 : header.indexOf(name.trim().toLowerCase())

  const col = {
    externalRef: indexOf(columns.externalRef),
    posRef: indexOf(columns.posRef),
    closedAt: indexOf(columns.closedAt),
    total: indexOf(columns.total),
    covers: indexOf(columns.covers),
    itemName: indexOf(columns.itemName),
    itemQty: indexOf(columns.itemQty),
    itemPrice: indexOf(columns.itemPrice),
  }

  const missing = (
    [
      ['externalRef', col.externalRef],
      ['posRef', col.posRef],
      ['closedAt', col.closedAt],
      ['total', col.total],
    ] as const
  )
    .filter(([, i]) => i < 0)
    .map(([n]) => n)

  if (missing.length > 0) {
    return {
      bills: [],
      rejected: [
        {
          line: 1,
          reason: `Export is missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
          raw: rows[0]!.join(','),
        },
      ],
    }
  }

  const byRef = new Map<string, ParsedBill>()

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!
    const line = r + 1
    const raw = row.join(',')
    const cell = (i: number): string => (i >= 0 ? (row[i] ?? '').trim() : '')

    const externalRef = cell(col.externalRef)
    if (externalRef === '') {
      rejected.push({ line, reason: 'No bill reference', raw })
      continue
    }

    const existing = byRef.get(externalRef)
    if (existing) {
      // A second row for a bill we have seen: another item line.
      const item = readLine(row, col)
      if (item) existing.lines.push(item)
      continue
    }

    const closedAtMs = parseExportedTimestamp(cell(col.closedAt))
    if (closedAtMs === null) {
      rejected.push({ line, reason: `Unreadable close time "${cell(col.closedAt)}"`, raw })
      continue
    }

    const totalPaise = rupeesToPaise(cell(col.total))
    if (totalPaise === null) {
      rejected.push({ line, reason: `Unreadable total "${cell(col.total)}"`, raw })
      continue
    }

    const posRef = cell(col.posRef)
    if (posRef === '') {
      rejected.push({ line, reason: 'No table reference', raw })
      continue
    }

    const coversRaw = cell(col.covers)
    const coversNum = coversRaw === '' ? null : Number(coversRaw)
    const covers =
      coversNum !== null && Number.isInteger(coversNum) && coversNum > 0 ? coversNum : null

    const item = readLine(row, col)

    byRef.set(externalRef, {
      externalRef,
      posRef,
      posRefs: splitTableRefs(posRef),
      closedAtMs,
      totalPaise,
      covers,
      lines: item ? [item] : [],
    })
  }

  return { bills: [...byRef.values()], rejected }
}

function readLine(row: string[], col: { itemName: number; itemQty: number; itemPrice: number }) {
  if (col.itemName < 0) return null
  const name = (row[col.itemName] ?? '').trim()
  if (name === '') return null

  const qtyRaw = col.itemQty >= 0 ? (row[col.itemQty] ?? '').trim() : ''
  const qty = qtyRaw === '' ? 1 : Number(qtyRaw)
  const priceRaw = col.itemPrice >= 0 ? (row[col.itemPrice] ?? '').trim() : ''

  return {
    name,
    qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
    pricePaise: rupeesToPaise(priceRaw) ?? 0,
  }
}

// ── The join ───────────────────────────────────────────────────────────────

export interface JoinedBill extends ParsedBill {
  tableId: string
}

export interface UnjoinableBill extends ParsedBill {
  reason: string
}

export interface JoinResult {
  joined: JoinedBill[]
  /** Surfaced for manual mapping. **Never dropped** (§6.5). */
  unjoinable: UnjoinableBill[]
}

/**
 * Resolve each bill's table reference against the venue's map.
 *
 * A merged bill resolves only when *every* table it names is mapped, and it is
 * attributed to the first — with the rest recorded on the row, so the operator
 * can see that one bill covers several tables rather than discovering it in a
 * spend-per-cover figure that looks impossibly high.
 */
export function joinBills(bills: readonly ParsedBill[], posTableMap: ReadonlyMap<string, string>) {
  const joined: JoinedBill[] = []
  const unjoinable: UnjoinableBill[] = []

  const lookup = new Map<string, string>()
  for (const [ref, tableId] of posTableMap) lookup.set(normaliseRef(ref), tableId)

  for (const bill of bills) {
    // Try the whole reference first: a venue may map "4+5" explicitly, and an
    // explicit mapping should always beat our splitting heuristic.
    const whole = lookup.get(normaliseRef(bill.posRef))
    if (whole) {
      joined.push({ ...bill, tableId: whole })
      continue
    }

    const resolved = bill.posRefs.map((r) => lookup.get(normaliseRef(r)))
    const unresolved = bill.posRefs.filter((_, i) => resolved[i] === undefined)

    if (unresolved.length > 0 || resolved.length === 0) {
      unjoinable.push({
        ...bill,
        reason:
          resolved.length === 0
            ? `No table reference to map`
            : `No table mapped for ${unresolved.map((r) => `"${r}"`).join(', ')}`,
      })
      continue
    }

    joined.push({ ...bill, tableId: resolved[0]! })
  }

  return { joined, unjoinable }
}

/** "T-12" and "t 12" and "12" are the same table to everyone except a string compare. */
function normaliseRef(ref: string): string {
  return ref.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// ── Attribution ────────────────────────────────────────────────────────────

/**
 * Which service a bill belongs to, by close time.
 *
 * Close time rather than seat time, because seat time is the one a POS export
 * most often omits — and because a table seated before service opened but
 * closing during it is spend that service earned.
 */
export function attributeToService(
  bills: readonly JoinedBill[],
  service: { startedAtMs: number; endedAtMs: number | null }
): { inService: JoinedBill[]; outOfService: JoinedBill[] } {
  const end = service.endedAtMs ?? Number.POSITIVE_INFINITY
  const inService: JoinedBill[] = []
  const outOfService: JoinedBill[] = []

  for (const bill of bills) {
    if (bill.closedAtMs >= service.startedAtMs && bill.closedAtMs <= end) inService.push(bill)
    else outOfService.push(bill)
  }

  return { inService, outOfService }
}
