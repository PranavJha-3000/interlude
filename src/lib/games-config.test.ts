import { describe, expect, it } from 'vitest'
import {
  parseMysteryCustomerData,
  parseSecretRecipeData,
  type MysteryCustomerData,
  type SecretRecipeData,
} from './games-config'

/**
 * `VenueGame.data` is operator-written JSON reaching the guest surface, so the
 * parsers are the security boundary: every test here is a malformed blob a
 * hand-typed textarea (or a stale client) could plausibly produce.
 */
describe('parseSecretRecipeData', () => {
  it('accepts the canonical stored shape', () => {
    const data: SecretRecipeData = {
      combos: [
        {
          id: 'peri-fries',
          ingredients: ['Chicken', 'Peri Peri', 'Fries'],
          reveals: 'Peri Peri Chicken Fries',
        },
      ],
    }
    expect(parseSecretRecipeData(structuredClone(data))).toEqual(data)
  })

  it('reads null, primitives and empty objects as "not configured"', () => {
    expect(parseSecretRecipeData(null)).toEqual({ combos: [] })
    expect(parseSecretRecipeData('nonsense')).toEqual({ combos: [] })
    expect(parseSecretRecipeData({})).toEqual({ combos: [] })
    expect(parseSecretRecipeData({ combos: 'all' })).toEqual({ combos: [] })
  })

  it('drops malformed combinations instead of crashing', () => {
    const parsed = parseSecretRecipeData({
      combos: [
        null,
        7,
        { id: 'no-ingredients' },
        { id: 'one-is-not-a-combo', ingredients: ['Fries'], reveals: 'Solo Fries' },
        { id: 'bad-ingredient-type', ingredients: ['Fries', 42], reveals: 'Mixed Fries' },
        { id: 'good', ingredients: ['Cheese', 'Fries', 'Sauce'], reveals: 'Loaded Fries' },
      ],
    })
    expect(parsed.combos).toEqual([
      { id: 'good', ingredients: ['Cheese', 'Fries', 'Sauce'], reveals: 'Loaded Fries' },
    ])
  })
})

describe('parseMysteryCustomerData', () => {
  it('accepts the canonical stored shape', () => {
    const data: MysteryCustomerData = {
      budgetOptionsPaise: [15000, 30000, 50000],
      cravings: ['Spicy', 'Comfort'],
      courseOrder: ['main', 'side', 'drink'],
    }
    expect(parseMysteryCustomerData(structuredClone(data))).toEqual(data)
  })

  it('reads absent or malformed blobs as empty configuration', () => {
    expect(parseMysteryCustomerData(undefined)).toEqual({
      budgetOptionsPaise: [],
      cravings: [],
      courseOrder: [],
    })
    expect(parseMysteryCustomerData({ budgetOptionsPaise: ['lots'] })).toEqual({
      budgetOptionsPaise: [],
      cravings: [],
      courseOrder: [],
    })
  })

  it('filters non-positive budgets and empty strings per field', () => {
    expect(
      parseMysteryCustomerData({
        budgetOptionsPaise: [10000, 0, -5, 25000],
        cravings: ['', 'Spicy', 9],
        courseOrder: ['main', null, 'drink'],
      })
    ).toEqual({
      budgetOptionsPaise: [10000, 25000],
      cravings: ['Spicy'],
      courseOrder: ['main', 'drink'],
    })
  })
})
