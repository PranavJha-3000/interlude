import 'server-only'

import { db } from '@/lib/db'
import { hashPin } from '@/lib/pin'
import {
  ONBOARDING_ORDER,
  type MenuItemDraft,
  type OnboardingStepName,
  createMenuItems,
  createStaff,
  createTables,
  createVenue,
  newStaffPin,
  nextOnboardingStep,
  slugify,
} from '@/lib/venue-setup'

/**
 * Self-serve onboarding: the writes behind `/onboarding`.
 *
 * Every function here takes the operator id from the caller, which took it from
 * the session — never from the form. A venue id arriving from the client is a
 * cross-tenant write, and types cannot tell the difference (SECURITY.md §8).
 *
 * The venue is created by `venue-setup.ts`, the same code path the seed uses.
 * Two paths would drift, and the drift would be invisible until a venue made
 * through the UI behaved differently from the one every test runs against.
 */

/** Rupees as typed, to paise. The one place the conversion happens. */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100)
}

export type StepResult<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { value: T })) | { ok: false; reason: string }

/** Step 1 — the venue, its config, its games and its prize rules. */
export async function createVenueForOperator(
  operatorId: string,
  input: { name: string; city: string }
): Promise<StepResult<{ venueId: string }>> {
  const name = input.name.trim()
  if (!name) return { ok: false, reason: 'NAME_REQUIRED' }

  // The slug is the venue's public identity (`/floor/<slug>`), so a collision
  // is a real clash rather than a cosmetic one. The city disambiguates two
  // branches of the same restaurant, which is the common case.
  const city = input.city.trim()
  const base = slugify(name)
  const slug = base || slugify(city) || 'venue'

  const taken = await db.venue.findUnique({ where: { slug }, select: { id: true } })
  if (taken) return { ok: false, reason: 'NAME_TAKEN' }

  const venue = await createVenue(db, { name, slug, operatorId })

  return { ok: true, value: { venueId: venue.id } }
}

/**
 * Step 4 — mint the staff PINs and hand them back exactly once.
 *
 * Generated rather than asked for: inventing two PINs is a screen an owner can
 * abandon, and a venue with no staff cannot open a service at all.
 *
 * Only the hash is stored, so this return value is the only time the PINs are
 * legible — which is why it is a POST and not something the page does while
 * rendering. A write during render would rotate a venue's PINs on a reload, or
 * on a link prefetch, without anyone asking it to.
 *
 * Calling it again replaces both. That is the intended way to recover from
 * losing them, and the copy on the screen says so.
 */
export async function issueStaffPins(
  venueId: string
): Promise<{ floorPin: string; kitchenPin: string }> {
  const floorPin = newStaffPin()
  const kitchenPin = newStaffPin()

  await db.staffUser.deleteMany({ where: { venueId, name: { in: ['Floor', 'Kitchen'] } } })
  await createStaff(db, venueId, [
    { name: 'Floor', role: 'SERVER', pinHash: hashPin(floorPin) },
    { name: 'Kitchen', role: 'KITCHEN', pinHash: hashPin(kitchenPin) },
  ])

  return { floorPin, kitchenPin }
}

/** Step 2 — the tables, each with its own QR token. */
export async function setTableCount(venueId: string, count: number): Promise<StepResult> {
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    return { ok: false, reason: 'COUNT_INVALID' }
  }

  const existing = await db.table.count({ where: { venueId } })
  if (existing === 0) await createTables(db, venueId, count)

  await advanceTo(venueId, 'MENU')
  return { ok: true }
}

/** Step 3 — one menu item, added to the venue's own menu. */
export async function addMenuItem(venueId: string, draft: MenuItemDraft): Promise<StepResult> {
  if (!draft.name.trim()) return { ok: false, reason: 'INVALID' }
  if (!Number.isFinite(draft.pricePaise) || draft.pricePaise <= 0) {
    return { ok: false, reason: 'INVALID' }
  }
  if (!Number.isFinite(draft.foodCostPaise) || draft.foodCostPaise < 0) {
    return { ok: false, reason: 'INVALID' }
  }
  // Not a hard refusal in the engine — a loss-leader is a real thing — but at
  // setup it is almost always a typo, and a wrong food cost silently poisons
  // every margin decision the prize engine makes afterwards.
  if (draft.foodCostPaise > draft.pricePaise) return { ok: false, reason: 'COST_OVER_PRICE' }

  await createMenuItems(db, venueId, [{ ...draft, name: draft.name.trim() }])
  return { ok: true }
}

export async function removeMenuItem(venueId: string, menuItemId: string): Promise<void> {
  // Scoped by venueId as well as id: an id arriving from a form is a client
  // input, and deleting by it alone would delete another venue's item.
  await db.menuItem.deleteMany({ where: { id: menuItemId, venueId } })
}

/** Step 3 → 4. Refused while the menu is empty: the game is made of the menu. */
export async function finishMenu(venueId: string): Promise<StepResult> {
  const items = await db.menuItem.count({ where: { venueId } })
  if (items === 0) return { ok: false, reason: 'NEED_ONE' }

  await advanceTo(venueId, 'STAFF')
  return { ok: true }
}

/**
 * Move the cursor, without ever moving it backwards.
 *
 * An operator revisiting a finished step must not reset a venue that is already
 * live — so this only ever writes a step further along than the current one.
 */
export async function advanceTo(venueId: string, step: OnboardingStepName): Promise<void> {
  const venue = await db.venue.findUnique({
    where: { id: venueId },
    select: { onboardingStep: true },
  })
  if (!venue) return

  const current = ONBOARDING_ORDER.indexOf(venue.onboardingStep)
  if (ONBOARDING_ORDER.indexOf(step) <= current) return

  await db.venue.update({ where: { id: venueId }, data: { onboardingStep: step } })
}

/** Step 4 → 5 → 6 → done, for the screens that only need acknowledging. */
export async function advanceFrom(venueId: string, current: OnboardingStepName): Promise<void> {
  await advanceTo(venueId, nextOnboardingStep(current))
}
