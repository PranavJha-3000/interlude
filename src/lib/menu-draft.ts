import 'server-only'

import { db } from '@/lib/db'
import { getAiAdapter } from '@/lib/ai'
import type { MenuDraft } from '@/lib/ai/types'
import { confirmDraft, fileToDraft, isCsvUpload, type ConfirmRow } from '@/lib/menu-import'
import { createMenuItems } from '@/lib/venue-setup'

/**
 * The database side of menu upload — shared by onboarding and `/dash/menu`,
 * so a re-import later goes through exactly the path setup did.
 *
 * Every function takes the venueId from the caller, which took it from the
 * session. Nothing here trusts a form's idea of whose menu this is.
 */

/** 8MB — a phone photo of a menu. Bigger is almost certainly not a menu. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

export type UploadOutcome = { ok: true } | { ok: false; reason: string }

export async function uploadMenuFile(venueId: string, file: File): Promise<UploadOutcome> {
  if (file.size === 0) return { ok: false, reason: 'EMPTY_FILE' }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, reason: 'TOO_LARGE' }

  const bytes = Buffer.from(await file.arrayBuffer())
  const result = await fileToDraft(
    { mediaType: file.type, fileName: file.name, bytes },
    getAiAdapter()
  )
  if (!result.ok) return { ok: false, reason: result.reason }

  const source = isCsvUpload(file.type, file.name)
    ? 'csv'
    : file.type === 'application/pdf'
      ? 'pdf'
      : 'photo'

  // One draft per venue: a new upload replaces the old one, whole.
  await db.menuImportDraft.deleteMany({ where: { venueId } })
  await db.menuImportDraft.create({
    data: {
      venueId,
      source,
      items: result.draft.items as unknown as object,
      warnings: result.draft.warnings,
    },
  })
  return { ok: true }
}

export async function getMenuDraft(
  venueId: string
): Promise<{ source: string; draft: MenuDraft } | null> {
  const row = await db.menuImportDraft.findUnique({ where: { venueId } })
  if (!row) return null
  return {
    source: row.source,
    draft: {
      items: row.items as unknown as MenuDraft['items'],
      warnings: row.warnings as unknown as string[],
    },
  }
}

export async function discardMenuDraft(venueId: string): Promise<void> {
  await db.menuImportDraft.deleteMany({ where: { venueId } })
}

export type ConfirmOutcome = { ok: true; count: number } | { ok: false; reason: string }

/**
 * Confirm: the edited grid plus the per-category cost percentages become real
 * `MenuItem` rows through the same `createMenuItems` the seed and the manual
 * form use, and the draft is deleted. Abandoning the draft writes nothing —
 * that property is the §6a promise and it is asserted in the E2E suite.
 */
export async function confirmMenuDraft(
  venueId: string,
  rows: ConfirmRow[],
  costPctByCategory: Record<string, number>
): Promise<ConfirmOutcome> {
  const result = confirmDraft(rows, costPctByCategory)
  if (!result.ok) return { ok: false, reason: result.reason }

  await createMenuItems(db, venueId, result.items)
  await discardMenuDraft(venueId)
  return { ok: true, count: result.items.length }
}

/** Pull the grid's repeated fields out of the POST. */
export function rowsFromForm(formData: FormData): ConfirmRow[] {
  const names = formData.getAll('rowName').map(String)
  const categories = formData.getAll('rowCategory').map(String)
  const prices = formData.getAll('rowPrice').map(String)
  const included = new Set(formData.getAll('rowInclude').map(String))

  return names.map((name, i) => ({
    include: included.has(String(i)),
    name,
    category: categories[i] ?? 'mains',
    priceRupees: Number(prices[i] ?? '0'),
  }))
}

export function costPctFromForm(formData: FormData): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('costPct:')) continue
    const category = key.slice('costPct:'.length)
    const pct = Number(String(value))
    if (String(value).trim() !== '' && Number.isFinite(pct)) out[category] = pct
  }
  return out
}
