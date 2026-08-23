/**
 * Mystery Customer — V1's rapid-choice game (three-game product brief).
 *
 * The venue describes *kinds* of customers it wants to serve — budgets,
 * cravings, preferences, appetites. From a deterministic seed (the table's
 * run id and attempt number) the game deals one such customer; the guest
 * builds their meal from a few real menu items; a pure scorer explains how
 * well the meal fits the brief.
 *
 * Everything here is pure: same seed, same customer; same picks, same score.
 * The customer is a **brief**, not a character — no simulation, movement or
 * animation lives in this file, and no AI decides anything.
 *
 * All tunables come from venue configuration. The code knows no cuisine and
 * no currency amounts of its own.
 */

import { hashToRange } from '../mechanics/hash'

export type ProfileKind = 'BUDGET' | 'CRAVING' | 'PREFERENCE' | 'APPETITE' | 'DIET'

/** Fixed draw order — part of the contract, so seeds stay meaningful forever. */
export const PROFILE_KIND_ORDER: readonly ProfileKind[] = [
  'BUDGET',
  'CRAVING',
  'PREFERENCE',
  'APPETITE',
  'DIET',
] as const

export interface ProfileOption {
  id: string
  kind: ProfileKind
  /** What the guest sees: "₹300", "Craves spice", "Vegetarian". */
  label: string
  /**
   * Machine value matched against menu tags ('spicy', 'veg', …). BUDGET
   * options carry `budgetPaise` instead; APPETITE carries `dishCount`.
   */
  value?: string
  /** BUDGET only. What this customer can spend, in paise. */
  budgetPaise?: number
  /** APPETITE only. How many dishes this customer expects across the meal. */
  dishCount?: number
}

export interface CourseSlot {
  /** Stable slot key the picks reference: 'main', 'side', 'drink', … */
  slot: string
  /** What the guest sees: "Main", "Side". */
  label: string
  /** Menu categories eligible for this slot. */
  categories: string[]
}

export interface MysteryCustomerConfig {
  options: ProfileOption[]
  courses: CourseSlot[]
  /** Score at or above which the meal nails the brief (the WIN outcome). Default 70. */
  winScore?: number
}

export interface MysteryCustomerMenuItem {
  id: string
  name: string
  category: string
  pricePaise: number
  /** Free-text tags venues maintain: 'spicy', 'sweet', 'veg', 'shareable'… */
  tags?: string[]
  available: boolean
}

export interface MysteryProfile {
  seed: string
  budgetPaise: number
  craving: string | null
  preference: string | null
  diet: string | null
  appetiteDishes: number
  /** Every drawn option, in draw order — the renderable brief. */
  choices: Array<{ kind: ProfileKind; optionId: string; label: string }>
}

/**
 * Deal a customer. One stable draw per kind, in `PROFILE_KIND_ORDER`, keyed
 * `seed:kind` through the same murmur-derived range hash the pairing rule
 * uses — deterministic, uniformly spread, and identical on every device.
 */
export function generateMysteryProfile(
  config: MysteryCustomerConfig,
  seed: string
): MysteryProfile {
  const choices: MysteryProfile['choices'] = []
  let budgetPaise = 0
  let craving: string | null = null
  let preference: string | null = null
  let diet: string | null = null
  let appetiteDishes = 0

  for (const kind of PROFILE_KIND_ORDER) {
    const pool = config.options.filter((o) => o.kind === kind)
    if (pool.length === 0) continue
    const option = pool[hashToRange(`${seed}:${kind}`, pool.length)]!
    choices.push({ kind, optionId: option.id, label: option.label })
    if (kind === 'BUDGET') budgetPaise = option.budgetPaise ?? 0
    if (kind === 'CRAVING') craving = option.value ?? null
    if (kind === 'PREFERENCE') preference = option.value ?? null
    if (kind === 'DIET') diet = option.value ?? null
    if (kind === 'APPETITE') appetiteDishes = option.dishCount ?? 0
  }

  return { seed, budgetPaise, craving, preference, diet, appetiteDishes, choices }
}

