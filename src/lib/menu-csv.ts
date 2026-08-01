import { parseRupeesToPaise } from '@/lib/money'
import type { MenuDraft } from '@/lib/ai/types'

/**
 * The CSV path — deterministic, zero AI calls, by construction: this module
 * does not import the adapter and the router only calls it for CSV files.
 *
 * Column shape: `name,category,price` with an optional `cost` column, prices
 * in rupees as the operator's spreadsheet has them. Header row required, in
 * any order. Handles the things real exports do: quoted commas, CRLF, a BOM
 * from Excel, ₹ signs and thousand separators in the money columns.
 */

export interface CsvRow {
  name: string
  category: string
  priceRupees: number
  /** Only present when the sheet had a cost column. Rupees. */
  costRupees?: number
}

export type CsvResult =
  | { ok: true; rows: CsvRow[]; warnings: string[] }
  | { ok: false; reason: 'EMPTY' | 'NO_HEADER' | 'NO_ROWS' }

export function parseMenuCsv(text: string): CsvResult {
  const cleaned = text.replace(/^﻿/, '')
  const lines = splitCsvLines(cleaned)
  if (lines.length === 0) return { ok: false, reason: 'EMPTY' }

  const header = splitCsvFields(lines[0]!).map((h) => h.trim().toLowerCase())
  const nameCol = header.findIndex((h) => h === 'name' || h === 'item')
  const categoryCol = header.findIndex((h) => h === 'category' || h === 'section')
  const priceCol = header.findIndex((h) => h === 'price' || h === 'price (₹)' || h === 'mrp')
  const costCol = header.findIndex((h) => h === 'cost' || h === 'food cost' || h === 'foodcost')

  if (nameCol === -1 || priceCol === -1) return { ok: false, reason: 'NO_HEADER' }

  const rows: CsvRow[] = []
  const warnings: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvFields(lines[i]!)
    const name = (fields[nameCol] ?? '').trim()
    if (!name) continue // blank line, or a separator row

    const pricePaise = parseRupeesToPaise(fields[priceCol] ?? '')
    if (pricePaise === null || pricePaise <= 0) {
      warnings.push(`Row ${i + 1} ("${name}") has no readable price and was skipped.`)
      continue
    }

    const row: CsvRow = {
      name,
      category: categoryCol === -1 ? 'mains' : (fields[categoryCol] ?? '').trim().toLowerCase() || 'mains',
      priceRupees: pricePaise / 100,
    }

    if (costCol !== -1 && (fields[costCol] ?? '').trim() !== '') {
      const costPaise = parseRupeesToPaise(fields[costCol]!)
      if (costPaise === null || costPaise < 0) {
        warnings.push(`Row ${i + 1} ("${name}") has an unreadable cost — cost left blank.`)
      } else {
        row.costRupees = costPaise / 100
      }
    }

    rows.push(row)
  }

  if (rows.length === 0) return { ok: false, reason: 'NO_ROWS' }
  return { ok: true, rows, warnings }
}

/** As a `MenuDraft`, so CSV and extraction land in the same grid. */
export function csvToDraft(result: Extract<CsvResult, { ok: true }>): MenuDraft {
  return {
    items: result.rows.map((r) => ({
      name: r.name,
      category: r.category,
      priceRupees: r.priceRupees,
    })),
    warnings: result.warnings,
  }
}

/** Split on newlines, respecting quotes — a quoted field can contain \n. */
function splitCsvLines(text: string): string[] {
  const lines: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '"') inQuotes = !inQuotes
    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i++
      if (current.trim() !== '') lines.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim() !== '') lines.push(current)
  return lines
}

/** Split one line into fields, honouring quotes and `""` escapes. */
function splitCsvFields(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}
