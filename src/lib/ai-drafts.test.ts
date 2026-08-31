import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiAdapter } from '@/lib/ai/types'

/**
 * The AI draft lifecycle (PLATFORM.md §6a): a draft is a row with status DRAFT
 * that reaches production data only through an explicit operator approve. The
 * database is stubbed because what matters here is the decisions — what is
 * written when, whose data can be touched, and what a refusal leaves behind.
 */

// A minimal in-memory store for the two rows the lifecycle touches.
const store = {
  drafts: [] as Array<Record<string, unknown>>,
  menuItems: [] as Array<Record<string, unknown>>,
  venueGames: [] as Array<Record<string, unknown>>,
}

function resetStore() {
  store.drafts = []
  store.menuItems = []
  store.venueGames = []
}

const adapter: AiAdapter = {
  name: 'mock',
  extractMenu: vi.fn(async () => ({ ok: false as const, reason: 'not under test' })),
  describeItems: vi.fn(async (menu) => ({
    ok: true as const,
    drafts: menu.map((m) => ({ itemId: m.id, description: `${m.name} — the line.` })),
    warnings: [],
  })),
  generateSecretRecipes: vi.fn(async () => ({
    ok: true as const,
    candidates: [
      {
        combinationId: 'combo-1',
        itemIds: ['item-a', 'item-b'],
        revealItemId: 'item-b',
        discoveryName: 'The Combo',
        revealCopy: 'Try it next visit.',
      },
    ],
    warnings: [],
  })),
  generateMysteryCustomers: vi.fn(async () => ({
    ok: true as const,
    candidates: [
      {
        profileId: 'persona-1',
        budgetPaise: 30000,
        cravings: ['spicy'],
        preferences: [],
        appetiteDishes: 2,
        scenarioCopy: 'A spice-hunter.',
      },
    ],
    warnings: [],
  })),
  generateGameCopy: vi.fn(async () => ({
    ok: true as const,
    draft: {
      introCopy: 'Intro.',
      promptCopy: 'Prompt.',
      discoveryCopy: 'Discovery.',
    },
  })),
  narrateReport: vi.fn(async () => ({
    ok: true as const,
    sentences: ['One.', 'Two.', 'Three.'],
  })),
}

const dbStub = {
  menuItem: {
    findMany: vi.fn(async () => [
      { id: 'item-a', name: 'Paneer', category: 'starters', pricePaise: 32000 },
      { id: 'item-b', name: 'Butter Chicken', category: 'mains', pricePaise: 52000 },
    ]),
    updateMany: vi.fn(async (args: { where: { id: string; venueId: string }; data: object }) => {
      const hits = store.menuItems.filter(
        (m) => m.id === args.where.id && m.venueId === args.where.venueId
      )
      for (const row of hits) Object.assign(row, args.data)
      return { count: hits.length }
    }),
  },
  aiContentDraft: {
    deleteMany: vi.fn(async () => ({ count: 0 })),
    createMany: vi.fn(async (args: { data: Array<Record<string, unknown>> }) => {
      for (const d of args.data) {
        store.drafts.push({ id: `draft-${store.drafts.length}`, status: 'DRAFT', ...d })
      }
      return { count: args.data.length }
    }),
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      const row = { id: `draft-${store.drafts.length}`, status: 'DRAFT', ...args.data }
      store.drafts.push(row)
      return row
    }),
    findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
      return (
        store.drafts.find((d) =>
          Object.entries(args.where).every(([k, v]) => d[k] === v)
        ) ?? null
      )
    }),
    findMany: vi.fn(async () => store.drafts),
    update: vi.fn(async (args: { where: { id: string }; data: object }) => {
      const row = store.drafts.find((d) => d.id === args.where.id)
      if (row) Object.assign(row, args.data)
      return row
    }),
    updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: object }) => {
      const hits = store.drafts.filter((d) =>
        Object.entries(args.where).every(([k, v]) => d[k] === v)
      )
      for (const row of hits) Object.assign(row, args.data)
      return { count: hits.length }
    }),
  },
  venueGame: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      store.venueGames.push({ id: `game-${store.venueGames.length}`, ...args.data })
      return store.venueGames[store.venueGames.length - 1]!
    }),
    update: vi.fn(async (args: { where: { id: string }; data: object }) => {
      const row = store.venueGames.find((g) => g.id === args.where.id)
      if (row) Object.assign(row, args.data)
      return row
    }),
  },
  venue: {
    findUnique: vi.fn(async () => ({ name: 'The Pilot Kitchen' })),
  },
}

vi.mock('@/lib/db', () => ({ db: dbStub }))
vi.mock('@/lib/ai', () => ({ getAiAdapter: () => adapter }))

const {
  approveAiDraft,
  editAiDraft,
  generateItemDescriptionDrafts,
  generateSecretRecipeDrafts,
  rejectAiDraft,
} = await import('@/lib/ai-drafts')

const VENUE_A = 'venue-a'
const VENUE_B = 'venue-b'

