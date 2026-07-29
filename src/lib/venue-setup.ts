import { randomBytes } from 'node:crypto'
import type { PrismaClient } from '@/generated/prisma/client'
import { defaultPrizeRules, type Mechanic } from '@/core/prize-engine'

/**
 * Creating a venue — the one code path, used by both the seed script and
 * self-serve onboarding.
 *
 * There being exactly one path is the point. Two would drift, and the drift
 * would be invisible: a venue created through the UI would quietly differ from
 * the one every test runs against, and the first symptom would be a prize
 * engine behaving differently in production than in CI. `venue-setup.test.ts`
 * asserts the two produce identical config.
 *
 * Deliberately free of `server-only` and of the `@/lib/db` singleton — the seed
 * runs outside Next.js and brings its own client. Everything takes `db` as an
 * argument, which also makes it directly testable.
 */

type Db = Pick<
  PrismaClient,
  'venue' | 'table' | 'menuItem' | 'staffUser' | 'prizeRule' | 'venueGame'
>

/**
 * Appendix B estimates, seeded into `VenueConfig` and editable in
 * `/dash/prizes` from the first minute. **Not constants** (PLATFORM.md §10) —
 * this object is a starting point written into a row, never read at runtime.
 */
export const DEFAULT_PREP_MINUTES: Record<string, number> = {
  starters: 8,
  mains: 18,
  breads: 6,
  sides: 5,
  desserts: 4,
  beverages: 3,
}

/**
 * The games a venue starts with. Both on, so a new venue gets the picker
 * without configuring anything.
 *
 * Pure, and separate from the write, for the same reason `defaultPrizeRules` is:
 * a starting point written into rows the operator then owns — never a constant
 * consulted at runtime (PLATFORM.md §10).
 */
export function defaultVenueGames(): Array<{
  mechanic: Mechanic
  enabled: boolean
  displayOrder: number
}> {
  return [
    { mechanic: 'KITCHEN_ROUND', enabled: true, displayOrder: 0 },
    { mechanic: 'MYSTERY_PLATE', enabled: true, displayOrder: 1 },
  ]
}

/** Long enough that a QR token cannot be guessed or enumerated. */
export function newQrToken(): string {
  return randomBytes(12).toString('base64url')
}

/** Per-venue HMAC salt (SECURITY.md §6). Generated once, never leaves the row. */
export function newPhoneSalt(): string {
  return randomBytes(32).toString('hex')
}

/** `"The Pilot Kitchen"` -> `"the-pilot-kitchen"`. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export interface CreateVenueInput {
  name: string
  slug?: string
  timezone?: string
  /** Attach the operator who is creating it, if there is one. */
  operatorId?: string
}

/**
 * Create a venue, its config, and its starting prize rules, atomically.
 *
 * A venue is **born configured**. There is no state in which a venue exists but
 * has no `VenueConfig` row — every read of config would otherwise need a
 * fallback, and a fallback in code is exactly the hardcoded constant §10
 * forbids.
 */
export async function createVenue(db: Db, input: CreateVenueInput) {
  const slug = input.slug ?? slugify(input.name)

  const venue = await db.venue.create({
    data: {
      slug,
      name: input.name,
      timezone: input.timezone ?? 'Asia/Kolkata',
      phoneSalt: newPhoneSalt(),
      qrToken: newQrToken(),
      onboardingStep: 'TABLES',
      config: { create: { prepMinutesByCategory: DEFAULT_PREP_MINUTES } },
      ...(input.operatorId ? { operators: { connect: { id: input.operatorId } } } : {}),
    },
    include: { config: true },
  })

  await createDefaultPrizeRules(db, venue.id, venue.config!.mysteryPlatePricePaise)

  await db.venueGame.createMany({
    data: defaultVenueGames().map((g) => ({ venueId: venue.id, ...g })),
  })

  return venue
}

