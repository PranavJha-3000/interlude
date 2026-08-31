import { describe, expect, it } from 'vitest'
import {
  narrationUsesOnlyProvidedFigures,
  parseDescribeItems,
  parseGameCopy,
  parseMenuDraft,
  parseMysteryCustomerCandidates,
  parseNarration,
  parseSecretRecipeCandidates,
} from './parse'

/**
 * The validator layer is the whole §6a promise between "the model said
 * something" and "an operator sees a draft". Malformed responses, invented
 * item ids and narration that carries a figure never provided are all refused
 * here — before they can reach a row of any kind.
 */

const MENU_IDS = new Set(['dish-a', 'dish-b', 'dish-c'])

describe('parseMenuDraft', () => {
  it('carries a printed description and modifiers when present', () => {
    const result = parseMenuDraft({
      items: [
        {
          name: 'Butter Chicken',
          category: 'Mains',
          priceRupees: 520,
          description: 'Silky tomato gravy, charcoal-kissed.',
          modifiers: [
            { name: 'Extra butter', priceDeltaRupees: 40 },
            { name: 'Cheese', priceDeltaRupees: 60 },
          ],
        },
      ],
      warnings: [],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.draft.items[0]?.description).toBe('Silky tomato gravy, charcoal-kissed.')
    expect(result.draft.items[0]?.modifiers).toEqual([
      { name: 'Extra butter', priceDeltaRupees: 40 },
      { name: 'Cheese', priceDeltaRupees: 60 },
    ])
  })

  it('drops modifiers with unreadable prices to warnings, keeping the dish', () => {
    const result = parseMenuDraft({
      items: [
        {
          name: 'Dal Makhani',
          category: 'mains',
          priceRupees: 340,
          modifiers: [
            { name: 'Cheese', priceDeltaRupees: 40 },
            { name: 'Butter', priceDeltaRupees: 'free' },
            { name: '', priceDeltaRupees: 10 },
          ],
        },
      ],
      warnings: [],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.draft.items[0]?.modifiers).toEqual([
      { name: 'Cheese', priceDeltaRupees: 40 },
    ])
    expect(result.draft.warnings.length).toBeGreaterThan(0)
  })
})

describe('parseDescribeItems', () => {
  it('keeps only descriptions for real menu items, dropping the rest to warnings', () => {
    const result = parseDescribeItems(
      {
        items: [
          { itemId: 'dish-a', description: 'The crowd favourite.' },
          { itemId: 'ghost', description: 'A dish that was never on the menu.' },
          { itemId: 'dish-b', description: '' },
        ],
      },
      MENU_IDS
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.drafts).toEqual([{ itemId: 'dish-a', description: 'The crowd favourite.' }])
    expect(result.warnings.length).toBe(2)
  })

  it('refuses outright when nothing survives validation', () => {
    expect(parseDescribeItems({ items: [{ itemId: 'ghost', description: 'Nope' }] }, MENU_IDS).ok).toBe(
      false
    )
  })
})
describe('parseSecretRecipeCandidates', () => {
  it('keeps plausible combos and rejects invented ids', () => {
    const result = parseSecretRecipeCandidates(
      {
        candidates: [
          {
            combinationId: 'combo-1',
            itemIds: ['dish-a', 'dish-b'],
            revealItemId: 'dish-b',
            discoveryName: 'The Butter Chicken Secret',
            revealCopy: 'Ask for the full plate.',
          },
          {
            combinationId: 'combo-2',
            itemIds: ['dish-a', 'ghost'],
            revealItemId: 'dish-a',
            discoveryName: 'Ghost Combo',
            revealCopy: 'Off the menu forever.',
          },
          {
            combinationId: 'combo-3',
            itemIds: ['dish-a'],
            revealItemId: 'dish-a',
            discoveryName: 'Solo',
            revealCopy: 'Not a combination.',
          },
        ],
      },
      MENU_IDS
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]?.combinationId).toBe('combo-1')
    expect(result.warnings.length).toBe(2)
  })

  it('a reveal that is not one of the tapped items is refused', () => {
    const result = parseSecretRecipeCandidates(
      {
        candidates: [
          {
            combinationId: 'combo-x',
            itemIds: ['dish-a', 'dish-b'],
            revealItemId: 'dish-c',
            discoveryName: 'Cross Reveal',
            revealCopy: 'Points at a third dish.',
          },
        ],
      },
      MENU_IDS
    )
    expect(result.ok).toBe(false)
  })

  it('duplicate ingredient sets are refused, regardless of order', () => {
    const result = parseSecretRecipeCandidates(
      {
        candidates: [
          {
            combinationId: 'c1',
            itemIds: ['dish-a', 'dish-b'],
            revealItemId: 'dish-b',
            discoveryName: 'One',
            revealCopy: 'First.',
          },
          {
            combinationId: 'c2',
            itemIds: ['dish-b', 'dish-a'],
            revealItemId: 'dish-a',
            discoveryName: 'Two',
            revealCopy: 'Same set, swapped order.',
          },
        ],
      },
      MENU_IDS
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candidates).toHaveLength(1)
  })
})

describe('parseMysteryCustomerCandidates', () => {
  it('keeps whole-paise budgets and drops floats', () => {
    const result = parseMysteryCustomerCandidates({
      candidates: [
        {
          profileId: 'p1',
          budgetPaise: 40000,
          cravings: ['spicy'],
          preferences: [],
          appetiteDishes: 2,
          scenarioCopy: 'A fire-eater on a normal salary.',
        },
        {
          profileId: 'p2',
          budgetPaise: 39999.5,
          cravings: ['sweet'],
          preferences: [],
          appetiteDishes: 2,
          scenarioCopy: 'Half a paise over budget.',
        },
      ],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]?.budgetPaise).toBe(40000)
  })

  it('refuses a persona with no craving', () => {
    const result = parseMysteryCustomerCandidates({
      candidates: [
        {
          profileId: 'p3',
          budgetPaise: 50000,
          cravings: [],
          preferences: [],
          appetiteDishes: 2,
          scenarioCopy: 'No craving at all.',
        },
      ],
    })
    expect(result.ok).toBe(false)
  })
})

describe('parseGameCopy', () => {
  it('normalises and bounds each line', () => {
    const result = parseGameCopy({
      introCopy: '  Find the secret recipe.  ',
      promptCopy: 'Tap the dishes that belong together.',
      discoveryCopy: 'You found it!',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.draft.introCopy).toBe('Find the secret recipe.')
  })

  it('refuses copy with a missing line', () => {
    expect(parseGameCopy({ introCopy: 'Only intro', promptCopy: '', discoveryCopy: 'x' }).ok).toBe(
      false
    )
  })
})

describe('parseNarration', () => {
  const figures = ['₹2,340', '₹860']
  const counts = ['2', '1', '12', '30']

  it('accepts narration that repeats only provided figures and counts', () => {
    const result = parseNarration(
      {
        sentences: [
          'The Pilot Kitchen ran 2 live services and 1 control night this week.',
          'Net contribution was ₹2,340, with ₹860 spent on prizes and 12 of 30 tables playing.',
        ],
      },
      figures,
      counts
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sentences).toHaveLength(2)
  })

  it('refuses a figure the server never provided — the §6a line', () => {
    const result = parseNarration(
      {
        sentences: ['The Pilot Kitchen earned ₹2,340 last week — up ₹500 from the week before.'],
      },
      figures,
      counts
    )
    expect(result.ok).toBe(false)
  })

  it('refuses a count that was not provided', () => {
    const result = parseNarration({ sentences: ['18 of 30 tables played last week.'] }, figures, counts)
    expect(result.ok).toBe(false)
  })

  it('refuses more than three sentences', () => {
    const result = parseNarration({ sentences: ['One.', 'Two.', 'Three.', 'Four.'] }, figures, counts)
    expect(result.ok).toBe(false)
  })

  it('narrationUsesOnlyProvidedFigures exposes the raw check', () => {
    expect(narrationUsesOnlyProvidedFigures(['Net was ₹2,340.'], ['₹2,340'], [])).toBe(true)
    expect(narrationUsesOnlyProvidedFigures(['Net was ₹2,400.'], ['₹2,340'], [])).toBe(false)
  })
})