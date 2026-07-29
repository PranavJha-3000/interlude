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

export function summariseFunnel(input: FunnelInput): FunnelSummary {
  const tented = new Set(input.tentedTableIds)
  const scanned = new Set<string>()

  let played = 0
  let completed = 0
  let won = 0
  let awarded = 0
  let claimed = 0

  for (const s of input.sessions) {
    // Only tented tables count as reach. A session from anywhere else is
    // recorded but must not inflate the denominator's numerator.
    if (tented.has(s.tableId)) scanned.add(s.tableId)
    played += s.playCount
    completed += s.completedCount
    won += s.wonCount
    awarded += s.awardCount
    claimed += s.claimedCount
  }

  return {
    tentedTables: tented.size,
    scannedTables: scanned.size,
    scannedSessions: input.sessions.length,
    played,
    completed,
    won,
    awarded,
    claimed,
  }
}
