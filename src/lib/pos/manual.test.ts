import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Manual adapter's own decisions. The database is stubbed — what matters
 * here is *whether* it writes and *what* it writes, neither of which needs
 * Postgres to be true. The estimate itself is proven in
 * core/mechanics/prep-estimate.test.ts; this asserts the adapter feeds it the
 * venue's real numbers rather than any of its own.
 */

const orderFire = { create: vi.fn(), findFirst: vi.fn() }
const venueConfig = { findUnique: vi.fn() }

vi.mock('@/lib/db', () => ({ db: { orderFire, venueConfig } }))

const { manualPosAdapter } = await import('./manual')

const VENUE = 'venue_1'
const SERVICE = 'service_1'
const TABLE = 'table_1'
const FIRED_AT = 1_700_000_000_000
const MINUTE = 60_000

const CONFIG = {
  venueId: VENUE,
  prepMinutesByCategory: { starters: 8, mains: 18, desserts: 4 },
  defaultPrepMinutes: 12,
}

function command(courses: string[] = []) {
  return {
    venueId: VENUE,
    serviceId: SERVICE,
    tableId: TABLE,
    courses,
    firedAtMs: FIRED_AT,
    firedByStaffId: 'staff_1',
  }
}

/** Minutes between the fire and the estimate, from whatever was written. */
function writtenMinutesOut(): number {
  const data = orderFire.create.mock.calls[0]![0].data
  return (data.estReadyAt.getTime() - data.firedAt.getTime()) / MINUTE
}

beforeEach(() => {
  vi.clearAllMocks()
  venueConfig.findUnique.mockResolvedValue(CONFIG)
  orderFire.findFirst.mockResolvedValue(null)
  orderFire.create.mockImplementation(async ({ data }: { data: unknown }) => data)
})

describe('manualPosAdapter', () => {
  it('names itself, so a snapshot can say which POS produced a row', () => {
    expect(manualPosAdapter.name).toBe('MANUAL')
  })

  it('uses the venue default when the floor names no courses', async () => {
    await manualPosAdapter.recordFire(command())

    expect(orderFire.create).toHaveBeenCalledOnce()
    expect(writtenMinutesOut()).toBe(CONFIG.defaultPrepMinutes)
  })

  it('sizes the estimate to the quickest course named', async () => {
    await manualPosAdapter.recordFire(command(['mains', 'starters']))

    expect(writtenMinutesOut()).toBe(8)
  })

  it('records the courses it was given', async () => {
    await manualPosAdapter.recordFire(command(['starters', 'mains']))

    expect(orderFire.create.mock.calls[0]![0].data.courses).toEqual(['starters', 'mains'])
  })

  it('reads the estimate from the venue, never from a constant of its own', async () => {
    // A venue whose kitchen is genuinely slower must get a longer run without
    // anyone editing code (PLATFORM.md §10).
    venueConfig.findUnique.mockResolvedValue({
      ...CONFIG,
      prepMinutesByCategory: { starters: 30 },
      defaultPrepMinutes: 40,
    })

    await manualPosAdapter.recordFire(command(['starters']))
    expect(writtenMinutesOut()).toBe(30)
  })

  describe('firing a table that has already fired', () => {
    const EXISTING = {
      id: 'fire_1',
      tableId: TABLE,
      serviceId: SERVICE,
      firedAt: new Date(FIRED_AT - 5 * MINUTE),
      estReadyAt: new Date(FIRED_AT + 7 * MINUTE),
      courses: ['starters'],
    }

    beforeEach(() => {
      orderFire.findFirst.mockResolvedValue(EXISTING)
    })

    it('writes nothing', async () => {
      await manualPosAdapter.recordFire(command())

      expect(orderFire.create).not.toHaveBeenCalled()
    })

    it('returns the original, so the guest clock does not move', async () => {
      // The failure this prevents: a replayed POST on flaky venue wifi resets
      // `firedAt` to now, and the guest is silently handed a longer run than
      // the kitchen is actually giving them.
      const result = await manualPosAdapter.recordFire(command(['desserts']))

      expect(result).toBe(EXISTING)
      expect(result.estReadyAt.getTime()).toBe(EXISTING.estReadyAt.getTime())
    })
  })

  it('returns null from latestFire before an order goes in', async () => {
    expect(await manualPosAdapter.latestFire(SERVICE, TABLE)).toBeNull()
  })

  it('scopes latestFire to one table in one service', async () => {
    await manualPosAdapter.latestFire(SERVICE, TABLE)

    expect(orderFire.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { serviceId: SERVICE, tableId: TABLE } })
    )
  })
})
