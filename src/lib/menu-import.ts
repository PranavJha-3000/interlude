import type { AiAdapter, ExtractResult, MenuDraft } from '@/lib/ai/types'
import { csvToDraft, parseMenuCsv } from '@/lib/menu-csv'
import type { MenuItemDraft } from '@/lib/venue-setup'

/**
 * Menu import — one seam for the three ways a menu arrives (CSV, photo, PDF),
 * all landing in the same draft grid, none of it saved until the operator
 * confirms.
 *
 * Pure: the adapter comes in as an argument, so tests can assert the CSV path
 * never touches it — which is the §6a promise ("CSV parses deterministically,
 * no AI") as an assertion rather than a comment.
 */

export const CSV_TYPES = ['text/csv', 'application/vnd.ms-excel']
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
export const UPLOAD_TYPES = [...CSV_TYPES, ...IMAGE_TYPES, 'application/pdf']

/**
 * The failure codes the upload action knows about. Stable — the action layer
 * and the page error maps both depend on these names.
 */
export type UploadFailureReason =
  | 'EMPTY_FILE'
  | 'TOO_LARGE'
  | 'UNSUPPORTED_TYPE'
  | 'CSV_NO_HEADER'
  | 'CSV_NO_ROWS'
  | 'AI_UNAVAILABLE'
  | 'AI_DECLINED'
  | 'AI_UNREACHABLE'
  | 'AI_INVALID'
  | 'AI_AUTH'
  | 'AI_QUOTA'
  | 'NO_ITEMS'
  | 'UNKNOWN'

/**
 * Collapse the menu-import failure surface — the CSV parser's own codes plus
 * the AI adapter's prose — to a small, stable set the action layer maps to
 * error keys the user can read.
 *
 * The classifier matches on the leading token the Gemini adapter prefixes its
 * error strings with (`GEMINI_AUTH`, `GEMINI_QUOTA`, `GEMINI_ERROR`). The
 * plain-English fallback matches exist for messages that don't carry a token
 * — most importantly, the "no API key" path that the menu-import layer
 * generates when `getAiAdapter()` returns null.
 */
export function classifyExtractFailure(reason: string): UploadFailureReason {
  if (reason.startsWith('GEMINI_AUTH')) return 'AI_AUTH'
  if (reason.startsWith('GEMINI_QUOTA')) return 'AI_QUOTA'
  if (reason.startsWith('GEMINI_ERROR')) return 'AI_INVALID'
  if (reason.includes('CSV needs a header')) return 'CSV_NO_HEADER'
  if (reason.includes('No menu rows')) return 'CSV_NO_ROWS'
  if (reason.startsWith('Upload a photo')) return 'UNSUPPORTED_TYPE'
  if (reason.includes('Photo and PDF reading is not available')) return 'AI_UNAVAILABLE'
  if (reason.includes('menu reader declined')) return 'AI_DECLINED'
  if (reason.includes('menu reader could not be reached')) return 'AI_UNREACHABLE'
  if (reason.includes('returned something unreadable')) return 'AI_INVALID'
  if (reason.includes('No menu items could be read')) return 'NO_ITEMS'
  return 'UNKNOWN'
}

export function isCsvUpload(mediaType: string, fileName: string): boolean {
  return CSV_TYPES.includes(mediaType) || fileName.toLowerCase().endsWith('.csv')
}

export async function fileToDraft(
  file: { mediaType: string; fileName: string; bytes: Buffer },
  adapter: AiAdapter | null
): Promise<ExtractResult> {
  // Browsers and OSes report a few variants for the same file type. The list
  // is what the spec and a phone camera produce, not the full IANA registry —
  // a real menu arrives as one of these and a wrong one is a real failure
  // mode worth surfacing rather than papering over.
  const PDF_TYPES = ['application/pdf', 'application/x-pdf']
  const normalisedType = file.mediaType === '' && file.fileName.toLowerCase().endsWith('.pdf')
    ? 'application/pdf'
    : file.mediaType
  if (isCsvUpload(normalisedType, file.fileName)) {
    const parsed = parseMenuCsv(file.bytes.toString('utf-8'))
    if (!parsed.ok) {
      return {
        ok: false,
        reason:
          parsed.reason === 'NO_HEADER'
            ? 'The CSV needs a header row with at least "name" and "price" columns.'
            : 'No menu rows could be read from this CSV.',
      }
    }
    return { ok: true, draft: csvToDraft(parsed) }
  }

  if (!IMAGE_TYPES.includes(normalisedType) && !PDF_TYPES.includes(normalisedType)) {
    return { ok: false, reason: 'Upload a photo, a PDF, or a CSV.' }
  }

  if (!adapter) {
    return {
      ok: false,
      reason: 'Photo and PDF reading is not available right now — use a CSV or type items in.',
    }
  }

  return adapter.extractMenu({
    mediaType: normalisedType,
    base64: file.bytes.toString('base64'),
  })
}

/**
 * Margin tier from price and cost — derived, never asked, and editable in
 * /dash/menu afterwards. The one place this classification lives.
 */
export function marginTierFor(pricePaise: number, costPaise: number): 'HIGH' | 'MID' | 'LOW' {
  if (!Number.isFinite(pricePaise) || pricePaise <= 0) return 'LOW'
  const margin = (pricePaise - costPaise) / pricePaise
  if (margin >= 0.7) return 'HIGH'
  if (margin >= 0.45) return 'MID'
  return 'LOW'
}

export interface ConfirmRow {
  include: boolean
  name: string
  category: string
  priceRupees: number
}

export type ConfirmResult =
  | { ok: true; items: MenuItemDraft[] }
  | { ok: false; reason: 'NOTHING_SELECTED' | 'MISSING_COST_PCT'; category?: string }

/**
 * The confirm step: draft rows + the operator's rough cost percentage per
 * category → real `MenuItem` drafts.
 *
 * Food cost is `price × pct/100` — the model never writes a cost, because a
 * hallucinated cost becomes a wrong contribution figure shown to an owner as
 * fact (PLATFORM.md §6a). Money math is integer paise throughout.
 */
export function confirmDraft(
  rows: ConfirmRow[],
  costPctByCategory: Record<string, number>
): ConfirmResult {
  const selected = rows.filter((r) => r.include && r.name.trim() !== '' && r.priceRupees > 0)
  if (selected.length === 0) return { ok: false, reason: 'NOTHING_SELECTED' }

  const items: MenuItemDraft[] = []
  for (const row of selected) {
    const category = row.category.trim().toLowerCase() || 'mains'
    const pct = costPctByCategory[category]
    if (pct === undefined || !Number.isFinite(pct) || pct < 0 || pct > 100) {
      return { ok: false, reason: 'MISSING_COST_PCT', category }
    }
    const pricePaise = Math.round(row.priceRupees * 100)
    const foodCostPaise = Math.round((pricePaise * pct) / 100)
    items.push({
      name: row.name.trim(),
      category,
      pricePaise,
      foodCostPaise,
      marginTier: marginTierFor(pricePaise, foodCostPaise),
    })
  }
  return { ok: true, items }
}

/** The distinct categories in a draft, for rendering one cost input each. */
export function draftCategories(draft: MenuDraft): string[] {
  return [...new Set(draft.items.map((i) => i.category.trim().toLowerCase() || 'mains'))]
}
