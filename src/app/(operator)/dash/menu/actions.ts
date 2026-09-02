'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { requireOperator } from '@/lib/operator-session'
import { parseRupeesToPaise } from '@/lib/money'
import {
  approveAiDraft,
  editAiDraft,
  generateItemDescriptionDrafts,
  rejectAiDraft,
} from '@/lib/ai-drafts'
import {
  confirmMenuDraft,
  costPctFromForm,
  discardMenuDraft,
  rowsFromForm,
  uploadMenuFile,
} from '@/lib/menu-draft'

/**
 * Menu management writes.
 *
 * Every one resolves the venue from the session via `requireOperator()` — an
 * item id off a form is a client input, so every write is scoped by
 * `{ id, venueId }` and an id from another venue updates zero rows rather
 * than the wrong venue's dish (SECURITY.md §8).
 *
 * No hard deletes: `Award` rows reference items, and a prize a guest was
 * handed must stay explicable forever. Deactivation is the only off switch.
 */

const MARGIN_TIERS = ['HIGH', 'MID', 'LOW'] as const
const PREP_BURDENS = ['LOW', 'MEDIUM', 'HIGH'] as const

interface ParsedItem {
  name: string
  category: string
  pricePaise: number
  foodCostPaise: number
  marginTier: (typeof MARGIN_TIERS)[number]
  prepBurden: (typeof PREP_BURDENS)[number]
  requiresKitchenWork: boolean
  isHero: boolean
}

function parseItemForm(
  formData: FormData
): { ok: true; item: ParsedItem } | { ok: false; error: string } {
  const name = String(formData.get('name') ?? '').trim()
  const pricePaise = parseRupeesToPaise(String(formData.get('price') ?? ''))
  const foodCostPaise = parseRupeesToPaise(String(formData.get('cost') ?? ''))

  if (!name || pricePaise === null || pricePaise <= 0 || foodCostPaise === null) {
    return { ok: false, error: 'invalid' }
  }
  if (foodCostPaise > pricePaise) return { ok: false, error: 'cost_over_price' }

  const rawTier = String(formData.get('marginTier') ?? '')
  const rawBurden = String(formData.get('prepBurden') ?? '')

  return {
    ok: true,
    item: {
      name,
      category:
        String(formData.get('category') ?? 'mains')
          .trim()
          .toLowerCase() || 'mains',
      pricePaise,
      foodCostPaise,
      marginTier: MARGIN_TIERS.find((t) => t === rawTier) ?? 'MID',
      prepBurden: PREP_BURDENS.find((b) => b === rawBurden) ?? 'LOW',
      requiresKitchenWork: formData.get('requiresKitchenWork') === 'on',
      isHero: formData.get('isHero') === 'on',
    },
  }
}

export async function addMenuItem(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const parsed = parseItemForm(formData)
  if (!parsed.ok) redirect(`/dash/menu?error=${parsed.error}`)

  await db.menuItem.create({ data: { venueId: operator.venueId, ...parsed.item } })
  revalidatePath('/dash/menu')
  redirect('/dash/menu')
}

export async function updateMenuItem(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const id = String(formData.get('menuItemId') ?? '')
  const parsed = parseItemForm(formData)
  if (!parsed.ok) redirect(`/dash/menu?error=${parsed.error}`)

  await db.menuItem.updateMany({ where: { id, venueId: operator.venueId }, data: parsed.item })
  revalidatePath('/dash/menu')
  redirect('/dash/menu')
}

export async function setMenuItemActive(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const id = String(formData.get('menuItemId') ?? '')
  const active = String(formData.get('active') ?? '') === 'true'

  await db.menuItem.updateMany({ where: { id, venueId: operator.venueId }, data: { active } })
  revalidatePath('/dash/menu')
  redirect('/dash/menu')
}

