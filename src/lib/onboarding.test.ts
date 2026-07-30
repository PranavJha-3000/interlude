import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The onboarding writes. The database is stubbed: what matters here is the
 * decisions — what is refused, what the cursor may do, and what a refusal
 * leaves behind — none of which needs Postgres to be true.
 */

const venue = { findUnique: vi.fn(), update: vi.fn() }
const table = { count: vi.fn() }
const menuItem = { count: vi.fn(), deleteMany: vi.fn() }
const staffUser = { deleteMany: vi.fn() }

const createVenue = vi.fn()
const createTables = vi.fn()
const createMenuItems = vi.fn()
const createStaff = vi.fn()

vi.mock('@/lib/db', () => ({ db: { venue, table, menuItem, staffUser } }))
vi.mock('@/lib/venue-setup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/venue-setup')>()),
  createVenue,
  createTables,
  createMenuItems,
  createStaff,
}))

const {
  addMenuItem,
  advanceTo,
  createVenueForOperator,
  finishMenu,
  issueStaffPins,
  rupeesToPaise,
  setTableCount,
} = await import('@/lib/onboarding')
const { newStaffPin } = await import('@/lib/venue-setup')

const VENUE = 'venue_1'

beforeEach(() => {
  vi.clearAllMocks()
  venue.findUnique.mockResolvedValue(null)
  venue.update.mockResolvedValue({})
  table.count.mockResolvedValue(0)
  menuItem.count.mockResolvedValue(0)
  createVenue.mockResolvedValue({ id: VENUE })
})

describe('rupeesToPaise', () => {
  it('converts without floating-point drift', () => {
    expect(rupeesToPaise(0)).toBe(0)
    expect(rupeesToPaise(90)).toBe(9000)
    // 19.99 * 100 is 1998.9999... in binary floating point. Money is stored as
    // integer paise precisely so this cannot creep into a margin calculation.
    expect(rupeesToPaise(19.99)).toBe(1999)
  })
})

describe('newStaffPin', () => {
  it('is always four digits, leading zeros kept', () => {
    for (let i = 0; i < 200; i++) expect(newStaffPin()).toMatch(/^\d{4}$/)
  })
})

describe('createVenueForOperator', () => {
  it('refuses a blank name before writing anything', async () => {
    expect(await createVenueForOperator('op_1', { name: '   ', city: 'Bengaluru' })).toEqual({
      ok: false,
      reason: 'NAME_REQUIRED',
    })
    expect(createVenue).not.toHaveBeenCalled()
  })

  it('refuses a slug that is already taken rather than colliding', async () => {
    venue.findUnique.mockResolvedValue({ id: 'other' })

    const result = await createVenueForOperator('op_1', { name: 'The Pilot Kitchen', city: '' })

    expect(result).toEqual({ ok: false, reason: 'NAME_TAKEN' })
    expect(createVenue).not.toHaveBeenCalled()
  })

  it('attaches the venue to the operator that asked for it', async () => {
    await createVenueForOperator('op_1', { name: 'The Pilot Kitchen', city: 'Bengaluru' })

    expect(createVenue).toHaveBeenCalledWith(expect.anything(), {
      name: 'The Pilot Kitchen',
      slug: 'the-pilot-kitchen',
      operatorId: 'op_1',
    })
  })

  it('falls back to the city, then to a constant, when the name has no slug in it', async () => {
    await createVenueForOperator('op_1', { name: '!!!', city: 'Bengaluru' })
    expect(createVenue.mock.calls[0]?.[1].slug).toBe('bengaluru')

    vi.clearAllMocks()
    venue.findUnique.mockResolvedValue(null)
    createVenue.mockResolvedValue({ id: VENUE })
    await createVenueForOperator('op_1', { name: '???', city: '' })
    expect(createVenue.mock.calls[0]?.[1].slug).toBe('venue')
  })
})

describe('setTableCount', () => {
  it.each([0, -1, 501, 1.5, Number.NaN])('refuses %s without writing', async (count) => {
    expect(await setTableCount(VENUE, count)).toEqual({ ok: false, reason: 'COUNT_INVALID' })
    expect(createTables).not.toHaveBeenCalled()
  })

  it('creates the tables and moves the cursor on', async () => {
    venue.findUnique.mockResolvedValue({ onboardingStep: 'TABLES' })

    expect(await setTableCount(VENUE, 30)).toEqual({ ok: true })

    expect(createTables).toHaveBeenCalledWith(expect.anything(), VENUE, 30)
    expect(venue.update.mock.calls[0]?.[0].data).toEqual({ onboardingStep: 'MENU' })
  })

  it('does not make a second set of tables for someone revisiting the step', async () => {
    table.count.mockResolvedValue(30)
    venue.findUnique.mockResolvedValue({ onboardingStep: 'TABLES' })

    await setTableCount(VENUE, 12)

    expect(createTables, 'sixty tables and two QR codes per table').not.toHaveBeenCalled()
  })
})