/**
 * Write the starting prize policy as editable rows.
 *
 * The engine reads rules from the database, so a venue with none offers no
 * prizes at all. That is a legitimate thing for an operator to choose later —
 * but it must never be the state a venue is *created* in, or night one is a
 * guest winning nothing and nobody knowing why.
 */
export async function createDefaultPrizeRules(
  db: Db,
  venueId: string,
  mysteryPlatePricePaise: number
) {
  const rules = defaultPrizeRules(mysteryPlatePricePaise)
  await db.prizeRule.createMany({
    data: rules.map((r) => ({
      venueId,
      priority: r.priority,
      label: r.label,
      mechanic: r.mechanic,
      outcome: r.outcome,
      marginTier: r.marginTier ?? null,
      category: r.category ?? null,
      menuItemId: r.menuItemId ?? null,
      window: r.window,
      kind: r.kind,
      percentOff: r.percentOff ?? null,
      fixedPricePaise: r.fixedPricePaise ?? null,
    })),
  })
  return rules.length
}

/**
 * Create tables labelled `1..count`, each with its own QR token.
 *
 * The per-table token is what a `GuestSession` opens against, because arm
 * assignment is per table. The venue QR sits in front of these, not instead of
 * them (PLATFORM.md §3).
 */
export async function createTables(
  db: Db,
  venueId: string,
  count: number,
  seatsFor: (index: number) => number = () => 4
) {
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    throw new Error(`Table count must be between 1 and 500, got ${count}`)
  }

  await db.table.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      venueId,
      label: String(i + 1),
      qrToken: newQrToken(),
      seats: seatsFor(i),
    })),
  })
  return count
}

export interface MenuItemDraft {
  name: string
  category: string
  /** Rupees, as the operator types them. Converted to paise here, once. */
  pricePaise: number
  foodCostPaise: number
  marginTier: 'HIGH' | 'MID' | 'LOW'
  prepBurden?: 'LOW' | 'MEDIUM' | 'HIGH'
  requiresKitchenWork?: boolean
  isHero?: boolean
  trailingSales?: number
}

export async function createMenuItems(db: Db, venueId: string, items: MenuItemDraft[]) {
  await db.menuItem.createMany({
    data: items.map((m) => ({
      venueId,
      name: m.name,
      category: m.category,
      pricePaise: m.pricePaise,
      foodCostPaise: m.foodCostPaise,
      marginTier: m.marginTier,
      prepBurden: m.prepBurden ?? 'LOW',
      requiresKitchenWork: m.requiresKitchenWork ?? true,
      isHero: m.isHero ?? false,
      trailingSales: m.trailingSales ?? 0,
    })),
    skipDuplicates: true,
  })
  return items.length
}

/**
 * Staff PINs. A venue with no staff cannot open a service, so onboarding
 * requires at least one of each role before it will finish.
 */
export async function createStaff(
  db: Db,
  venueId: string,
  staff: Array<{ name: string; role: 'SERVER' | 'KITCHEN'; pinHash: string }>
) {
  await db.staffUser.createMany({ data: staff.map((s) => ({ venueId, ...s })) })
  return staff.length
}

/** The order onboarding walks in. Resumable — nobody finishes in one sitting. */
export const ONBOARDING_ORDER = ['DETAILS', 'TABLES', 'MENU', 'STAFF', 'QR', 'DONE'] as const
export type OnboardingStepName = (typeof ONBOARDING_ORDER)[number]

export function nextOnboardingStep(current: OnboardingStepName): OnboardingStepName {
  const i = ONBOARDING_ORDER.indexOf(current)
  return ONBOARDING_ORDER[Math.min(i + 1, ONBOARDING_ORDER.length - 1)]!
}

/** True when `a` is at or past `b` — used to decide whether a step is revisitable. */
export function isAtOrPast(a: OnboardingStepName, b: OnboardingStepName): boolean {
  return ONBOARDING_ORDER.indexOf(a) >= ONBOARDING_ORDER.indexOf(b)
}
