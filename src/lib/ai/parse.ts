import { z } from 'zod'
import type {
  GameCopyDraft,
  MenuDraft,
  MenuModifier,
  MysteryCustomerCandidate,
  SecretRecipeCandidate,
} from './types'

/**
 * Turn whatever the model returned into a `MenuDraft`, or a refusal.
 *
 * Pure, so the whole surface between "model said something" and "operator sees
 * a grid" is unit-testable without a network. The model's output is *never*
 * trusted raw: a hallucinated price of ₹0, a negative number, a 40,000-rupee
 * dosa or a blank name each drop to a warning rather than reaching the grid as
 * fact — and none of it is saved until the operator confirms anyway.
 */

const rawItem = z.object({
  name: z.string(),
  description: z.string().optional(),
  category: z.string(),
  priceRupees: z.number(),
  // Loose shape — the model can hand us malformed rows that we drop per-item
  // at sanitise-time. A strict schema would discard the whole dish on a
  // single bad modifier, which is more refusal than an operator needs.
  modifiers: z.array(z.object({ name: z.string(), priceDeltaRupees: z.unknown() })).optional(),
})

const rawDraft = z.object({
  items: z.array(rawItem),
  warnings: z.array(z.string()).default([]),
})

/** The Gemini JSON schema the model is constrained to. Mirrors `rawDraft`. */
export const GEMINI_MENU_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          description: { type: 'STRING' },
          category: { type: 'STRING' },
          priceRupees: { type: 'NUMBER' },
          modifiers: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                priceDeltaRupees: { type: 'NUMBER' },
              },
              required: ['name', 'priceDeltaRupees'],
            },
          },
        },
        required: ['name', 'category', 'priceRupees'],
      },
    },
    warnings: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['items', 'warnings'],
} as const

/** Sanity ceiling for a single menu item, in rupees. Above this is a misread. */
const MAX_PLAUSIBLE_RUPEES = 100_000

export function parseMenuDraft(raw: unknown): { ok: true; draft: MenuDraft } | { ok: false } {
  const parsed = rawDraft.safeParse(raw)
  if (!parsed.success) return { ok: false }

  const warnings = [...parsed.data.warnings]
  const items = []

  for (const item of parsed.data.items) {
    const name = item.name.trim()
    const category = item.category.trim().toLowerCase() || 'mains'
    if (!name) {
      warnings.push('Dropped an item with no name.')
      continue
    }
    if (!Number.isFinite(item.priceRupees) || item.priceRupees <= 0) {
      warnings.push(`"${name}" had no readable price — add it by hand if you want it.`)
      continue
    }
    if (item.priceRupees > MAX_PLAUSIBLE_RUPEES) {
      warnings.push(`"${name}" read as an implausible price and was dropped.`)
      continue
    }
    const modifiers = sanitisedModifiers(item.modifiers, name, warnings)
    items.push({
      name,
      category,
      priceRupees: round2(item.priceRupees),
      ...(item.description ? { description: String(item.description).trim().slice(0, 240) } : {}),
      ...(modifiers.length > 0 ? { modifiers } : {}),
    })
  }

  if (items.length === 0) return { ok: false }
  return { ok: true, draft: { items, warnings } }
}

function sanitisedModifiers(raw: unknown, itemName: string, warnings: string[]): MenuModifier[] {
  const out: MenuModifier[] = []
  if (!Array.isArray(raw)) return out
  for (const m of raw.slice(0, 6)) {
    if (!m || typeof m !== 'object') continue
    const x = m as { name?: unknown; priceDeltaRupees?: unknown }
    const name = typeof x.name === 'string' ? x.name.trim() : ''
    const price = typeof x.priceDeltaRupees === 'number' ? x.priceDeltaRupees : NaN
    if (!name || !Number.isFinite(price)) {
      warnings.push(`"${itemName}" had an unreadable add-on and it was dropped.`)
      continue
    }
    if (Math.abs(price) > MAX_PLAUSIBLE_RUPEES) continue
    out.push({ name, priceDeltaRupees: round2(price) })
  }
  return out
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Pull the first JSON object out of a text blob, for models that wrap it. */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}
// ── Draft-generation schemas ─────────────────────────────────────────────────
//
// Same discipline as menu extraction, applied to the model's newer outputs:
// the Gemini `responseSchema` constrains the shape, and each parser below
// re-validates the *meaning* — blank copy, invented item ids and narration
// that oversteps its figures all become a refusal rather than a row.

