/**
 * Secret Recipe — V1's menu-discovery game.
 *
 * The guest taps a few ingredient cards trying to uncover the venue's hidden
 * combinations: `Chicken + Peri Peri + Fries → Peri Peri Chicken Fries`. A
 * hit reveals a real dish and plants future-ordering intent; a miss says so
 * and invites another try within the session. Roughly ten to thirty seconds,
 * no physics, no simulation, no assets beyond the cards themselves.
 *
 * Pure `core/`, like everything here: no clock, no randomness, no I/O, and
 * no food opinions — which ingredients exist and which sets pay off are
 * venue configuration (`VenueGame.data`). Discovery never touches the
 * guest's current order; it only ever points at something to try next visit.
 *
 * Selections are compared as **sets**, not sequences — tap order and double-
 * taps never change the answer, so the same hand always meets the same fate.
 */

export interface SecretRecipeIngredient {
  id: string
  /** What the card says. */
  label: string
  /** Optional glyph on the card. Decorative only. */
  emoji?: string
}

export interface SecretRecipeCombination {
  id: string
  /** The exact set of taps that unlocks this. */
  ingredientIds: string[]
  /** What the reveal names — usually a real menu item. */
  resultName: string
  /**
   * The menu item this discovery points at, when it maps to one. Intent
   * only: nothing is added to any order, ever.
   */
  menuItemHintId?: string
  /** One line the reveal screen can show. */
  blurb?: string
}

export interface SecretRecipeConfig {
  ingredients: SecretRecipeIngredient[]
  combinations: SecretRecipeCombination[]
  /** Cards visible before anything is discovered. Default 4. */
  initialVisible?: number
  /** Extra cards each discovery uncovers. Default 2. */
  revealPerDiscovery?: number
}

export const DEFAULT_INITIAL_VISIBLE = 4
export const DEFAULT_REVEAL_PER_DISCOVERY = 2

/**
 * A miss still warms when the taps cover at least this share of some real
 * combination's ingredients — feedback that guides rather than teases.
 */
const WARM_SHARE_MIN = 0.5

/** Canonical set identity: sorted, joined. Two keys equal ⇒ same recipe. */
function setKey(ids: readonly string[]): string {
  return [...ids].sort().join('+')
}

/**
 * Every problem that would make this config unplayable: unknown ingredient
 * references, degenerate recipes, two combinations hiding behind one set,
 * reveals with no name. The dash surfaces these before saving.
 */
export function validateSecretRecipeConfig(config: SecretRecipeConfig): string[] {
  const problems: string[] = []

  if (config.ingredients.length === 0) problems.push('No ingredients configured')
  if (config.combinations.length === 0) problems.push('No combinations configured')

  const ingredientIds = new Set<string>()
  for (const ingredient of config.ingredients) {
    if (ingredientIds.has(ingredient.id)) {
      problems.push(`Duplicate ingredient id '${ingredient.id}'`)
    }
    ingredientIds.add(ingredient.id)
  }

  const seenSets = new Map<string, string>()
  for (const combination of config.combinations) {
    if (combination.ingredientIds.length < 2) {
      problems.push(`Combination '${combination.id}' needs at least two ingredients`)
    }
    for (const id of combination.ingredientIds) {
      if (!ingredientIds.has(id)) {
        problems.push(`Combination '${combination.id}' references unknown ingredient '${id}'`)
      }
    }
    const key = setKey(combination.ingredientIds)
    const owner = seenSets.get(key)
    if (owner) {
      problems.push(`Two combinations ('${owner}' and '${combination.id}') unlock the same set`)
    } else {
      seenSets.set(key, combination.id)
    }
    if (!combination.resultName.trim()) {
      problems.push(`Combination '${combination.id}' has no result name`)
    }
  }

  return problems
}

// ── Evaluating a hand ──────────────────────────────────────────────────────

/** Fewer than this many distinct taps is a half-finished hand, not a wrong one. */
const MIN_SELECTION_SIZE = 2

export type SecretRecipeEvaluation =
  | { kind: 'INCOMPLETE' }
  | { kind: 'DISCOVERED'; combination: SecretRecipeCombination }
  | { kind: 'INVALID'; warmCombinationId: string | null }

/**
 * Judge one hand. Sets, not sequences — duplicates collapse, order vanishes.
 *
 * A miss may still be **warm**: when the taps cover at least half of some
 * real combination, the feedback names nothing but the UI can glow warmer.
 * Ties on warmth break on combination id, so the same hand always warms the
 * same recipe.
 */
export function evaluateSelection(
  config: SecretRecipeConfig,
  selectedIds: readonly string[]
): SecretRecipeEvaluation {
  const selection = [...new Set(selectedIds)]
  if (selection.length < MIN_SELECTION_SIZE) return { kind: 'INCOMPLETE' }

  const key = setKey(selection)
  const hit = config.combinations.find((c) => setKey(c.ingredientIds) === key)
  if (hit) return { kind: 'DISCOVERED', combination: hit }

  let warmId: string | null = null
  let warmShare = 0
  for (const combination of [...config.combinations].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const unique = new Set(combination.ingredientIds)
    const overlap = selection.filter((id) => unique.has(id)).length
    const share = overlap / unique.size
    if (share >= WARM_SHARE_MIN && share > warmShare) {
      warmShare = share
      warmId = combination.id
    }
  }
  return { kind: 'INVALID', warmCombinationId: warmId }
}

/** How many cards the shelf shows once `discoveredIds` are unlocked. */
function visibleCount(config: SecretRecipeConfig, discoveredIds: readonly string[]): number {
  const known = new Set(config.combinations.map((c) => c.id))
  const found = discoveredIds.filter((id) => known.has(id)).length
  const initial = config.initialVisible ?? DEFAULT_INITIAL_VISIBLE
  const perFind = config.revealPerDiscovery ?? DEFAULT_REVEAL_PER_DISCOVERY
  return Math.min(initial + found * perFind, config.ingredients.length)
}

/**
 * The progressive shelf: a short row of cards at first, growing only as
 * combinations land. The full menu never appears at once — curiosity is the
 * mechanic, and a wall of twenty cards would smother it.
 */
export function visibleIngredients(
  config: SecretRecipeConfig,
  discoveredIds: readonly string[]
): SecretRecipeIngredient[] {
  return config.ingredients.slice(0, visibleCount(config, discoveredIds))
}

/** Combinations still out there, in configuration order. */
export function undiscoveredCombinations(
  config: SecretRecipeConfig,
  discoveredIds: readonly string[]
): SecretRecipeCombination[] {
  const found = new Set(discoveredIds)
  return config.combinations.filter((c) => !found.has(c.id))
}

export function discoveryProgress(
  config: SecretRecipeConfig,
  discoveredIds: readonly string[]
): { discovered: number; total: number } {
  return {
    discovered: config.combinations.length - undiscoveredCombinations(config, discoveredIds).length,
    total: config.combinations.length,
  }
}
