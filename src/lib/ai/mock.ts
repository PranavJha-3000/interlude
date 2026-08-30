import type { AiAdapter, ExtractResult } from './types'

/**
 * The Mock adapter — dev and tests run with no API key and no network,
 * exactly like `email.ts`'s console transport.
 *
 * Deterministic: the same upload always produces the same draft. The fixture
 * is a plausible small menu so the draft grid, the per-category cost step and
 * the confirm path are all exercised for real.
 */

const FIXTURE: ExtractResult = {
  ok: true,
  draft: {
    items: [
      { name: 'Paneer Tikka', category: 'starters', priceRupees: 320 },
      { name: 'Chilli Garlic Prawns', category: 'starters', priceRupees: 480 },
      { name: 'Butter Chicken', category: 'mains', priceRupees: 520 },
      { name: 'Dal Makhani', category: 'mains', priceRupees: 340 },
      { name: 'Hyderabadi Biryani', category: 'mains', priceRupees: 449.5 },
      { name: 'Garlic Naan', category: 'breads', priceRupees: 90 },
      { name: 'Tiramisu', category: 'desserts', priceRupees: 299 },
      { name: 'Masala Chai', category: 'beverages', priceRupees: 60 },
    ],
    warnings: ['This is the mock extractor — set GEMINI_API_KEY to read a real menu.'],
  },
}

export const mockAdapter: AiAdapter = {
  name: 'mock',
  async extractMenu(): Promise<ExtractResult> {
    return FIXTURE
  },
}