/**
 * Every problem that would make this config unplayable. Needs at least one
 * budget, one craving and one course to deal anything worth scoring.
 */
export function validateMysteryCustomerConfig(config: MysteryCustomerConfig): string[] {
  const problems: string[] = []

  if (!config.options.some((o) => o.kind === 'BUDGET')) {
    problems.push('Needs at least one BUDGET option')
  }
  if (!config.options.some((o) => o.kind === 'CRAVING')) {
    problems.push('Needs at least one CRAVING option')
  }
  if (config.courses.length === 0) problems.push('Needs at least one course')

  const optionIds = new Set<string>()
  for (const option of config.options) {
    if (optionIds.has(option.id)) problems.push(`Duplicate option id '${option.id}'`)
    optionIds.add(option.id)
    if (option.kind === 'BUDGET' && (option.budgetPaise ?? 0) <= 0) {
      problems.push(`Budget option '${option.id}' needs a positive budgetPaise`)
    }
    if (option.kind === 'CRAVING' && !option.value) {
      problems.push(`Craving option '${option.id}' needs a value to match menu tags`)
    }
    if (option.kind === 'APPETITE' && (option.dishCount ?? 0) < 1) {
      problems.push(`Appetite option '${option.id}' needs a dishCount of at least 1`)
    }
  }

  const slots = new Set<string>()
  for (const course of config.courses) {
    if (slots.has(course.slot)) problems.push(`Duplicate course slot '${course.slot}'`)
    slots.add(course.slot)
    if (course.categories.length === 0) {
      problems.push(`Course '${course.slot}' lists no eligible categories`)
    }
  }

  if (config.winScore !== undefined && (config.winScore < 1 || config.winScore > 100)) {
    problems.push('winScore must sit between 1 and 100')
  }

  return problems
}

export interface MealPick {
  /** The course slot this item fills: 'main', 'side', … */
  slot: string
  itemId: string
}

export interface ScoredMeal {
  outcome: 'WIN' | 'LOSE'
  scorePct: number
  totalPaise: number
  budgetPaise: number
  withinBudget: boolean
  /** What kept the score down, worst first — shown under the result. */
  problems: string[]
  /** What lifted it — the "interesting combination" lines worth showing. */
  highlights: string[]
  /** The resolved meal, in pick order. */
  meal: Array<{ itemId: string; name: string; slot: string; pricePaise: number }>
}

const DEFAULT_WIN_SCORE = 70

/** Items a guest may pick for one course slot — on the menu and category-fit. */
export function menuForCourse(
  config: MysteryCustomerConfig,
  menu: MysteryCustomerMenuItem[],
  slot: string
): MysteryCustomerMenuItem[] {
  const course = config.courses.find((c) => c.slot === slot)
  if (!course) return []
  return menu.filter((m) => m.available && course.categories.includes(m.category))
}

/**
 * Score a built meal against the drawn brief.
 *
 * One hundred points, five visible components — budget 25, craving 30,
 * preference 15, appetite 15, variety 15 — minus 35 for a diet violation.
 * Every point is explainable, nothing is random, and the same picks against
 * the same brief always land on the same outcome.
 */
