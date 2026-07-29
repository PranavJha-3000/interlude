/**
 * The service funnel, as counts.
 *
 * Deliberately counts only — no percentages. `summariseEngagement` in
 * `contribution.ts` already owns rate maths, and two sources for one number is
 * how a dashboard starts contradicting itself.
 *
 * Pure: no I/O, no clock (PLATFORM.md §5).
 */

export interface FunnelSessionInput {
  tableId: string
  playCount: number
  completedCount: number
  wonCount: number
  /** Awards issued, whatever their status. */
  awardCount: number
  /** Awards a member of staff actually confirmed. */
  claimedCount: number
}

export interface FunnelInput {
  /** Tables on the treatment arm — the reachable population. */
  tentedTableIds: readonly string[]
  sessions: readonly FunnelSessionInput[]
}

export interface FunnelSummary {
  tentedTables: number
  /** Distinct tented tables that opened at least one session. */
  scannedTables: number
  /** Sessions. Two phones at one table are two, and are never merged. */
  scannedSessions: number
  played: number
  completed: number
  won: number
  awarded: number
  claimed: number
}

/**
 * Distinct **treatment** tables that opened at least one session.
 *
 * The filter is the whole point and it is exported so there is exactly one of
 * it. A table can hold a session and not be on the treatment arm: it was
 * deactivated after the scan, or a mid-service swap moved it. Counting those
 * puts a numerator above its own denominator and prints a scan rate over 100%,
 * and two pages computing "scanned tables" two ways is how a dashboard whose
 * pitch is honest measurement starts contradicting itself.
 */
export function countScannedTreatmentTables(
  tentedTableIds: readonly string[],
  sessions: readonly { tableId: string }[]
): number {
  const tented = new Set(tentedTableIds)
  const scanned = new Set<string>()
  for (const s of sessions) if (tented.has(s.tableId)) scanned.add(s.tableId)
  return scanned.size
}

export function summariseFunnel(input: FunnelInput): FunnelSummary {
  const tented = new Set(input.tentedTableIds)

  let played = 0
  let completed = 0
  let won = 0
  let awarded = 0
  let claimed = 0

  for (const s of input.sessions) {
    played += s.playCount
    completed += s.completedCount
    won += s.wonCount
    awarded += s.awardCount
    claimed += s.claimedCount
  }

  return {
    tentedTables: tented.size,
    scannedTables: countScannedTreatmentTables(input.tentedTableIds, input.sessions),
    scannedSessions: input.sessions.length,
    played,
    completed,
    won,
    awarded,
    claimed,
  }
}
