import { describe, expect, it, vi } from 'vitest'
import type { AiAdapter } from '@/lib/ai/types'
import { parseMenuDraft } from '@/lib/ai/parse'
import { classifyExtractFailure, confirmDraft, draftCategories, fileToDraft, marginTierFor } from './menu-import'

/**
 * A fixture standing in for what the model returns for a real menu photo:
 * ten printed items, one unreadable. The parser has to carry ≥90% of the
 * readable ones through with the right price — TODO.md build 1's bar.
 */
const MODEL_RESPONSE = {
  items: [
    { name: 'Paneer Tikka (Half)', category: 'Starters', priceRupees: 220 },
    { name: 'Paneer Tikka (Full)', category: 'Starters', priceRupees: 380 },
    { name: 'Chilli Prawns', category: 'Starters', priceRupees: 480 },
    { name: 'Butter Chicken', category: 'Mains', priceRupees: 520 },
    { name: 'Dal Makhani', category: 'Mains', priceRupees: 340 },
    { name: 'Hyderabadi Biryani', category: 'Mains', priceRupees: 449.5 },
    { name: 'Garlic Naan', category: 'Breads', priceRupees: 90 },
    { name: 'Tiramisu', category: 'Desserts', priceRupees: 299 },
    { name: 'Gulab Jamun', category: 'Desserts', priceRupees: 149 },
    { name: 'Masala Chai', category: 'Beverages', priceRupees: 60 },
  ],
  warnings: ['One item at the bottom of the page was cut off and not transcribed.'],
}