beforeEach(() => {
  vi.clearAllMocks()
  resetStore()
  store.menuItems.push({ id: 'item-a', venueId: VENUE_A, name: 'Paneer', aiDescription: null })
  store.menuItems.push({ id: 'item-b', venueId: VENUE_A, name: 'Butter Chicken', aiDescription: null })
})
describe('generation', () => {
  it('writes item-description drafts as DRAFT, never straight to MenuItem', async () => {
    const result = await generateItemDescriptionDrafts(VENUE_A)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.count).toBe(2)
    expect(store.drafts).toHaveLength(2)
    expect(store.drafts.every((d) => d.status === 'DRAFT')).toBe(true)
    expect(store.drafts.every((d) => d.kind === 'ITEM_DESCRIPTION')).toBe(true)
    expect(dbStub.menuItem.updateMany).not.toHaveBeenCalled()
  })

  it('generates secret-recipe drafts from the live menu only', async () => {
    const result = await generateSecretRecipeDrafts(VENUE_A)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(store.drafts).toHaveLength(1)
    expect(store.drafts[0]).toMatchObject({
      kind: 'SECRET_RECIPE',
      status: 'DRAFT',
      venueId: VENUE_A,
    })
  })
})

describe('approve', () => {
  it('moves ITEM_DESCRIPTION to APPROVED and writes the description to the item', async () => {
    await generateItemDescriptionDrafts(VENUE_A)
    const first = store.drafts[0]!
    const result = await approveAiDraft(String(first.id), VENUE_A)
    expect(result).toEqual({ ok: true })
    expect(store.drafts[0]!.status).toBe('APPROVED')
    expect(store.menuItems[0]!.aiDescription).toMatch(/\S/)
  })

  it('refuses a draft from another venue — zero rows acted on', async () => {
    await generateItemDescriptionDrafts(VENUE_A)
    const first = store.drafts[0]!
    const result = await approveAiDraft(String(first.id), VENUE_B)
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' })
    expect(store.drafts[0]!.status).toBe('DRAFT')
    expect(store.menuItems.every((m) => m.aiDescription === null)).toBe(true)
  })

  it('refuses an item that has left the venue since the draft was written', async () => {
    await generateItemDescriptionDrafts(VENUE_A)
    const first = store.drafts[0]!
    store.menuItems.length = 0 // every item gone
    const result = await approveAiDraft(String(first.id), VENUE_A)
    expect(result).toEqual({ ok: false, reason: 'ITEM_GONE' })
  })

  it('approving a Secret Recipe draft merges it into the venue game config', async () => {
    await generateSecretRecipeDrafts(VENUE_A)
    const first = store.drafts[0]!
    const result = await approveAiDraft(String(first.id), VENUE_A)
    expect(result).toEqual({ ok: true })
    expect(store.drafts[0]!.status).toBe('APPROVED')
    // The game row was created with the combination.
    expect(store.venueGames).toHaveLength(1)
    const data = store.venueGames[0]!.data as {
      combos: Array<{ id: string; ingredients: string[]; reveals: string }>
    }
    expect(data.combos).toHaveLength(1)
    expect(data.combos[0]?.id).toBe('combo-1')
    expect(data.combos[0]?.reveals).toBe('item-b')
  })
})

describe('reject', () => {
  it('moves the draft to REJECTED without touching production data', async () => {
    await generateItemDescriptionDrafts(VENUE_A)
    const first = store.drafts[0]!
    const result = await rejectAiDraft(String(first.id), VENUE_A)
    expect(result).toEqual({ ok: true })
    expect(store.drafts[0]!.status).toBe('REJECTED')
    expect(store.menuItems.every((m) => m.aiDescription === null)).toBe(true)
  })

  it("a foreign venue cannot reject another venue's draft", async () => {
    await generateItemDescriptionDrafts(VENUE_A)
    const first = store.drafts[0]!
    const result = await rejectAiDraft(String(first.id), VENUE_B)
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' })
    expect(store.drafts[0]!.status).toBe('DRAFT')
  })
})

describe('edit', () => {
  it("updates the draft text but leaves it DRAFT until approval", async () => {
    await generateItemDescriptionDrafts(VENUE_A)
    const first = store.drafts[0]!
    const result = await editAiDraft(String(first.id), VENUE_A, {
      description: "The operator's own line.",
    })
    expect(result).toEqual({ ok: true })
    expect((store.drafts[0]!.data as { description?: string }).description).toBe(
      "The operator's own line."
    )
    expect(store.drafts[0]!.status).toBe('DRAFT')
    expect(store.menuItems.every((m) => m.aiDescription === null)).toBe(true)
  })

  it('refuses an empty edit — the draft stays as it was', async () => {
    await generateItemDescriptionDrafts(VENUE_A)
    const first = store.drafts[0]!
    const result = await editAiDraft(String(first.id), VENUE_A, { description: '' })
    expect(result).toEqual({ ok: false, reason: 'INVALID' })
  })
})