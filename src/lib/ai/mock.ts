import { formatPaise } from '@/lib/money'
import type {
  AiAdapter,
  DescribeItemsResult,
  ExtractResult,
  GameCopyResult,
  MenuItemForAI,
  MysteryCustomerGenResult,
  NarrationResult,
  SecretRecipeGenResult,
} from './types'
import {
  parseDescribeItems,
  parseGameCopy,
  parseMysteryCustomerCandidates,
  parseNarration,
  parseSecretRecipeCandidates,
} from './parse'

/**
 * The Mock adapter — dev and tests run with no API key and no network,
 * exactly like `email.ts`'s console transport.
 *
 * Deterministic: the same input always produces the same draft. Every new
 * capability routes its fixture through the same parsers the Gemini adapter
 * uses, so the mock exercises the whole path a real model response takes —
 * id validation included — rather than bypassing it.
 */

function allowedIds(menu: readonly MenuItemForAI[]): Set<string> {
  return new Set(menu.map((m) => m.id))
}

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

  async describeItems(menu): Promise<DescribeItemsResult> {
    if (menu.length === 0) {
      return { ok: false, reason: 'There are no active menu items to describe yet.' }
    }
    const raw = {
      items: menu.map((item) => ({
        itemId: item.id,
        description: `${item.name} — the ${item.category} plate that keeps the table talking.`,
      })),
    }
    return parseDescribeItems(raw, allowedIds(menu))
  },

  async generateSecretRecipes({ menu }): Promise<SecretRecipeGenResult> {
    if (menu.length < 2) {
      return { ok: false, reason: 'Add at least two active menu items first.' }
    }
    const [a, b, c] = menu
    const raw = {
      candidates: [
        {
          combinationId: 'mock-combo-1',
          itemIds: [a!.id, b!.id],
          revealItemId: b!.id,
          discoveryName: `The ${b!.name} Secret`,
          revealCopy: `Two taps, one discovery — ask for the ${b!.name} next visit.`,
        },
        ...(c
          ? [
              {
                combinationId: 'mock-combo-2',
                itemIds: [c.id, a!.id],
                revealItemId: c.id,
                discoveryName: `The ${c.name} Twist`,
                revealCopy: 'A pairing the regulars keep quiet about.',
              },
            ]
          : []),
      ],
    }
    return parseSecretRecipeCandidates(raw, allowedIds(menu))
  },

  async generateMysteryCustomers({ menu }): Promise<MysteryCustomerGenResult> {
    const prices = menu.map((m) => m.pricePaise ?? 0).filter((p) => p > 0)
    if (prices.length === 0) {
      return { ok: false, reason: 'Add menu items with prices first.' }
    }
    const low = Math.min(...prices)
    const high = Math.max(...prices)
    const mid = Math.round((low + high) / 2)
    const raw = {
      candidates: [
        {
          profileId: 'mock-persona-1',
          budgetPaise: low,
          cravings: ['spicy'],
          preferences: ['veg'],
          appetiteDishes: 2,
          scenarioCopy: 'A spice-first regular on a tight budget.',
        },
        {
          profileId: 'mock-persona-2',
          budgetPaise: mid,
          cravings: ['comfort'],
          preferences: [],
          appetiteDishes: 3,
          scenarioCopy: 'A table that orders big and shares everything.',
        },
        {
          profileId: 'mock-persona-3',
          budgetPaise: high,
          cravings: ['sweet'],
          preferences: ['veg'],
          appetiteDishes: 2,
          scenarioCopy: 'Always leaves room for dessert.',
        },
      ],
    }
    return parseMysteryCustomerCandidates(raw)
  },

  async generateGameCopy({ game, venueName }): Promise<GameCopyResult> {
    const raw =
      game === 'SECRET_RECIPE'
        ? {
            introCopy: `Every kitchen keeps a secret or two. ${venueName} keeps more than most.`,
            promptCopy: 'Tap the dishes you think belong together.',
            discoveryCopy: 'Found it — ask for it on your next visit.',
          }
        : {
            introCopy: `A mystery customer has just sat down at ${venueName}.`,
            promptCopy: 'Read the brief and build the meal they asked for.',
            discoveryCopy: 'Exactly what they were craving.',
          }
    return parseGameCopy(raw)
  },

  async narrateReport(metrics): Promise<NarrationResult> {
    const net = formatPaise(metrics.netContributionPaise)
    const prizes = formatPaise(metrics.prizeCostPaise)
    const scan = metrics.scanRatePct === null ? null : `${metrics.scanRatePct}%`
    const caveat = metrics.estimateOnly
      ? 'an app-side estimate — blind to cash tips and to what these tables would have ordered anyway'
      : 'measured from your own bill export against the same-weekday baseline'

    const raw = {
      sentences: [
        `${metrics.venueName} ran ${metrics.serviceCount} live services and ${metrics.controlCount} control nights this week.`,
        `Net contribution across the live services was ${net}, with ${prizes} spent on prizes and ${metrics.runsOpened} of ${metrics.tablesTented} tented tables playing${scan ? ` at a ${scan} scan rate` : ''}.`,
        `This figure is ${caveat}.`,
      ],
    }
    const figures = [net, prizes]
    if (scan) figures.push(scan)
    // Every bare digit in the narration must be a count the server provided —
    // the venue's own name may legitimately carry digits too.
    const counts = [
      String(metrics.serviceCount),
      String(metrics.controlCount),
      String(metrics.runsOpened),
      String(metrics.tablesTented),
      ...(metrics.venueName.match(/\d+/g) ?? []),
    ]
    return parseNarration(raw, figures, counts)
  },
}
