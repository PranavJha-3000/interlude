import 'server-only'

import { db } from '@/lib/db'
import { armAt, planArmAssignments, type ArmRow } from '@/core/measurement/arm-assignment'
import { MECHANICS, type Mechanic, type PrizeRuleInput } from '@/core/prize-engine'
import { defaultVenueGames } from '@/lib/venue-setup'
import { resolvePosAdapter } from '@/lib/pos'

/**
 * Reads the live state a guest surface needs. Everything here is I/O; the
 * decisions themselves live in `core/` and take this data as arguments.
 */

/** The venue's own numbers, never constants (PLATFORM.md §10). */
export async function getVenueConfig(venueId: string) {
  const config = await db.venueConfig.findUnique({ where: { venueId } })
  if (!config) throw new Error(`Venue ${venueId} has no config row`)
  return config
}

/** The service currently running at this venue, or null between services. */
export async function getOpenService(venueId: string) {
  return db.service.findFirst({
    where: { venueId, endedAt: null },
    orderBy: { startedAt: 'desc' },
  })
}

/**
 * Opens a service and records the alternating arm split in one transaction.
 *
 * The assignment has to exist before the first guest scans, or the first few
 * tables would be unenrolled and silently excluded from the night's
 * comparison.
 *
 * One write, two doors: the floor console and the dashboard's service card
 * both start the night through this, so the arm split is planned identically
 * no matter who opens it. The body is the floor console's original
 * `openService`, relocated verbatim — not a second implementation beside it.
 */
export async function openServiceFor(venueId: string): Promise<void> {
  const existing = await getOpenService(venueId)
  if (existing) return

  const tables = await db.table.findMany({
    where: { venueId, active: true },
    select: { id: true, label: true },
  })
  if (tables.length === 0) return

  // Alternate which arm leads, so the same tables are not always treatment.
  const previous = await db.service.count({ where: { venueId } })
  const plan = planArmAssignments(tables, previous % 2 === 0 ? 'TREATMENT' : 'CONTROL')

  await db.$transaction(async (tx) => {
    const service = await tx.service.create({
      data: {
        venueId,
        name: new Date().toISOString().slice(0, 16).replace('T', ' '),
      },
    })
    await tx.tableArmAssignment.createMany({
      data: plan.map((p) => ({
        serviceId: service.id,
        tableId: p.tableId,
        arm: p.arm,
        reason: p.reason,
      })),
    })
  })
}

export async function getArmRows(serviceId: string): Promise<ArmRow[]> {
  const rows = await db.tableArmAssignment.findMany({
    where: { serviceId },
    select: { tableId: true, arm: true, effectiveFrom: true, effectiveTo: true },
  })
  return rows.map((r) => ({
    tableId: r.tableId,
    arm: r.arm,
    effectiveFromMs: r.effectiveFrom.getTime(),
    effectiveToMs: r.effectiveTo?.getTime() ?? null,
  }))
}

export type ScanResolution =
  | { kind: 'UNKNOWN_TABLE' }
  | { kind: 'NO_SERVICE'; venueName: string }
  | { kind: 'BLOCKED'; venueName: string; reason: string }
  | {
      kind: 'OK'
      venueId: string
      venueName: string
      serviceId: string
      arm: 'LIVE' | 'CONTROL'
      /** The chef has hit the kill switch: play on, award nothing (§7.4). */
      killed: boolean
      tableId: string
      tableLabel: string
    }

/**
 * Resolve a scanned QR token into something the page can render.
 *
 * A control table is refused here, before any row is written. PLATFORM.md §7
 * lists this as an enforced invariant: one control table that played
 * contaminates the night's comparison, and afterwards there is no way to tell.
 * The guest sees an ordinary "nothing running" screen — they must never learn
 * they are in a control group, or the behaviour we are measuring changes.
 */
export async function resolveScan(qrToken: string): Promise<ScanResolution> {
  const table = await db.table.findUnique({
    where: { qrToken },
    include: { venue: { select: { id: true, name: true } } },
  })
  if (!table || !table.active) return { kind: 'UNKNOWN_TABLE' }

  const service = await getOpenService(table.venueId)
  if (!service) return { kind: 'NO_SERVICE', venueName: table.venue.name }

  // The service is the unit of assignment now, not the table. A control service
  // put no tents out at all, so a scan during one is a guest holding last
  // week's tent — and they get the closed-venue screen, byte for byte. They
  // must never learn a control night is a control night, or the behaviour being
  // measured changes.
  if (service.arm === 'CONTROL') {
    return { kind: 'NO_SERVICE', venueName: table.venue.name }
  }

  // The chef's kill switch (§7.4) stops offers and awards, never the game or
  // the measurement. The night still produces a number, so the scan resolves.
  return {
    kind: 'OK',
    venueId: table.venueId,
    venueName: table.venue.name,
    serviceId: service.id,
    arm: service.arm,
    killed: service.killedAt !== null,
    tableId: table.id,
    tableLabel: table.label,
  }
}

