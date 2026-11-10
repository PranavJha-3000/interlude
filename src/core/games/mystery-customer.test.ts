import { describe, expect, it } from 'vitest'

import {
  generateMysteryProfile,
  menuForCourse,
  scoreMeal,
  validateMysteryCustomerConfig,
  type MealPick,
  type MysteryCustomerConfig,
  type MysteryCustomerMenuItem,
  type MysteryProfile,
} from './mystery-customer'

/**
 * Two budgets so a deal has something to choose between; every other kind has
 * one option so most draws stay stable and assertions stay legible.
 */
const config: MysteryCustomerConfig = {
  options: [
    { id: 'b-lo', kind: 'BUDGET', label: 'Budget ₹200', budgetPaise: 20_000 },
    { id: 'b-hi', kind: 'BUDGET', label: 'Budget ₹500', budgetPaise: 50_000 },
    { id: 'c-spicy', kind: 'CRAVING', label: 'Craves spice', value: 'spicy' },
    { id: 'p-veg', kind: 'PREFERENCE', label: 'Prefers veg', value: 'veg' },
    { id: 'a-two', kind: 'APPETITE', label: 'Two dishes', dishCount: 2 },
    { id: 'd-veg', kind: 'DIET', label: 'Vegetarian', value: 'veg' },
  ],
  courses: [
    { slot: 'main', label: 'Main', categories: ['mains'] },
    { slot: 'side', label: 'Side', categories: ['starters', 'breads'] },
  ],
}

const menu: MysteryCustomerMenuItem[] = [
  {
    id: 'curry',
    name: 'Spicy Curry',
    category: 'mains',
    pricePaise: 25_000,
    tags: ['spicy', 'veg'],
    available: true,
  },
  {
    id: 'paneer',
    name: 'Paneer Tikka',
    category: 'starters',
    pricePaise: 15_000,
    tags: ['spicy', 'veg'],
    available: true,
  },
  {
    id: 'naan',
    name: 'Butter Naan',
    category: 'breads',
    pricePaise: 5_000,
    tags: ['veg'],
    available: true,
  },
  {
    id: 'chicken',
    name: 'Chicken 65',
    category: 'mains',
    pricePaise: 30_000,
    tags: ['spicy'],
    available: true,
  },
  {
    id: 'off',
    name: 'Sold Out Pie',
    category: 'desserts',
    pricePaise: 9_000,
    tags: [],
    available: false,
  },
]

/** A brief that a perfect spicy-veg two-dish meal scores 100 against. */
const perfectBrief: MysteryProfile = {
  seed: 'fixed',
  budgetPaise: 45_000,
  craving: 'spicy',
  preference: 'veg',
  diet: null,
  appetiteDishes: 2,
  choices: [],
}

const perfectPicks: MealPick[] = [
  { slot: 'main', itemId: 'curry' },
  { slot: 'side', itemId: 'paneer' },
]

describe('generateMysteryProfile', () => {
  it('is deterministic per seed and fills every kind with options', () => {
    const a = generateMysteryProfile(config, 'run-7')
    const b = generateMysteryProfile(config, 'run-7')
    expect(b).toEqual(a)
    expect(a.choices.map((c) => c.kind)).toEqual([
      'BUDGET',
      'CRAVING',
      'PREFERENCE',
      'APPETITE',
      'DIET',
    ])
    expect([20_000, 50_000]).toContain(a.budgetPaise)
    expect(a.craving).toBe('spicy')
  })

  it('different seeds may deal different budgets but never invent options', () => {
    const seeds = Array.from({ length: 12 }, (_, i) => `seed-${i}`)
    const budgets = new Set(seeds.map((s) => generateMysteryProfile(config, s).budgetPaise))
    for (const v of budgets) expect([20_000, 50_000]).toContain(v)
  })
})

