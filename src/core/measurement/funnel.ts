/**
 * The service funnel, as counts.
 *
 * Deliberately counts only — no percentages. `summariseEngagement` in
 * `contribution.ts` already owns rate maths, and two sources for one number is
 * how a dashboard starts contradicting itself.
 *
 * Every stage after the table counts is a **session** count, not a count of
 * plays or awards. A session can start more than one round, and a future
 * reader will be tempted to "fix" `playedSessions` back into summing plays —
 * that is the bug this file exists to prevent: `startRound` happens to allow
 * only one play per session today, so summing plays and counting
 * sessions-that-played give the same number now, but the moment that
 * constraint relaxes a summed count can exceed `scannedSessions` and the
 * funnel stops being monotonic. Count sessions at every stage past the table
 * ones, and it can't happen.
 *
 * Pure: no I/O, no clock (PLATFORM.md §5). The caller does the counting that
 * requires a database — this only totals what it is handed.
 */

export interface FunnelInput {
  /** Tables on the treatment arm — the reachable population. */
  tentedTableIds: readonly string[]
  /** One entry per table that opened a session, before any arm filtering. */
  scannedTableIds: readonly string[]
  scannedSessions: number
  playedSessions: number
  claimedSessions: number
}

export interface FunnelSummary {
  tentedTables: number
  /** Distinct tented tables that opened at least one session. */
  scannedTables: number
  /** Sessions. Two phones at one table are two, and are never merged. */
  scannedSessions: number
  /** Sessions that started a round — **sessions**, not rounds. */
  playedSessions: number
  /** Sessions whose prize a member of staff handed over. */
  claimedSessions: number
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
  return {
    tentedTables: new Set(input.tentedTableIds).size,
    scannedTables: countScannedTreatmentTables(
      input.tentedTableIds,
      input.scannedTableIds.map((tableId) => ({ tableId }))
    ),
    scannedSessions: input.scannedSessions,
    playedSessions: input.playedSessions,
    claimedSessions: input.claimedSessions,
  }
}