export type VenueScanResolution =
  | { kind: 'UNKNOWN_VENUE' }
  | {
      kind: 'OK'
      venueName: string
      tables: Array<{ label: string; qrToken: string }>
    }

/**
 * Resolve a **venue** QR into a table picker.
 *
 * One code to print for the counter or the menu, instead of thirty. It resolves
 * to a list of tables and hands off to the per-table token, because a
 * `GuestSession` opens against a table and the arm assignment is per table
 * (PLATFORM.md §3).
 *
 * **Every active table is listed, including control tables.** Filtering them out
 * would be the single easiest way to contaminate the experiment: a guest whose
 * table is missing from the list learns something about their table. They tap
 * it, land on `/t/[qrToken]`, and get the same "nothing running tonight" screen
 * a closed venue shows.
 *
 * A venue that is closed still shows its picker. Whether there is a service on
 * is not this page's business, and revealing it here would give the control
 * guest a second signal.
 */
export async function resolveVenueScan(venueToken: string): Promise<VenueScanResolution> {
  const venue = await db.venue.findUnique({
    where: { qrToken: venueToken },
    select: {
      name: true,
      tables: {
        where: { active: true },
        select: { label: true, qrToken: true },
      },
    },
  })
  if (!venue) return { kind: 'UNKNOWN_VENUE' }

  // Numeric where labels are numeric, lexical otherwise — "10" must not sort
  // between "1" and "2" on a picker someone is using one-handed.
  const tables = [...venue.tables].sort((a, b) => {
    const na = Number(a.label)
    const nb = Number(b.label)
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
    return a.label.localeCompare(b.label)
  })

  return { kind: 'OK', venueName: venue.name, tables }
}

/** Which arm a table is on right now — used when recording a session. */
export async function armForTable(
  serviceId: string,
  tableId: string,
  atMs: number
): Promise<'TREATMENT' | 'CONTROL' | null> {
  return armAt(await getArmRows(serviceId), tableId, atMs)
}

/**
 * The most recent order fired for this table in this service, which is what
 * drives the countdown.
 *
 * Goes through the `PosAdapter` port rather than the table directly, so that
 * the day a venue has a real till, the guest surface does not change
 * (PLATFORM.md §6).
 */
export async function getLatestOrderFire(serviceId: string, tableId: string, venueId: string) {
  return resolvePosAdapter(venueId).latestFire(serviceId, tableId)
}

/**
 * The server's own reading of the round clock (§4.6).
 *
 * The countdown the phone renders is presentation; this is truth. The round
 * actions and the guest page both read it, so the clock hitting 0:00 means
 * the same thing everywhere: the run is over, the rung is banked, and no
 * further answer is judged. Null means an untimed run — the floor never fired.
 */
export async function roundEndsAtMs(
  scan: { serviceId: string; tableId: string; venueId: string },
  config: { countdownBufferSec: number }
): Promise<number | null> {
  const fire = await getLatestOrderFire(scan.serviceId, scan.tableId, scan.venueId)
  return fire ? fire.estReadyAt.getTime() - config.countdownBufferSec * 1000 : null
}

/** Current kitchen load. Defaults to GREEN when the chef has not set one. */
export async function getKitchenLoad(venueId: string): Promise<'GREEN' | 'AMBER' | 'RED'> {
  const row = await db.kitchenLoad.findFirst({
    where: { venueId },
    orderBy: { setAt: 'desc' },
  })
  return row?.level ?? 'GREEN'
}

/** Item ids the chef has vetoed. Absolute — the prize engine never overrides. */
export async function getActiveVetoes(venueId: string): Promise<string[]> {
  const rows = await db.chefVeto.findMany({
    where: { venueId, active: true },
    select: { menuItemId: true },
  })
  return rows.map((r) => r.menuItemId)
}

/**
 * The venue's own prize policy, as the engine wants it.
 *
 * Returns the rows the operator wrote. **No fallback to the defaults**: a venue
 * that has deleted every rule offers no prizes, and the pool screen says so with
 * a reason. Silently substituting our policy for theirs would give away their
 * food on our opinion — the exact thing rules exist to stop.
 */
export async function getPrizeRules(venueId: string): Promise<PrizeRuleInput[]> {
  const rows = await db.prizeRule.findMany({
    where: { venueId, active: true },
    orderBy: [{ priority: 'asc' }, { id: 'asc' }],
  })
  return rows.map((r) => ({
    id: r.id,
    priority: r.priority,
    label: r.label,
    mechanic: r.mechanic,
    outcome: r.outcome,
    ...(r.marginTier ? { marginTier: r.marginTier } : {}),
    ...(r.category ? { category: r.category } : {}),
    ...(r.menuItemId ? { menuItemId: r.menuItemId } : {}),
    window: r.window,
    kind: r.kind,
    ...(r.percentOff !== null ? { percentOff: r.percentOff } : {}),
    ...(r.fixedPricePaise !== null ? { fixedPricePaise: r.fixedPricePaise } : {}),
  }))
}