describe('validateMysteryCustomerConfig', () => {
  it('accepts the fixture outright', () => {
    expect(validateMysteryCustomerConfig(config)).toEqual([])
  })

  it('names every structural problem', () => {
    const problems = validateMysteryCustomerConfig({
      options: [
        { id: 'x', kind: 'BUDGET', label: 'Zero', budgetPaise: 0 },
        { id: 'x', kind: 'CRAVING', label: 'No value' },
        { id: 'y', kind: 'APPETITE', label: 'Zero dishes', dishCount: 0 },
      ],
      courses: [{ slot: 'main', label: 'Main', categories: [] }],
    })
    expect(problems).toContain("Duplicate option id 'x'")
    expect(problems).toContain("Budget option 'x' needs a positive budgetPaise")
    expect(problems).toContain("Craving option 'x' needs a value to match menu tags")
    expect(problems).toContain("Appetite option 'y' needs a dishCount of at least 1")
    expect(problems).toContain("Course 'main' lists no eligible categories")
    expect(problems).toHaveLength(5)
  })

  it('names what a completely empty config lacks', () => {
    const problems = validateMysteryCustomerConfig({ options: [], courses: [] })
    expect(problems).toContain('Needs at least one BUDGET option')
    expect(problems).toContain('Needs at least one CRAVING option')
    expect(problems).toContain('Needs at least one course')
  })

  it('rejects an out-of-range winScore', () => {
    expect(validateMysteryCustomerConfig({ ...config, winScore: 101 })).toContain(
      'winScore must sit between 1 and 100'
    )
  })
})

