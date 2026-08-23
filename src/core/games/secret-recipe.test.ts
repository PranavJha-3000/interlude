import { describe, expect, it } from 'vitest'
import {
  discoveryProgress,
  evaluateSelection,
  undiscoveredCombinations,
  validateSecretRecipeConfig,
  visibleIngredients,
  type SecretRecipeConfig,
} from './secret-recipe'

const config: SecretRecipeConfig = {
  ingredients: [
    { id: 'chicken', label: 'Chicken', emoji: '🍗' },
    { id: 'peri', label: 'Peri Peri' },
    { id: 'fries', label: 'Fries' },
    { id: 'cheese', label: 'Cheese' },
    { id: 'sauce', label: 'Sauce' },
  ],
  combinations: [
    {
      id: 'ppcf',
      ingredientIds: ['chicken', 'peri', 'fries'],
      resultName: 'Peri Peri Chicken Fries',
    },
    {
      id: 'loaded',
      ingredientIds: ['cheese', 'fries', 'sauce'],
      resultName: 'Loaded Fries',
      blurb: 'The 11pm order, apparently',
    },
  ],
}

describe('Secret Recipe — evaluating a selection', () => {
  it('discovers a valid combination', () => {
    const result = evaluateSelection(config, ['chicken', 'peri', 'fries'])
    expect(result.kind).toBe('DISCOVERED')
    if (result.kind === 'DISCOVERED') {
      expect(result.combination.resultName).toBe('Peri Peri Chicken Fries')
    }
  })

  it('ignores tap order and duplicate taps — sets, not sequences', () => {
    const shuffled = evaluateSelection(config, ['fries', 'chicken', 'peri'])
    const duplicated = evaluateSelection(config, ['fries', 'fries', 'chicken', 'peri', 'peri'])
    expect(shuffled.kind).toBe('DISCOVERED')
    expect(duplicated.kind).toBe('DISCOVERED')
  })

  it('rejects an unrelated selection as invalid, with no hint', () => {
    const result = evaluateSelection(config, ['chicken', 'cheese'])
    expect(result).toMatchObject({ kind: 'INVALID', warmCombinationId: null })
  })

  it('nudges towards a near-miss deterministically', () => {
    // chicken + fries + sauce shares fries+sauce with `loaded` — warmer.
    const result = evaluateSelection(config, ['chicken', 'fries', 'sauce'])
    expect(result).toMatchObject({ kind: 'INVALID', warmCombinationId: 'loaded' })
    // Same input, same warmth — twice.
    expect(evaluateSelection(config, ['chicken', 'fries', 'sauce'])).toEqual(result)
  })

  it('calls an empty hand incomplete instead of wrong', () => {
    expect(evaluateSelection(config, []).kind).toBe('INCOMPLETE')
  })
})

describe('Secret Recipe — progressive exposure', () => {
  it('starts with a short shelf and grows per discovery', () => {
    expect(visibleIngredients(config, [])).toHaveLength(4)
    expect(visibleIngredients(config, ['ppcf'])).toHaveLength(5) // capped at stock
    expect(visibleIngredients(config, ['ppcf', 'not-a-combo']).length).toBe(5)
  })

  it('respects configured exposure rates', () => {
    const tight: SecretRecipeConfig = { ...config, initialVisible: 2, revealPerDiscovery: 1 }
    expect(visibleIngredients(tight, [])).toHaveLength(2)
    expect(visibleIngredients(tight, ['loaded'])).toHaveLength(3)
  })

  it('tracks what remains and the overall progress', () => {
    expect(undiscoveredCombinations(config, ['ppcf']).map((c) => c.id)).toEqual(['loaded'])
    expect(discoveryProgress(config, ['ppcf'])).toEqual({ discovered: 1, total: 2 })
    // Unknown ids never inflate the count.
    expect(discoveryProgress(config, ['ppcf', 'ghost'])).toEqual({ discovered: 1, total: 2 })
  })
})

describe('Secret Recipe — configuration validation', () => {
  it('accepts a sound config', () => {
    expect(validateSecretRecipeConfig(config)).toEqual([])
  })

  it('flags unknown ingredients, duplicates and degenerate combos', () => {
    const problems = validateSecretRecipeConfig({
      ingredients: [
        { id: 'a', label: 'A' },
        { id: 'a', label: 'A again' },
      ],
      combinations: [
        { id: 'x', ingredientIds: ['a'], resultName: 'Solo' },
        { id: 'y', ingredientIds: ['a', 'ghost'], resultName: 'Ghost' },
        { id: 'z', ingredientIds: ['a', 'ghost'], resultName: 'Ghost again' },
        { id: 'w', ingredientIds: [], resultName: '' },
      ],
    })
    expect(problems).toHaveLength(7)
    expect(problems.some((p) => p.includes("'a'" as string))).toBe(true)
    expect(problems.some((p) => p.includes("'ghost'"))).toBe(true)
    expect(problems.some((p) => p.startsWith('Two combinations'))).toBe(true)
    expect(problems.some((p) => p.includes('needs at least two'))).toBe(true)
  })

  it('refuses to run on empty shelves', () => {
    expect(validateSecretRecipeConfig({ ingredients: [], combinations: [] })).toHaveLength(2)
  })
})