/** Text → JSON, for models that wrap the payload in prose or fences. */
export function jsonFromText(
  text: string | null
): { ok: true; data: unknown } | { ok: false; reason: string } {
  if (!text || text.trim() === '') return { ok: false, reason: 'The model returned nothing.' }
  const raw = extractJson(text)
  if (raw === null) return { ok: false, reason: 'The model returned something unreadable.' }
  return { ok: true, data: raw }
}

export const GEMINI_DESCRIBE_ITEMS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          itemId: { type: 'STRING' },
          description: { type: 'STRING' },
        },
        required: ['itemId', 'description'],
      },
    },
  },
  required: ['items'],
} as const

export const GEMINI_SECRET_RECIPE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    candidates: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          combinationId: { type: 'STRING' },
          itemIds: { type: 'ARRAY', items: { type: 'STRING' } },
          revealItemId: { type: 'STRING' },
          discoveryName: { type: 'STRING' },
          revealCopy: { type: 'STRING' },
        },
        required: ['combinationId', 'itemIds', 'revealItemId', 'discoveryName', 'revealCopy'],
      },
    },
  },
  required: ['candidates'],
} as const

export const GEMINI_MYSTERY_CUSTOMER_SCHEMA = {
  type: 'OBJECT',
  properties: {
    candidates: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          profileId: { type: 'STRING' },
          budgetPaise: { type: 'NUMBER' },
          cravings: { type: 'ARRAY', items: { type: 'STRING' } },
          preferences: { type: 'ARRAY', items: { type: 'STRING' } },
          appetiteDishes: { type: 'NUMBER' },
          scenarioCopy: { type: 'STRING' },
        },
        required: ['profileId', 'budgetPaise', 'cravings', 'appetiteDishes', 'scenarioCopy'],
      },
    },
  },
  required: ['candidates'],
} as const

export const GEMINI_GAME_COPY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    introCopy: { type: 'STRING' },
    promptCopy: { type: 'STRING' },
    discoveryCopy: { type: 'STRING' },
  },
  required: ['introCopy', 'promptCopy', 'discoveryCopy'],
} as const

export const GEMINI_NARRATION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sentences: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['sentences'],
} as const
// ── Per-output parsers ───────────────────────────────────────────────────────
//
// Shape failures reject the whole response; *semantic* failures (an invented
// item id, an empty line) drop the individual draft, so one bad row from the
// model never costs the operator the whole batch.

const MAX_DESCRIPTION_CHARS = 240
const MAX_COPY_CHARS = 240
const MAX_CANDIDATES = 8

const describeItemsRaw = z.object({
  items: z.array(z.object({ itemId: z.string(), description: z.string() })),
})

export function parseDescribeItems(
  raw: unknown,
  allowedItemIds: ReadonlySet<string>
):
  | { ok: true; drafts: Array<{ itemId: string; description: string }>; warnings: string[] }
  | { ok: false; reason: string } {
  const shaped = describeItemsRaw.safeParse(raw)
  if (!shaped.success) return { ok: false, reason: 'No readable descriptions came back.' }

  const drafts = new Map<string, string>()
  const warnings: string[] = []
  for (const row of shaped.data.items.slice(0, 200)) {
    const description = row.description.trim().slice(0, MAX_DESCRIPTION_CHARS)
    const itemId = row.itemId.trim()
    if (!allowedItemIds.has(itemId)) {
      warnings.push('Dropped a description for an item that is not on this menu.')
      continue
    }
    if (!description) {
      warnings.push('Dropped an empty description.')
      continue
    }
    if (!drafts.has(itemId)) drafts.set(itemId, description)
  }

  if (drafts.size === 0) return { ok: false, reason: 'No descriptions survived validation.' }
  return {
    ok: true,
    drafts: [...drafts].map(([itemId, description]) => ({ itemId, description })),
    warnings,
  }
}

const secretRecipeRaw = z.object({
  candidates: z.array(
    z.object({
      combinationId: z.string(),
      itemIds: z.array(z.string()),
      revealItemId: z.string(),
      discoveryName: z.string(),
      revealCopy: z.string(),
    })
  ),
})

/** Canonical set identity — the same rule `core/games/secret-recipe` plays by. */
function setKey(ids: readonly string[]): string {
  return [...ids].sort().join('+')
}