/** The menu, shaped for the prize engine. One mapping, not four copies of it. */
export async function getMenuForEngine(venueId: string) {
  const menu = await db.menuItem.findMany({ where: { venueId, active: true } })
  return {
    rows: menu,
    engineMenu: menu.map((m) => ({
      id: m.id,
      name: m.name,
      category: m.category,
      pricePaise: m.pricePaise,
      foodCostPaise: m.foodCostPaise,
      marginTier: m.marginTier,
      prepBurden: m.prepBurden,
      requiresKitchenWork: m.requiresKitchenWork,
      isHero: m.isHero,
      active: m.active,
    })),
    velocity: menu.map((m) => ({ itemId: m.id, unitsSold: m.trailingSales })),
  }
}

/**
 * Value already conceded this service, so the depth cap is a running total.
 *
 * **The `tableRun` branch is the one that matters, and it was missing.** This
 * counted awards only through `play.guestSession.serviceId`, which was right
 * when the climb was the game and every award hung off a `Play`. Since the
 * table became the unit, `awardFor` writes `tableRunId` and leaves `playId`
 * null — and a Prisma to-one relation filter does not match a row whose foreign
 * key is null. So the sum was always zero.
 *
 * What that broke is subtler than the cap not working. `decidePrizePool`
 * computes `perServicePaise - concededSoFarPaise`, so with the total stuck at
 * zero the cap still bound *per award*, as a fixed ceiling — it simply never
 * **depleted**. A venue with a ₹5,000 service cap could concede ₹5,000 on every
 * award, all evening, while `/pass` and `/dash/prizes` both displayed "₹0
 * conceded so far" and looked like they were working.
 *
 * The climb-era branch is kept rather than replaced: those awards are real rows
 * that really conceded value, and dropping them would understate a service that
 * spans the migration.
 */
export async function getConcededSoFarPaise(serviceId: string): Promise<number> {
  const result = await db.award.aggregate({
    _sum: { valuePaise: true },
    where: {
      status: { in: ['PENDING', 'CONFIRMED'] },
      OR: [{ tableRun: { serviceId } }, { play: { guestSession: { serviceId } } }],
    },
  })
  return result._sum.valuePaise ?? 0
}

/** Minutes from midnight in the venue's own timezone. */
export function serviceClockMinute(atMs: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(atMs))
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return hour * 60 + minute
}

// The ready estimate used to live here. It is now a pure function in
// core/mechanics/prep-estimate.ts, reached through the PosAdapter port, so the
// rule can be tested without a database — and so nothing outside the port
// computes it independently.

/**
 * The games this venue is currently running, in the order the guest sees them.
 *
 * An empty array is a real state and means the venue is closed to play — the
 * guest surface renders the same neutral screen a control table and a closed
 * venue get. It must not be treated as "no preference, show everything", which
 * would turn a deliberate operator decision into a no-op.
 */
export async function getEnabledGames(venueId: string): Promise<Mechanic[]> {
  const rows = await db.venueGame.findMany({
    where: { venueId, enabled: true },
    orderBy: [{ displayOrder: 'asc' }, { mechanic: 'asc' }],
    select: { mechanic: true },
  })
  // Retired mechanics never reach a guest even if a venue's old row is still
  // enabled — the platform list is the gate, the rows are the preference.
  return rows.map((r) => r.mechanic).filter((m) => MECHANICS.some((known) => known === m))
}

/** Every game, on or off — what the operator's toggle page lists. */
export async function listVenueGames(
  venueId: string
): Promise<Array<{ mechanic: Mechanic; enabled: boolean }>> {
  const rows = await db.venueGame.findMany({
    where: { venueId },
    orderBy: [{ displayOrder: 'asc' }, { mechanic: 'asc' }],
    select: { mechanic: true, enabled: true },
  })
  return rows
}

/**
 * Turn a game on or off for one venue.
 *
 * Keyed on `[venueId, mechanic]` rather than a row id: the venue id comes off
 * the operator's session, so a mechanic name arriving from a form can only ever
 * affect the caller's own venue.
 *
 * An upsert rather than an update, because a missing row is not a no-op state.
 * A venue with no rows is closed to guests, and a mechanic that shipped after
 * the venue was created has no row at all — in both cases the operator's tap
 * has to be able to write one, or the venue is stuck. The display order comes
 * from `defaultVenueGames()` so a row written here sorts where it would have if
 * it had been born with the venue.
 */
export async function setVenueGameEnabled(
  venueId: string,
  mechanic: Mechanic,
  enabled: boolean
): Promise<void> {
  const displayOrder = defaultVenueGames().find((g) => g.mechanic === mechanic)?.displayOrder ?? 0
  await db.venueGame.upsert({
    where: { venueId_mechanic: { venueId, mechanic } },
    update: { enabled },
    create: { venueId, mechanic, enabled, displayOrder },
  })
}
