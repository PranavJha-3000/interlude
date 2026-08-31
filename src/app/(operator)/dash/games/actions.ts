'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { requireOperator } from '@/lib/operator-session'
import { setVenueGameEnabled } from '@/lib/service'
import { MECHANICS } from '@/core/prize-engine'
import { type MysteryCustomerData, type SecretRecipeData } from '@/lib/games-config'
import {
  approveAiDraft,
  editAiDraft,
  generateGameCopyDraft,
  generateMysteryCustomerDrafts,
  generateSecretRecipeDrafts,
  rejectAiDraft,
} from '@/lib/ai-drafts'

/**
 * Turn one game on or off.
 *
 * The venue comes from the session and the mechanic comes from the form, so the
 * mechanic is validated against the known set before it reaches a query — a
 * string off a form is a client input whatever its TypeScript type says.
 */
export async function toggleGame(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const raw = String(formData.get('mechanic') ?? '')
  const mechanic = MECHANICS.find((m) => m === raw)
  if (!mechanic) return

  const enabled = String(formData.get('enabled') ?? '') === 'true'

  await setVenueGameEnabled(operator.venueId, mechanic, enabled)
  revalidatePath('/dash/games')
}
/**
 * Save one discovery game's data blob.
 *
 * Deliberately small for the pilot: Secret Recipe is one combination per line
 * (`ingredient, ingredient => Reveal Name`), Mystery Customer is three comma
 * lists. Both are parsed through the same defensive parsers the guest surface
 * reads, so whatever survives here is exactly what the game can play — no
 * second validation to drift out of sync.
 *
 * Only the two configurable mechanics are accepted; Beat the Kitchen's knobs
 * live in the ladder settings, not here.
 */
const CONFIGURABLE = ['SECRET_RECIPE', 'MYSTERY_CUSTOMER'] as const

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'combo'
  )
}

function parseCombinationLines(text: string): SecretRecipeData['combos'] {
  const seen = new Set<string>()
  const combos: SecretRecipeData['combos'] = []

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // One arrow per line; everything left of it is the ingredient set.
    const splitAt = trimmed.indexOf('=>')
    if (splitAt < 0) continue
    const ingredients = trimmed
      .slice(0, splitAt)
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    const reveals = trimmed.slice(splitAt + 2).trim()
    if (ingredients.length < 2 || !reveals) continue

    let id = slugify(reveals)
    for (let n = 2; seen.has(id); n++) id = `${slugify(reveals)}-${n}`
    seen.add(id)
    combos.push({ id, ingredients, reveals })
  }

  return combos
}

