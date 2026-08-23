/**
 * Per-game configuration seeds and parsers (PLATFORM.md §10: configuration,
 * not constants).
 *
 * `VenueGame.data` holds each venue's own game data as JSON. The shapes below
 * are the contract between the dash editors, the seeder and the guest
 * actions; every consumer parses defensively — an empty or malformed blob
 * means "not configured", never a crash.
 *
 * **Secret Recipe combinations are menu-driven**: `ingredients` and `reveals`
 * are `MenuItem` ids belonging to the same venue, so a combination can only
 * ever reveal food the restaurant actually sells. Nothing here is hardcoded
 * globally — a venue without rows has no game.
 */
import { formatPaise } from '@/lib/money'
import type { MysteryCustomerConfig } from '@/core/games/mystery-customer'

/** Canonical stored shape of `VenueGame.data` for SECRET_RECIPE. */
export interface SecretRecipeData {
  combos: Array<{ id: string; ingredients: string[]; reveals: string }>
}

/** Canonical stored shape of `VenueGame.data` for MYSTERY_CUSTOMER. */
export interface MysteryCustomerData {
  budgetOptionsPaise: number[]
  cravings: string[]
  courseOrder: string[]
}

export function parseSecretRecipeData(raw: unknown): SecretRecipeData {
  if (!raw || typeof raw !== 'object') return { combos: [] }
  const d = raw as { combos?: unknown }
  if (!Array.isArray(d.combos)) return { combos: [] }
  const combos = d.combos.flatMap((c) => {
    if (!c || typeof c !== 'object') return []
    const x = c as { id?: unknown; ingredients?: unknown; reveals?: unknown }
    if (typeof x.id !== 'string' || typeof x.reveals !== 'string') return []
    if (!Array.isArray(x.ingredients)) return []
    const ingredients = x.ingredients.filter((i): i is string => typeof i === 'string')
    // A combination needs at least two ingredients to be a combination.
    if (ingredients.length < 2) return []
    return [{ id: x.id, ingredients, reveals: x.reveals }]
  })
  return { combos }
}

export function parseMysteryCustomerData(raw: unknown): MysteryCustomerData {
  if (!raw || typeof raw !== 'object')
    return { budgetOptionsPaise: [], cravings: [], courseOrder: [] }
  const d = raw as { budgetOptionsPaise?: unknown; cravings?: unknown; courseOrder?: unknown }
  const nums = (v: unknown) =>
    Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number' && n > 0) : []
  const strs = (v: unknown) =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.length > 0) : []
  return {
    budgetOptionsPaise: nums(d.budgetOptionsPaise),
    cravings: strs(d.cravings),
    courseOrder: strs(d.courseOrder),
  }
}

/**
 * Lift the stored dash blob into the core config the game runs on.
 *
 * The stored shape is deliberately shallow — three arrays an owner can edit
 * without a manual. Budget values become BUDGET options labelled in rupees,
 * craving strings become tag-matching CRAVING options, and the course order
 * names slots whose categories use the same words ('main', 'side', 'drink'),
 * which is also how the seeder tags the menu. Preference/appetite/diet axes
 * stay out of V1 configuration; the draw simply skips kinds with no options.
 */
export function mysteryConfigFromData(data: MysteryCustomerData): MysteryCustomerConfig {
  const options: MysteryCustomerConfig['options'] = [
    ...data.budgetOptionsPaise.map((paise, i) => ({
      id: `budget-${i}`,
      kind: 'BUDGET' as const,
      label: formatPaise(paise),
      budgetPaise: paise,
    })),
    ...data.cravings.map((c) => ({
      id: `craving-${c}`,
      kind: 'CRAVING' as const,
      label: c,
      value: c,
    })),
  ]
  const courses: MysteryCustomerConfig['courses'] = data.courseOrder.map((slot) => ({
    slot,
    label: slot.charAt(0).toUpperCase() + slot.slice(1),
    categories: [slot],
  }))
  return { options, courses }
}

/**
 * Default prize-rule seeds for the discovery games live in
 * `core/prize-engine/default-rules.ts` alongside the Beat-the-Kitchen ones —
 * one canonical seed list, written at venue creation, editable in /dash.
 */