function uploadErrorKey(reason: string): string {
  switch (reason) {
    case 'EMPTY_FILE':
      return 'empty'
    case 'TOO_LARGE':
      return 'too_large'
    case 'UNSUPPORTED_TYPE':
      return 'unsupported'
    case 'CSV_NO_HEADER':
      return 'csv_header'
    case 'CSV_NO_ROWS':
      return 'csv_empty'
    case 'AI_UNAVAILABLE':
      // Distinct from the AI Assist `ai_unavailable` key on purpose: both
      // mean "no model wired in", but the menu copy names the menu reader.
      return 'upload_ai_unavailable'
    case 'AI_DECLINED':
    case 'AI_UNREACHABLE':
    case 'AI_INVALID':
      return 'upload_ai_failed'
    case 'NO_ITEMS':
      return 'no_items'
    default:
      return 'upload_failed'
  }
}

export async function uploadDashMenu(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const file = formData.get('menuFile')
  if (!(file instanceof File)) redirect('/dash/menu?error=upload_failed')

  const result = await uploadMenuFile(operator.venueId, file)
  if (!result.ok) redirect(`/dash/menu?error=${uploadErrorKey(result.reason)}`)

  revalidatePath('/dash/menu')
  redirect('/dash/menu')
}

export async function confirmDashMenu(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const result = await confirmMenuDraft(
    operator.venueId,
    rowsFromForm(formData),
    costPctFromForm(formData)
  )
  if (!result.ok) {
    redirect(
      `/dash/menu?error=${result.reason === 'MISSING_COST_PCT' ? 'missing_cost_pct' : 'nothing_selected'}`
    )
  }

  revalidatePath('/dash/menu')
  redirect('/dash/menu')
}

export async function discardDashMenu(): Promise<void> {
  const operator = await requireOperator()
  await discardMenuDraft(operator.venueId)

  revalidatePath('/dash/menu')
  redirect('/dash/menu')
}

// ── AI Assist (§6a) ──────────────────────────────────────────────────────────
//
// Draft descriptions for the operator's own active items. The venue comes from
// the session; the draft ids on these forms are re-checked against it inside
// `lib/ai-drafts`, so a draft from another venue is a refusal, not a write.

/** Why an AI step failed, as a key the page's error map can speak. */
function aiErrorKey(reason: string): string {
  switch (reason) {
    case 'AI_UNAVAILABLE':
      return 'ai_unavailable'
    case 'ITEM_GONE':
      return 'ai_item_gone'
    case 'MENU_CHANGED':
      return 'ai_menu_changed'
    case 'NOT_FOUND':
    case 'NOT_DRAFT':
      return 'ai_not_found'
    case 'INVALID':
      return 'ai_invalid'
    default:
      return 'ai_failed'
  }
}

export async function generateMenuItemDescriptions(): Promise<void> {
  const operator = await requireOperator()

  const result = await generateItemDescriptionDrafts(operator.venueId)
  revalidatePath('/dash/menu')
  if (!result.ok) redirect(`/dash/menu?error=${aiErrorKey(result.reason)}`)
  redirect(`/dash/menu?aiOk=${result.count}`)
}

export async function approveMenuItemDescriptionDraft(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const result = await approveAiDraft(String(formData.get('draftId') ?? ''), operator.venueId)
  revalidatePath('/dash/menu')
  if (!result.ok) redirect(`/dash/menu?error=${aiErrorKey(result.reason)}`)
  redirect('/dash/menu')
}

export async function editMenuItemDescriptionDraft(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const result = await editAiDraft(String(formData.get('draftId') ?? ''), operator.venueId, {
    description: String(formData.get('description') ?? ''),
  })
  revalidatePath('/dash/menu')
  if (!result.ok) redirect(`/dash/menu?error=${aiErrorKey(result.reason)}`)
  redirect('/dash/menu')
}

export async function rejectMenuItemDescriptionDraft(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  await rejectAiDraft(String(formData.get('draftId') ?? ''), operator.venueId)
  revalidatePath('/dash/menu')
  redirect('/dash/menu')
}
