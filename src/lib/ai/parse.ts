import { z } from 'zod'
import type { MenuDraft } from './types'

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
  category: z.string(),
  priceRupees: z.number(),
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
          category: { type: 'STRING' },
          priceRupees: { type: 'NUMBER' },
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
    items.push({ name, category, priceRupees: round2(item.priceRupees) })
  }

  if (items.length === 0) return { ok: false }
  return { ok: true, draft: { items, warnings } }
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