describe('scoreMeal', () => {
  it('scores a perfect brief-fitting meal 100 and wins', () => {
    const result = scoreMeal(config, perfectBrief, menu, perfectPicks)
    expect(result.scorePct).toBe(100)
    expect(result.outcome).toBe('WIN')
    expect(result.totalPaise).toBe(40_000)
    expect(result.withinBudget).toBe(true)
    expect(result.problems).toEqual([])
    expect(result.highlights).toContain('Every dish hits the spicy craving')
  })

  it('is deterministic — same picks, same brief, same verdict', () => {
    const a = scoreMeal(config, perfectBrief, menu, perfectPicks)
    const b = scoreMeal(config, perfectBrief, menu, perfectPicks)
    expect(b).toEqual(a)
  })

  it('a meal the customer cannot afford loses even when the score is high', () => {
    const tightBrief: MysteryProfile = { ...perfectBrief, budgetPaise: 30_000 }
    const result = scoreMeal(config, tightBrief, menu, perfectPicks)
    expect(result.withinBudget).toBe(false)
    expect(result.scorePct).toBeGreaterThanOrEqual(70)
    expect(result.outcome).toBe('LOSE')
    // The same picks against an affordable budget win — the fence is the
    // money, not the dishes.
    const affordable = scoreMeal(config, perfectBrief, menu, perfectPicks)
    expect(affordable.outcome).toBe('WIN')
  })

  it('a diet violation is a fence, not a preference', () => {
    const vegBrief: MysteryProfile = { ...perfectBrief, diet: 'veg' }
    const result = scoreMeal(config, vegBrief, menu, [
      { slot: 'main', itemId: 'chicken' },
      { slot: 'side', itemId: 'paneer' },
    ])
    expect(result.outcome).toBe('LOSE')
    expect(result.problems.some((p) => p.includes('breaks the veg requirement'))).toBe(true)
  })

  it('reports unknown slots, off-menu items and category mismatches', () => {
    const result = scoreMeal(config, perfectBrief, menu, [
      { slot: 'dessert', itemId: 'curry' },
      { slot: 'side', itemId: 'off' },
      { slot: 'main', itemId: 'naan' },
      { slot: 'side', itemId: 'curry' },
    ])
    expect(result.problems).toContain("Unknown course 'dessert'")
    expect(result.problems).toContain('One pick is no longer on the menu')
    expect(result.problems).toContain('Butter Naan does not fit the main course')
    // Curry's first pick died on the unknown slot, so its second pick is a
    // category mismatch, not a repeat.
    expect(result.problems).toContain('Spicy Curry does not fit the side course')
    expect(result.meal).toHaveLength(0)
    expect(result.outcome).toBe('LOSE')
  })

  it('rejects the same dish picked twice while keeping its first seat', () => {
    const result = scoreMeal(config, perfectBrief, menu, [
      { slot: 'main', itemId: 'curry' },
      { slot: 'main', itemId: 'curry' },
    ])
    expect(result.problems).toContain('The same dish appears twice — Spicy Curry')
    expect(result.meal.map((m) => m.itemId)).toEqual(['curry'])
  })

  it('an empty hand loses with one honest problem', () => {
    const result = scoreMeal(config, perfectBrief, menu, [])
    expect(result.outcome).toBe('LOSE')
    expect(result.problems).toContain('No valid dishes picked')
    expect(result.scorePct).toBe(0)
  })

  it('matches a craving by item name when no tags exist', () => {
    // A no-tags menu where the craving is a dish name substring.
    const noTagsMenu: MysteryCustomerMenuItem[] = [
      {
        id: 'biryani',
        name: 'Hyderabadi Biryani',
        category: 'mains',
        pricePaise: 25_000,
        tags: [],
        available: true,
      },
    ]
    const biryaniBrief: MysteryProfile = {
      ...perfectBrief,
      craving: 'biryani',
      preference: null,
      appetiteDishes: 1,
    }
    const result = scoreMeal(
      { ...config, courses: [{ slot: 'main', label: 'Main', categories: ['mains'] }] },
      biryaniBrief,
      noTagsMenu,
      [{ slot: 'main', itemId: 'biryani' }]
    )
    expect(result.scorePct).toBeGreaterThan(30)
    expect(result.highlights.some((h) => h.includes('biryani'))).toBe(true)
  })

  it('matches a preference by category when no tags exist', () => {
    // A no-tags menu where the preference is a category name.
    const noTagsMenu: MysteryCustomerMenuItem[] = [
      {
        id: 'lassi',
        name: 'Sweet Lassi',
        category: 'drinks',
        pricePaise: 5_000,
        tags: [],
        available: true,
      },
    ]
    const drinksBrief: MysteryProfile = {
      ...perfectBrief,
      craving: null,
      preference: 'drinks',
      appetiteDishes: 1,
    }
    const result = scoreMeal(
      { ...config, courses: [{ slot: 'side', label: 'Side', categories: ['drinks'] }] },
      drinksBrief,
      noTagsMenu,
      [{ slot: 'side', itemId: 'lassi' }]
    )
    expect(result.scorePct).toBeGreaterThan(15)
    expect(result.highlights.some((h) => h.includes('drinks'))).toBe(true)
  })

  it('passes a diet check by name when tags are absent', () => {
    // A diet requirement that matches a dish name → that dish passes the fence.
    const noTagsMenu: MysteryCustomerMenuItem[] = [
      {
        id: 'dal',
        name: 'Dal Tadka',
        category: 'mains',
        pricePaise: 20_000,
        tags: [],
        available: true,
      },
    ]
    const dalBrief: MysteryProfile = { ...perfectBrief, diet: 'dal', appetiteDishes: 1 }
    const result = scoreMeal(
      { ...config, courses: [{ slot: 'main', label: 'Main', categories: ['mains'] }] },
      dalBrief,
      noTagsMenu,
      [{ slot: 'main', itemId: 'dal' }]
    )
    expect(result.problems.some((p) => p.includes('breaks the dal requirement'))).toBe(false)
  })

  it('passes a diet check by name when tags are absent', () => {
    // A diet requirement that matches a dish name → that dish passes the fence.
    const noTagsMenu: MysteryCustomerMenuItem[] = [
      {
        id: 'dal',
        name: 'Dal Tadka',
        category: 'mains',
        pricePaise: 20_000,
        tags: [],
        available: true,
      },
    ]
    const dalBrief: MysteryProfile = { ...perfectBrief, diet: 'dal', appetiteDishes: 1 }
    const result = scoreMeal(
      { ...config, courses: [{ slot: 'main', label: 'Main', categories: ['mains'] }] },
      dalBrief,
      noTagsMenu,
      [{ slot: 'main', itemId: 'dal' }]
    )
    expect(result.problems.some((p) => p.includes('breaks the dal requirement'))).toBe(false)
  })
})

describe('menuForCourse', () => {
  it('filters by category and availability', () => {
    expect(menuForCourse(config, menu, 'side').map((m) => m.id)).toEqual(['paneer', 'naan'])
    expect(menuForCourse(config, menu, 'nope')).toEqual([])
  })
})
