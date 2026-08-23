/**
 * The POS port (PLATFORM.md §6).
 *
 * Nothing in this product may depend on a vendor POS API existing — T3 is
 * unrun, and the pilot venue's till is whatever it is. So every question we
 * would ask a POS is asked through this interface instead, and the adapter that
 * ships is a human tapping a button.
 *
 * Two separate capabilities, deliberately not merged:
 *
 * - **When did the food go in?** (`PosAdapter`) — drives the climb's run
 *   window. `Manual` ships today.
 * - **What was on the bill?** (`BillImportingPosAdapter`) — drives attach-rate
 *   delta. `CsvImport` ships in wave 2, from an end-of-day export.
 *
 * They are split because an adapter can honestly have one and not the other: a
 * human at a pass knows when the order fired and will never know the closed
 * bill, while a CSV export is the exact reverse. A single fat interface would
 * force one of them to lie.
 */

export type PosAdapterName = 'MANUAL' | 'CSV_IMPORT' | 'PETPOOJA' | 'RESTROWORKS'

export interface FireOrderCommand {
  venueId: string
  serviceId: string
  tableId: string
  /**
   * Menu categories this order covered. Empty is normal and correct — it means
   * the floor fired with one tap and did not stop to say what went in.
   */
  courses: readonly string[]
  /** Passed in rather than read, so the caller owns the clock. */
  firedAtMs: number
  firedByStaffId: string | null
}

export interface OrderFireRecord {
  id: string
  tableId: string
  serviceId: string
  firedAt: Date
  /** Server-issued. The guest's countdown is derived from this, never from a
   *  client duration (PLATFORM.md §11). */
  estReadyAt: Date
  courses: string[]
}

export interface PosAdapter {
  readonly name: PosAdapterName

  /**
   * Record that food went in for a table.
   *
   * Idempotent per (service, table): a table that already has a fire this
   * service gets its existing record back rather than a second row. That
   * matches what `/floor` offers — the Fire order button disappears once a
   * table has fired — and it means a double tap, a retried POST or a flaky
   * venue wifi cannot quietly shorten a guest's run by resetting the clock.
   * Re-firing a table is a deliberate feature with its own UI, not a
   * side effect of submitting twice.
   */
  recordFire(command: FireOrderCommand): Promise<OrderFireRecord>

  /** The most recent fire for this table, or null before the order goes in. */
  latestFire(serviceId: string, tableId: string): Promise<OrderFireRecord | null>
}

/**
 * Wave 2. Kept here so the shape is agreed before the CSV importer is written,
 * and so `CsvImport` has something to conform to rather than inventing its own
 * vocabulary. Nothing implements this yet.
 */
export interface BillImportingPosAdapter extends PosAdapter {
  importBills(serviceId: string, payload: string): Promise<{ imported: number }>
}