function csvList(text: string): string[] {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

export async function saveGameConfig(formData: FormData): Promise<void> {
  const operator = await requireOperator()
  if (!operator.venueId) return

  const raw = String(formData.get('mechanic') ?? '')
  if (!CONFIGURABLE.some((m) => m === raw)) return
  const mechanic = raw as (typeof CONFIGURABLE)[number]

  let data: SecretRecipeData | MysteryCustomerData
  if (mechanic === 'SECRET_RECIPE') {
    data = { combos: parseCombinationLines(String(formData.get('combos') ?? '')) }
  } else {
    data = {
      budgetOptionsPaise: csvList(String(formData.get('budgets') ?? '')).flatMap((entry) => {
        // Rupees on the form, paise in storage — the same conversion the rest
        // of the product makes at this boundary.
        const rupees = Number(entry.replace(/[^0-9.]/g, ''))
        return Number.isFinite(rupees) && rupees > 0 ? [Math.round(rupees * 100)] : []
      }),
      cravings: csvList(String(formData.get('cravings') ?? '')),
      courseOrder: csvList(String(formData.get('courses') ?? '')),
    }
  }

  const existing = await db.venueGame.findFirst({
    where: { venueId: operator.venueId, mechanic },
    select: { id: true },
  })

  if (existing) {
    await db.venueGame.update({ where: { id: existing.id }, data: { data: data as object } })
  } else {
    await db.venueGame.create({
      data: { venueId: operator.venueId, mechanic, enabled: true, data: data as object },
    })
  }

  revalidatePath('/dash/games')
}

// ── AI Assist (§6a) ──────────────────────────────────────────────────────────
//
// Draft generation for the two configurable games and the game copy. Venue
// from the session; every draft action re-checks the draft id against the
// venue inside `lib/ai-drafts`.

function aiErrorKey(reason: string): string {
  switch (reason) {
    case 'AI_UNAVAILABLE':
      return 'ai_unavailable'
    case 'ITEM_GONE':
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

export async function generateSecretRecipeDraftsForVenue(): Promise<void> {
  const operator = await requireOperator()

  const result = await generateSecretRecipeDrafts(operator.venueId)
  revalidatePath('/dash/games')
  if (!result.ok) redirect(`/dash/games?error=${aiErrorKey(result.reason)}`)
  redirect(`/dash/games?aiOk=${result.count}`)
}

export async function generateMysteryCustomerDraftsForVenue(): Promise<void> {
  const operator = await requireOperator()

  const result = await generateMysteryCustomerDrafts(operator.venueId)
  revalidatePath('/dash/games')
  if (!result.ok) redirect(`/dash/games?error=${aiErrorKey(result.reason)}`)
  redirect(`/dash/games?aiOk=${result.count}`)
}

export async function generateGameCopyForVenue(formData: FormData): Promise<void> {
  const operator = await requireOperator()
  const game = String(formData.get('game') ?? '')
  if (game !== 'SECRET_RECIPE' && game !== 'MYSTERY_CUSTOMER') return

  const result = await generateGameCopyDraft(operator.venueId, game)
  revalidatePath('/dash/games')
  if (!result.ok) redirect(`/dash/games?error=${aiErrorKey(result.reason)}`)
  redirect(`/dash/games?aiOk=${result.count}`)
}

export async function approveGameDraft(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const result = await approveAiDraft(String(formData.get('draftId') ?? ''), operator.venueId)
  revalidatePath('/dash/games')
  if (!result.ok) redirect(`/dash/games?error=${aiErrorKey(result.reason)}`)
  redirect('/dash/games')
}

export async function rejectGameDraft(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  await rejectAiDraft(String(formData.get('draftId') ?? ''), operator.venueId)
  revalidatePath('/dash/games')
  redirect('/dash/games')
}

export async function editGameDraft(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const kind = String(formData.get('kind') ?? '')
  const draftId = String(formData.get('draftId') ?? '')
  let patch: Record<string, unknown>
  if (kind === 'SECRET_RECIPE') {
    patch = {
      discoveryName: String(formData.get('discoveryName') ?? ''),
      revealCopy: String(formData.get('revealCopy') ?? ''),
    }
  } else if (kind === 'GAME_COPY') {
    patch = {
      introCopy: String(formData.get('introCopy') ?? ''),
      promptCopy: String(formData.get('promptCopy') ?? ''),
      discoveryCopy: String(formData.get('discoveryCopy') ?? ''),
    }
  } else {
    const budgetRupees = String(formData.get('budgetRupees') ?? '')
    const cravings = String(formData.get('cravings') ?? '')
    patch = {
      scenarioCopy: String(formData.get('scenarioCopy') ?? ''),
      ...(budgetRupees.trim() !== '' ? { budgetRupees: Number(budgetRupees) } : {}),
      ...(cravings.trim() !== ''
        ? {
            cravings: cravings
              .split(',')
              .map((c) => c.trim())
              .filter(Boolean),
          }
        : {}),
    }
  }

  const result = await editAiDraft(draftId, operator.venueId, patch)
  revalidatePath('/dash/games')
  if (!result.ok) redirect(`/dash/games?error=${aiErrorKey(result.reason)}`)
  redirect('/dash/games')
}