describe('addMenuItem', () => {
  const good = {
    name: 'Gulab jamun',
    category: 'desserts',
    pricePaise: 9000,
    foodCostPaise: 2000,
    marginTier: 'HIGH' as const,
  }

  it('accepts a well-formed item', async () => {
    expect(await addMenuItem(VENUE, good)).toEqual({ ok: true })
    expect(createMenuItems).toHaveBeenCalledOnce()
  })

  it('trims the name, so " Chai " and "Chai" are not two menu items', async () => {
    await addMenuItem(VENUE, { ...good, name: '  Chai  ' })
    expect(createMenuItems.mock.calls[0]?.[2][0].name).toBe('Chai')
  })

  it('refuses a nameless or free item', async () => {
    expect(await addMenuItem(VENUE, { ...good, name: ' ' })).toEqual({
      ok: false,
      reason: 'INVALID',
    })
    expect(await addMenuItem(VENUE, { ...good, pricePaise: 0 })).toEqual({
      ok: false,
      reason: 'INVALID',
    })
    expect(createMenuItems).not.toHaveBeenCalled()
  })

  it('refuses a food cost above the price, which is almost always a typo', async () => {
    const result = await addMenuItem(VENUE, { ...good, foodCostPaise: 9001 })

    // Not a rule the engine enforces — a loss leader is real — but a wrong food
    // cost silently poisons every margin decision made after it.
    expect(result).toEqual({ ok: false, reason: 'COST_OVER_PRICE' })
    expect(createMenuItems).not.toHaveBeenCalled()
  })

  it('allows a food cost exactly equal to the price', async () => {
    expect(await addMenuItem(VENUE, { ...good, foodCostPaise: 9000 })).toEqual({ ok: true })
  })
})

describe('finishMenu', () => {
  it('refuses to leave an empty menu behind', async () => {
    // The climb is built from the menu and prizes come off it, so a venue with
    // no items is a venue that cannot run a service.
    expect(await finishMenu(VENUE)).toEqual({ ok: false, reason: 'NEED_ONE' })
    expect(venue.update).not.toHaveBeenCalled()
  })

  it('moves on once there is something to play with', async () => {
    menuItem.count.mockResolvedValue(1)
    venue.findUnique.mockResolvedValue({ onboardingStep: 'MENU' })

    expect(await finishMenu(VENUE)).toEqual({ ok: true })
    expect(venue.update.mock.calls[0]?.[0].data).toEqual({ onboardingStep: 'STAFF' })
  })
})

describe('advanceTo', () => {
  it('never moves the cursor backwards', async () => {
    venue.findUnique.mockResolvedValue({ onboardingStep: 'DONE' })

    await advanceTo(VENUE, 'MENU')

    // A finished venue revisiting an early screen must not be dragged back into
    // setup — it is live, and /dash would start redirecting into the wizard.
    expect(venue.update).not.toHaveBeenCalled()
  })

  it('does not rewrite the step it is already on', async () => {
    venue.findUnique.mockResolvedValue({ onboardingStep: 'MENU' })
    await advanceTo(VENUE, 'MENU')
    expect(venue.update).not.toHaveBeenCalled()
  })

  it('moves forward', async () => {
    venue.findUnique.mockResolvedValue({ onboardingStep: 'MENU' })
    await advanceTo(VENUE, 'QR')
    expect(venue.update.mock.calls[0]?.[0].data).toEqual({ onboardingStep: 'QR' })
  })

  it('does nothing for a venue that is not there', async () => {
    venue.findUnique.mockResolvedValue(null)
    await advanceTo(VENUE, 'QR')
    expect(venue.update).not.toHaveBeenCalled()
  })
})

describe('issueStaffPins', () => {
  it('replaces both PINs and stores only hashes', async () => {
    staffUser.deleteMany.mockResolvedValue({})

    const { floorPin, kitchenPin } = await issueStaffPins(VENUE)

    expect(floorPin).toMatch(/^\d{4}$/)
    expect(kitchenPin).toMatch(/^\d{4}$/)

    // Re-issuing must not leave the old PINs working alongside the new ones.
    expect(staffUser.deleteMany).toHaveBeenCalledBefore(createStaff)

    const written = createStaff.mock.calls[0]?.[2]
    expect(JSON.stringify(written)).not.toContain(floorPin)
    expect(written[0].pinHash).toMatch(/^scrypt:/)
  })
})
