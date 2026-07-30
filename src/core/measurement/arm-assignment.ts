/**
 * Arm assignment (PLATFORM.md §8).
 *
 * The same-night control is the entire evidentiary basis of the business, so
 * an assignment is a *recorded row*, never a computed guess. These functions
 * decide what to record; they never infer after the fact what a table "would
 * have been". That distinction is the whole point — a number you can
 * reconstruct favourably later is not evidence.
 *
 * Pure: no clock, no randomness, no I/O. Alternation is deterministic from the
 * table ordering, which also means it is reproducible in an audit.
 */

export type Arm = 'TREATMENT' | 'CONTROL'

export interface TableForAssignment {
  id: string
  /** Human label, e.g. "12". Used only for a stable, explainable ordering. */
  label: string
}

export interface PlannedAssignment {
  tableId: string
  arm: Arm
  /** Recorded on the row so the operator can see why, months later. */
  reason: string
}

/**
 * Alternate tables between treatment and control.
 *
 * Alternating rather than randomising is deliberate: it is explainable to a
 * restaurant owner in one sentence, it guarantees a balanced split on small
 * table counts where randomisation often does not, and it needs no RNG in a
 * codebase where randomness is otherwise banned.
 *
 * Ordering is by numeric label where labels are numeric, falling back to
 * string order, so "Table 2" sorts before "Table 10" and the split is not an
 * artefact of database row order.
 */
export function planArmAssignments(
  tables: readonly TableForAssignment[],
  startWith: Arm = 'TREATMENT'
): PlannedAssignment[] {
  const ordered = [...tables].sort(compareByLabel)
  const other: Arm = startWith === 'TREATMENT' ? 'CONTROL' : 'TREATMENT'

  return ordered.map((t, i) => {
    const arm = i % 2 === 0 ? startWith : other
    return {
      tableId: t.id,
      arm,
      reason: `Alternating split, position ${i + 1} of ${ordered.length}, starting ${startWith.toLowerCase()}`,
    }
  })
}

/**
 * The mid-service swap.
 *
 * Without it, a difference between the two sets could just be a difference
 * between where those tables are — the window seats, the section with the
 * better server. Swapping halfway means every table spends time on both arms,
 * so table position cancels out.
 *
 * Returns the assignments for the *second* half. The caller closes the
 * existing rows with `effectiveTo` and inserts these; it never edits a row
 * that has already been used.
 */
export function planMidServiceSwap(current: readonly PlannedAssignment[]): PlannedAssignment[] {
  return current.map((a) => ({
    tableId: a.tableId,
    arm: a.arm === 'TREATMENT' ? 'CONTROL' : 'TREATMENT',
    reason: `Mid-service swap from ${a.arm.toLowerCase()}`,
  }))
}

export interface ArmRow {
  tableId: string
  arm: Arm
  effectiveFromMs: number
  /** null means still open. */
  effectiveToMs: number | null
}

/**
 * Which arm was this table on at this instant?
 *
 * Reads the recorded rows and nothing else. Returns null when no row covers
 * the moment, which is a real state — a table with no assignment has not been
 * enrolled, and must not be silently treated as either arm.
 */
export function armAt(rows: readonly ArmRow[], tableId: string, atMs: number): Arm | null {
  const covering = rows.filter(
    (r) =>
      r.tableId === tableId &&
      r.effectiveFromMs <= atMs &&
      (r.effectiveToMs === null || atMs < r.effectiveToMs)
  )
  if (covering.length === 0) return null
  // Latest-starting row wins if rows overlap, so a swap takes effect cleanly.
  let latest = covering[0]!
  for (const r of covering) if (r.effectiveFromMs > latest.effectiveFromMs) latest = r
  return latest.arm
}

/**
 * May this table open a guest session right now?
 *
 * A control table must not be able to play — PLATFORM.md §7 lists this as an
 * enforced invariant, because a single control table that played contaminates
 * the night's comparison and there is no way to tell afterwards.
 *
 * An unassigned table is also refused. Failing closed matters: enrolling a
 * table by accident is worse than turning one guest away, because it is
 * invisible.
 */
export function canOpenSession(
  rows: readonly ArmRow[],
  tableId: string,
  atMs: number
): { allowed: boolean; arm: Arm | null; reason: string } {
  const arm = armAt(rows, tableId, atMs)

  if (arm === null) {
    return {
      allowed: false,
      arm: null,
      reason: 'Table is not enrolled in this service',
    }
  }
  if (arm === 'CONTROL') {
    return {
      allowed: false,
      arm,
      reason: 'Control table — cannot open a session',
    }
  }
  return { allowed: true, arm, reason: 'Treatment table' }
}

/**
 * Split a set of tables by the arm they were on at a given time, for the
 * intent-to-treat comparison. Tables with no assignment are excluded rather
 * than defaulted — they were never part of the experiment.
 */
export function partitionByArm(
  rows: readonly ArmRow[],
  tableIds: readonly string[],
  atMs: number
): { treatment: string[]; control: string[]; unassigned: string[] } {
  const treatment: string[] = []
  const control: string[] = []
  const unassigned: string[] = []

  for (const id of tableIds) {
    const arm = armAt(rows, id, atMs)
    if (arm === 'TREATMENT') treatment.push(id)
    else if (arm === 'CONTROL') control.push(id)
    else unassigned.push(id)
  }

  return { treatment, control, unassigned }
}

/**
 * The one table-label ordering in the product.
 *
 * Numeric where both labels are numeric, so "10" does not sort between "1" and
 * "2"; lexical otherwise, so "Patio 1" has a defined place instead of the
 * unspecified order `Number(a) - Number(b)` gives when both sides are NaN.
 *
 * Exported because the tent sheet, the guest table picker and the activity page
 * all print table labels, and three private copies of this is three chances for
 * two surfaces to disagree about the same list.
 */
export function compareLabels(a: string, b: string): number {
  const na = Number(a)
  const nb = Number(b)
  const aNum = Number.isFinite(na)
  const bNum = Number.isFinite(nb)
  if (aNum && bNum) return na - nb
  if (aNum) return -1
  if (bNum) return 1
  return a.localeCompare(b)
}

function compareByLabel(a: TableForAssignment, b: TableForAssignment): number {
  return compareLabels(a.label, b.label)
}