export function scoreMeal(
  config: MysteryCustomerConfig,
  profile: MysteryProfile,
  menu: MysteryCustomerMenuItem[],
  picks: MealPick[]
): ScoredMeal {
  const winScore = config.winScore ?? DEFAULT_WIN_SCORE
  const byId = new Map(menu.map((m) => [m.id, m]))
  const problems: string[] = []
  const highlights: string[] = []
  const meal: ScoredMeal['meal'] = []
  const seenItems = new Set<string>()
  const seenSlots = new Set<string>()

  for (const pick of picks) {
    const course = config.courses.find((c) => c.slot === pick.slot)
    if (!course) {
      problems.push(`Unknown course '${pick.slot}'`)
      continue
    }
    const item = byId.get(pick.itemId)
    if (!item || !item.available) {
      problems.push('One pick is no longer on the menu')
      continue
    }
    if (!course.categories.includes(item.category)) {
      problems.push(`${item.name} does not fit the ${course.label.toLowerCase()} course`)
      continue
    }
    if (seenItems.has(item.id)) {
      problems.push(`The same dish appears twice — ${item.name}`)
      continue
    }
    seenSlots.add(course.slot)
    seenItems.add(item.id)
    meal.push({ itemId: item.id, name: item.name, slot: course.slot, pricePaise: item.pricePaise })
  }

  const totalPaise = meal.reduce((sum, m) => sum + m.pricePaise, 0)
  const withinBudget = totalPaise <= profile.budgetPaise

  // Budget (25): inside the brief's budget is full credit; outside scales to
  // zero at double the budget, so a mild overshoot still reads as "close".
  // An empty hand earns nothing here — spending ₹0 is not fitting a budget.
  let budgetPts = 0
  if (meal.length > 0 && profile.budgetPaise > 0) {
    if (withinBudget) {
      budgetPts = 25
      highlights.push('Fits the budget')
    } else if (totalPaise < profile.budgetPaise * 2) {
      budgetPts = Math.round(25 * (1 - (totalPaise - profile.budgetPaise) / profile.budgetPaise))
    } else {
      problems.push("Way over the customer's budget")
    }
  }

  // Craving (30) / preference (15): the share of dishes carrying the tag.
  const taggedShare = (tag: string | null) => {
    if (!tag || meal.length === 0) return null
    return meal.filter((m) => byId.get(m.itemId)?.tags?.includes(tag)).length / meal.length
  }
  const cravingShare = taggedShare(profile.craving)
  const preferenceShare = taggedShare(profile.preference)

  let cravingPts = 0
  if (cravingShare !== null) {
    cravingPts = Math.round(30 * cravingShare)
    if (cravingShare === 1) highlights.push(`Every dish hits the ${profile.craving} craving`)
  }

  let preferencePts = 0
  if (preferenceShare !== null) {
    preferencePts = Math.round(15 * preferenceShare)
    if (preferenceShare === 1) highlights.push(`Matches their ${profile.preference} preference`)
  }

  // Appetite (15): exactly as many dishes as the brief expects beats near.
  let appetitePts = 0
  if (profile.appetiteDishes > 0) {
    const gap = Math.abs(meal.length - profile.appetiteDishes)
    appetitePts = gap === 0 ? 15 : gap === 1 ? 8 : 0
    if (gap === 0) highlights.push('Right number of dishes')
  }

  // Variety (15): how many of the configured courses got filled.
  const varietyPts =
    config.courses.length > 0 ? Math.round((15 * seenSlots.size) / config.courses.length) : 0

  // Diet is a fence, not a preference: one violation costs 35 outright.
  let dietPenalty = 0
  if (profile.diet) {
    const violating = meal.filter((m) => !byId.get(m.itemId)?.tags?.includes(profile.diet!))
    if (violating.length > 0) {
      dietPenalty = 35
      problems.push(`${violating[0]!.name} breaks the ${profile.diet} requirement`)
    }
  }

  if (!withinBudget && totalPaise >= profile.budgetPaise * 2) {
    // already noted above
  } else if (!withinBudget) {
    problems.push("Over the customer's budget")
  }
  if (meal.length === 0) problems.push('No valid dishes picked')

  const rawScore = budgetPts + cravingPts + preferencePts + appetitePts + varietyPts - dietPenalty
  const scorePct = Math.max(0, Math.min(100, rawScore))

  return {
    // A meal the customer cannot afford loses however well it scores
    // otherwise — budget fit is a fence like diet, just graded rather than
    // absolute below the double-budget cliff.
    outcome: scorePct >= winScore && withinBudget ? 'WIN' : 'LOSE',

    scorePct,
    totalPaise,
    budgetPaise: profile.budgetPaise,
    withinBudget,
    problems,
    highlights,
    meal,
  }
}