export function parseSecretRecipeCandidates(
  raw: unknown,
  allowedItemIds: ReadonlySet<string>
):
  | { ok: true; candidates: SecretRecipeCandidate[]; warnings: string[] }
  | { ok: false; reason: string } {
  const shaped = secretRecipeRaw.safeParse(raw)
  if (!shaped.success) return { ok: false, reason: 'No readable combinations came back.' }

  const candidates: SecretRecipeCandidate[] = []
  const warnings: string[] = []
  const seenIds = new Set<string>()
  const seenSets = new Set<string>()

  for (const row of shaped.data.candidates.slice(0, MAX_CANDIDATES)) {
    const combinationId = row.combinationId.trim()
    const itemIds = [...new Set(row.itemIds.map((id) => String(id).trim()).filter(Boolean))]
    const revealItemId = row.revealItemId.trim()
    const discoveryName = row.discoveryName.trim().slice(0, 120)
    const revealCopy = row.revealCopy.trim().slice(0, MAX_COPY_CHARS)
    const label = discoveryName || combinationId || 'A combination'

    if (!combinationId || seenIds.has(combinationId)) {
      warnings.push('Dropped a combination with a missing or repeated id.')
      continue
    }
    if (itemIds.length < 2) {
      warnings.push(`"${label}" needs at least two menu items and was dropped.`)
      continue
    }
    const unknownId = itemIds.find((id) => !allowedItemIds.has(id))
    if (unknownId) {
      warnings.push(`"${label}" referenced an item that is not on this menu and was dropped.`)
      continue
    }
    // The reveal must be one of the tapped dishes: the guest game resolves the
    // reveal from the combination's own item ids, so anything else drops out.
    if (!allowedItemIds.has(revealItemId) || !itemIds.includes(revealItemId)) {
      warnings.push(`"${label}" must reveal one of its own items and was dropped.`)
      continue
    }
    if (!discoveryName || !revealCopy) {
      warnings.push('Dropped a combination with no name or no reveal copy.')
      continue
    }
    const key = setKey(itemIds)
    if (seenSets.has(key)) {
      warnings.push(`"${label}" repeats an earlier combination's items and was dropped.`)
      continue
    }
    seenIds.add(combinationId)
    seenSets.add(key)
    candidates.push({ combinationId, itemIds, revealItemId, discoveryName, revealCopy })
  }

  if (candidates.length === 0) return { ok: false, reason: 'No combinations survived validation.' }
  return { ok: true, candidates, warnings }
}
const mysteryCustomerRaw = z.object({
  candidates: z.array(
    z.object({
      profileId: z.string(),
      budgetPaise: z.number(),
      cravings: z.array(z.string()),
      preferences: z.array(z.string()),
      appetiteDishes: z.number(),
      scenarioCopy: z.string(),
    })
  ),
})

export function parseMysteryCustomerCandidates(
  raw: unknown
):
  | { ok: true; candidates: MysteryCustomerCandidate[]; warnings: string[] }
  | { ok: false; reason: string } {
  const shaped = mysteryCustomerRaw.safeParse(raw)
  if (!shaped.success) return { ok: false, reason: 'No readable personas came back.' }

  const candidates: MysteryCustomerCandidate[] = []
  const warnings: string[] = []
  const seenIds = new Set<string>()

  for (const row of shaped.data.candidates.slice(0, MAX_CANDIDATES)) {
    const profileId = row.profileId.trim()
    const cravings = row.cravings
      .map((c) => String(c).trim())
      .filter(Boolean)
      .slice(0, 6)
    const preferences = row.preferences
      .map((p) => String(p).trim())
      .filter(Boolean)
      .slice(0, 6)
    const scenarioCopy = row.scenarioCopy.trim().slice(0, 360)

    if (!profileId || seenIds.has(profileId)) {
      warnings.push('Dropped a persona with a missing or repeated id.')
      continue
    }
    // Budgets are money: whole paise or nothing. A float here becomes a
    // broken figure the moment `formatPaise` renders it.
    if (
      !Number.isFinite(row.budgetPaise) ||
      row.budgetPaise <= 0 ||
      !Number.isInteger(row.budgetPaise)
    ) {
      warnings.push('Dropped a persona whose budget was not a whole number of paise.')
      continue
    }
    if (cravings.length === 0) {
      warnings.push('Dropped a persona with no craving — the scorer needs one.')
      continue
    }
    if (!Number.isFinite(row.appetiteDishes) || row.appetiteDishes < 1 || row.appetiteDishes > 6) {
      warnings.push('Dropped a persona whose appetite was not between 1 and 6 dishes.')
      continue
    }
    if (!scenarioCopy) {
      warnings.push('Dropped a persona with no scenario copy.')
      continue
    }
    seenIds.add(profileId)
    candidates.push({
      profileId,
      budgetPaise: row.budgetPaise,
      cravings,
      preferences,
      appetiteDishes: Math.round(row.appetiteDishes),
      scenarioCopy,
    })
  }

  if (candidates.length === 0) return { ok: false, reason: 'No personas survived validation.' }
  return { ok: true, candidates, warnings }
}

