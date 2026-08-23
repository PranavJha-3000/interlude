import { randomBytes, randomInt } from 'node:crypto'
import type { PrismaClient } from '@/generated/prisma/client'
import { DEFAULT_RANKING_WEIGHTS, defaultPrizeRules, type Mechanic } from '@/core/prize-engine'

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

type Db = Pick<PrismaClient, 'venue' | 'table' | 'menuItem' | 'staffUser' | 'prizeRule'>

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
 * What we assume when the floor fires without naming courses — the common case,
 * because one tap is the whole point of that button.
 *
 * Sits between the quickest and slowest categories above rather than at either
 * end: too low and every run is pointlessly short, too high and the run is
 * still going when the food lands. Written into the row like everything else.
 */
export const DEFAULT_PREP_FALLBACK_MINUTES = 12

/**
 * The games a venue starts with — one, on. The spec ships one game; the row
 * (rather than a flag) is the seam a future mechanic plugs into.
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
    { mechanic: 'BEAT_THE_KITCHEN', enabled: true, displayOrder: 0 },
    { mechanic: 'SECRET_RECIPE', enabled: true, displayOrder: 1 },
    { mechanic: 'MYSTERY_CUSTOMER', enabled: true, displayOrder: 2 },
  ]
}

/**
 * A staff PIN, generated rather than chosen.
 *
 * Asking an owner to invent two PINs during signup is a screen they can abandon,
 * and a venue with no staff cannot open a service at all — so onboarding makes
 * them and shows them. `randomInt` rather than `Math.random` because this is a
 * credential: it is weak by design (four digits, typed one-handed on a shared
 * tablet, see `pin.ts`) and there is no reason to make it weaker still by
 * generating it from a predictable source.
 *
 * Leading zeros are kept — `padStart` matters, or one PIN in ten is three
 * digits and the operator reads it out wrong.
 */
export function newStaffPin(): string {
  return String(randomInt(0, 10_000)).padStart(4, '0')
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
 * Create a venue, its config and its games in one statement, then its starting
 * prize rules.
 *
 * A venue is **born configured**. There is no state in which a venue exists but
 * has no `VenueConfig` row — every read of config would otherwise need a
 * fallback, and a fallback in code is exactly the hardcoded constant §10
 * forbids.
 *
 * The `VenueGame` rows are nested in the same `create` for a sharper reason: a
 * venue with no game rows is **closed to guests**, so a half-written venue
 * would be a venue nobody can play at. Nesting makes them arrive with the venue
 * or not at all. The prize rules follow in a second write; a venue with no
 * prize rules merely offers nothing and says why, which is recoverable from
 * `/dash/prizes`.
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
      config: {
        create: {
          prepMinutesByCategory: DEFAULT_PREP_MINUTES,
          defaultPrepMinutes: DEFAULT_PREP_FALLBACK_MINUTES,
          // Spread into a plain record: Prisma's Json input wants an index
          // signature, and `RankingWeights` is deliberately a closed shape.
          rankingWeights: { ...DEFAULT_RANKING_WEIGHTS } as Record<string, number>,
        },
      },
      games: { create: defaultVenueGames() },
      ...(input.operatorId ? { operators: { connect: { id: input.operatorId } } } : {}),
    },
    include: { config: true },
  })

  await createDefaultPrizeRules(db, venue.id)

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
export async function createDefaultPrizeRules(db: Db, venueId: string) {
  const rules = defaultPrizeRules()
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

/**
 * The order onboarding walks in. Resumable — nobody finishes in one sitting.
 *
 * `STAFF` shows the generated PINs rather than asking for them, and `GAMES` is
 * last because it is the only step with a sensible default already written:
 * `defaultVenueGames()` turns both on at venue creation, so a venue that
 * abandons the wizard here is still playable.
 */
export const ONBOARDING_ORDER = [
  'DETAILS',
  'TABLES',
  'MENU',
  'STAFF',
  'QR',
  'GAMES',
  'DONE',
] as const
export type OnboardingStepName = (typeof ONBOARDING_ORDER)[number]

export function nextOnboardingStep(current: OnboardingStepName): OnboardingStepName {
  const i = ONBOARDING_ORDER.indexOf(current)
  return ONBOARDING_ORDER[Math.min(i + 1, ONBOARDING_ORDER.length - 1)]!
}

/** True when `a` is at or past `b` — used to decide whether a step is revisitable. */
export function isAtOrPast(a: OnboardingStepName, b: OnboardingStepName): boolean {
  return ONBOARDING_ORDER.indexOf(a) >= ONBOARDING_ORDER.indexOf(b)
}