describe('parseMenuDraft', () => {
  it('extracts ≥90% of the fixture menu with the right prices', () => {
    const result = parseMenuDraft(MODEL_RESPONSE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.draft.items.length).toBeGreaterThanOrEqual(9)
    const biryani = result.draft.items.find((i) => i.name === 'Hyderabadi Biryani')
    expect(biryani?.priceRupees).toBe(449.5)
    // Categories normalise to lowercase so per-category cost inputs join up.
    expect(result.draft.items.every((i) => i.category === i.category.toLowerCase())).toBe(true)
  })

  it('drops hallucination shapes to warnings instead of showing them as fact', () => {
    const result = parseMenuDraft({
      items: [
        { name: 'Real Dish', category: 'mains', priceRupees: 300 },
        { name: '', category: 'mains', priceRupees: 100 },
        { name: 'Free Dish', category: 'mains', priceRupees: 0 },
        { name: 'Absurd Dish', category: 'mains', priceRupees: 4_000_000 },
      ],
      warnings: [],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.draft.items).toHaveLength(1)
    expect(result.draft.warnings).toHaveLength(3)
  })

  it('refuses garbage outright rather than producing an empty grid', () => {
    expect(parseMenuDraft('not even an object').ok).toBe(false)
    expect(parseMenuDraft({ items: [] }).ok).toBe(false)
    expect(parseMenuDraft(null).ok).toBe(false)
  })
})

describe('fileToDraft', () => {
  const spyAdapter = (): AiAdapter & { extractMenu: ReturnType<typeof vi.fn> } => ({
    name: 'mock',
    extractMenu: vi.fn(async () => ({ ok: true as const, draft: { items: [], warnings: [] } })),
    // The draft-generation capabilities are out of scope here — fileToDraft
    // only ever calls extractMenu. Stubs keep the spy honest about that.
    describeItems: vi.fn(async () => ({ ok: false as const, reason: 'not under test' })),
    generateSecretRecipes: vi.fn(async () => ({ ok: false as const, reason: 'not under test' })),
    generateMysteryCustomers: vi.fn(async () => ({ ok: false as const, reason: 'not under test' })),
    generateGameCopy: vi.fn(async () => ({ ok: false as const, reason: 'not under test' })),
    narrateReport: vi.fn(async () => ({ ok: false as const, reason: 'not under test' })),
  })

  it('CSV never touches the adapter — zero AI calls, asserted', async () => {
    const adapter = spyAdapter()
    const result = await fileToDraft(
      { mediaType: 'text/csv', fileName: 'menu.csv', bytes: Buffer.from('name,price\nDal,340\n') },
      adapter
    )
    expect(result.ok).toBe(true)
    expect(adapter.extractMenu).not.toHaveBeenCalled()
  })

  it('CSV works with no adapter at all', async () => {
    const result = await fileToDraft(
      { mediaType: 'text/csv', fileName: 'menu.csv', bytes: Buffer.from('name,price\nDal,340\n') },
      null
    )
    expect(result.ok).toBe(true)
  })

  it('a photo goes to the adapter', async () => {
    const adapter = spyAdapter()
    await fileToDraft(
      { mediaType: 'image/jpeg', fileName: 'menu.jpg', bytes: Buffer.from('fake') },
      adapter
    )
    expect(adapter.extractMenu).toHaveBeenCalledOnce()
    expect(adapter.extractMenu.mock.calls[0]![0].mediaType).toBe('image/jpeg')
  })

  it('a photo with no adapter degrades to a legible refusal, not a crash', async () => {
    const result = await fileToDraft(
      { mediaType: 'image/jpeg', fileName: 'menu.jpg', bytes: Buffer.from('fake') },
      null
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('CSV')
  })

  it('an unsupported type is refused before any model call', async () => {
    const adapter = spyAdapter()
    const result = await fileToDraft(
      { mediaType: 'application/zip', fileName: 'menu.zip', bytes: Buffer.from('fake') },
      adapter
    )
    expect(result.ok).toBe(false)
    expect(adapter.extractMenu).not.toHaveBeenCalled()
  })

  // PDF media-type normalisations. Real-world browsers and OSes label the
  // same file a few different ways; the server should not refuse a real
  // menu because the OS chose a synonym.
  it('a PDF with media type application/x-pdf still goes to the adapter', async () => {
    const adapter = spyAdapter()
    await fileToDraft(
      { mediaType: 'application/x-pdf', fileName: 'menu.pdf', bytes: Buffer.from('%PDF-1.4\n') },
      adapter
    )
    expect(adapter.extractMenu).toHaveBeenCalledOnce()
  })

  it('a PDF sent without a media type but a .pdf filename still goes to the adapter', async () => {
    const adapter = spyAdapter()
    await fileToDraft(
      { mediaType: '', fileName: 'menu.pdf', bytes: Buffer.from('%PDF-1.4\n') },
      adapter
    )
    expect(adapter.extractMenu).toHaveBeenCalledOnce()
  })
})

describe('confirmDraft', () => {
  const rows = [
    { include: true, name: 'Biryani', category: 'mains', priceRupees: 249.5 },
    { include: true, name: 'Tiramisu', category: 'desserts', priceRupees: 299 },
    { include: false, name: 'Skipped', category: 'mains', priceRupees: 100 },
  ]

  it('₹249.50 stores as 24950 — a rounding bug here is money', () => {
    const result = confirmDraft(rows, { mains: 40, desserts: 30 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const biryani = result.items.find((i) => i.name === 'Biryani')!
    expect(biryani.pricePaise).toBe(24950)
    expect(biryani.foodCostPaise).toBe(9980) // 40% of 24950
  })

  it('computes cost from the per-category percentage, never from the model', () => {
    const result = confirmDraft(rows, { mains: 40, desserts: 30 })
    if (!result.ok) throw new Error('expected ok')
    const tiramisu = result.items.find((i) => i.name === 'Tiramisu')!
    expect(tiramisu.foodCostPaise).toBe(8970) // 30% of 29900
    expect(tiramisu.marginTier).toBe('HIGH') // exactly 70% margin sits on the HIGH boundary
  })

  it('derives margin tier from the numbers', () => {
    expect(marginTierFor(10000, 2000)).toBe('HIGH')
    expect(marginTierFor(10000, 5000)).toBe('MID')
    expect(marginTierFor(10000, 8000)).toBe('LOW')
  })

  it('excluded rows are not written', () => {
    const result = confirmDraft(rows, { mains: 40, desserts: 30 })
    if (!result.ok) throw new Error('expected ok')
    expect(result.items.find((i) => i.name === 'Skipped')).toBeUndefined()
  })

  it('refuses to confirm without a cost percentage for every category present', () => {
    const result = confirmDraft(rows, { mains: 40 })
    expect(result).toEqual({ ok: false, reason: 'MISSING_COST_PCT', category: 'desserts' })
  })

  it('refuses an empty selection', () => {
    const result = confirmDraft(
      rows.map((r) => ({ ...r, include: false })),
      { mains: 40, desserts: 30 }
    )
    expect(result).toEqual({ ok: false, reason: 'NOTHING_SELECTED' })
  })

  it('lists each category once for the cost inputs', () => {
    expect(
      draftCategories({
        items: [
          { name: 'A', category: 'Mains', priceRupees: 1 },
          { name: 'B', category: 'mains', priceRupees: 1 },
          { name: 'C', category: 'desserts', priceRupees: 1 },
        ],
        warnings: [],
      })
    ).toEqual(['mains', 'desserts'])
  })
})

/**
 * Locks the menu-upload error surface to the keys the action layer maps from.
 *
 * The classifier is the seam between the AI adapter's free-form prose and the
 * stable reason codes the pages render. A change to either side without the
 * other shows up here as a row that falls through to `UNKNOWN` and lands the
 * operator on the generic "could not be read" message — the very thing the
 * specific keys were written to avoid.
 */
describe('classifyExtractFailure', () => {
  it('maps CSV parser failures', () => {
    expect(classifyExtractFailure('The CSV needs a header row with at least "name" and "price" columns.')).toBe('CSV_NO_HEADER')
    expect(classifyExtractFailure('No menu rows could be read from this CSV.')).toBe('CSV_NO_ROWS')
  })

  it('maps unsupported media types', () => {
    expect(classifyExtractFailure('Upload a photo, a PDF, or a CSV.')).toBe('UNSUPPORTED_TYPE')
  })

  it('maps the no-adapter case', () => {
    expect(
      classifyExtractFailure('Photo and PDF reading is not available right now — use a CSV or type items in.')
    ).toBe('AI_UNAVAILABLE')
  })

  it('maps Gemini auth/quota/error tokens', () => {
    expect(classifyExtractFailure('GEMINI_AUTH The menu reader rejected the API key (HTTP 401/403).')).toBe('AI_AUTH')
    expect(classifyExtractFailure('GEMINI_QUOTA The menu reader is rate-limited right now (HTTP 429).')).toBe('AI_QUOTA')
    expect(classifyExtractFailure('GEMINI_ERROR The menu reader returned an error (HTTP 500).')).toBe('AI_INVALID')
  })

  it('maps the legacy AI error strings the older adapter emitted', () => {
    expect(classifyExtractFailure('The menu reader declined this file.')).toBe('AI_DECLINED')
    expect(classifyExtractFailure('The menu reader could not be reached.')).toBe('AI_UNREACHABLE')
    expect(classifyExtractFailure('The menu reader returned something unreadable.')).toBe('AI_INVALID')
    expect(classifyExtractFailure('No menu items could be read from this file.')).toBe('NO_ITEMS')
  })

  it('falls through to UNKNOWN for messages no rule catches', () => {
    expect(classifyExtractFailure('Something nobody has ever seen before.')).toBe('UNKNOWN')
  })
})