const gameCopyRaw = z.object({
  introCopy: z.string(),
  promptCopy: z.string(),
  discoveryCopy: z.string(),
})

export function parseGameCopy(
  raw: unknown
): { ok: true; draft: GameCopyDraft } | { ok: false; reason: string } {
  const shaped = gameCopyRaw.safeParse(raw)
  if (!shaped.success) return { ok: false, reason: 'No readable game copy came back.' }

  const introCopy = shaped.data.introCopy.trim().slice(0, MAX_COPY_CHARS)
  const promptCopy = shaped.data.promptCopy.trim().slice(0, MAX_COPY_CHARS)
  const discoveryCopy = shaped.data.discoveryCopy.trim().slice(0, MAX_COPY_CHARS)
  if (!introCopy || !promptCopy || !discoveryCopy) {
    return { ok: false, reason: 'The game copy came back incomplete.' }
  }
  return { ok: true, draft: { introCopy, promptCopy, discoveryCopy } }
}
const narrationRaw = z.object({
  sentences: z.array(z.string()).min(1).max(3),
})

/**
 * Every rupee or percent figure the narration carries must be one the server
 * formatted, and every remaining digit must be a provided count. A model that
 * rounds ₹2,340 up to ₹2,400, infers a 42% scan rate or bumps "12 of 30" to
 * "18 of 30" has altered a metric — the §6a line — and this refuses the whole
 * narration rather than mailing the improvement.
 */
// Rupee or percent figures the narration may carry. Numbers end on a digit
// on purpose — `[\d,]*` would otherwise eat a trailing comma like the one in
// "₹2,340, with..." and mismatch the provided figure.
const FIGURE_RE = /-?₹\s?\d+(?:,\d+)*|-?\d+(?:,\d+)*(?:\.\d+)?\s?%/g

function normaliseFigure(figure: string): string {
  return figure.replace(/\s+/g, '')
}

export function narrationUsesOnlyProvidedFigures(
  sentences: readonly string[],
  providedFigures: readonly string[],
  providedCounts: readonly string[] = []
): boolean {
  const figures = new Set(providedFigures.map(normaliseFigure))
  const counts = new Set(providedCounts)
  for (const sentence of sentences) {
    // Figures first, removed as they pass, so their digits cannot be
    // double-counted as bare counts.
    let rest = sentence
    for (const figure of sentence.match(FIGURE_RE) ?? []) {
      if (!figures.has(normaliseFigure(figure))) return false
      rest = rest.replace(figure, ' ')
    }
    for (const token of rest.match(/\d+/g) ?? []) {
      if (!counts.has(token)) return false
    }
  }
  return true
}

export function parseNarration(
  raw: unknown,
  providedFigures: readonly string[],
  providedCounts: readonly string[] = []
): { ok: true; sentences: string[] } | { ok: false; reason: string } {
  const shaped = narrationRaw.safeParse(raw)
  if (!shaped.success) return { ok: false, reason: 'No readable narration came back.' }

  const sentences = shaped.data.sentences
    .map((s) => String(s).trim())
    .filter((s) => s !== '')
    .map((s) => s.slice(0, 400))
  if (sentences.length === 0) return { ok: false, reason: 'The narration came back empty.' }
  if (sentences.length > 3) return { ok: false, reason: 'The narration ran past three sentences.' }
  if (!narrationUsesOnlyProvidedFigures(sentences, providedFigures, providedCounts)) {
    return { ok: false, reason: 'The narration used figures that were never provided.' }
  }
  return { ok: true, sentences }
}
