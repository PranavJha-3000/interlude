/**
 * Which services run live, and which run dark (§3).
 *
 * **The service is the unit of assignment, not the table.** Tents go out on
 * every table in a service or on none. A per-table split inside one service
 * leaks — tables talk to each other, a server mentions it, and a guest at a
 * dark table watches the next table play — and it cannot be reconciled against
 * a bill export that only knows the night.
 *
 * Three comparisons, in the order the spec ranks them:
 *
 * 1. **Historical baseline** — the venue's own last six to eight same-weekday
 *    exports. The primary one, and it costs no live service.
 * 2. **Counterbalanced services** — alternate which weekend night is live, so
 *    the day-of-week effect cancels instead of contaminating.
 * 3. **Scanners versus non-scanners** — diagnostic only, always shown with the
 *    self-selection warning, never the basis of a claim.
 *
 * Pure. The rows this plans are written before a service opens and are never
 * updated afterwards: if arm assignment can be edited after the fact, so can
 * the result of the pilot.
 */

export type ServiceArm = 'LIVE' | 'CONTROL'

export interface PlannedService {
  /** ISO date, venue-local. */
  date: string
  /** 0 = Sunday, matching `Date.getUTCDay`. */
  weekday: number
  arm: ServiceArm
  /** Never empty. Written onto the row so the schedule explains itself. */
  reason: string
}

/**
 * Counterbalance a run of weekend services.
 *
 * Weekend one goes dark on Saturday and live on Sunday; weekend two reverses
 * it. Over four weekends every weekday is measured on both arms an equal number
 * of times, so "Saturdays are busier" cannot masquerade as an effect.
 *
 * @param dates weekend service dates in chronological order, as ISO strings
 * @param startLive whether the first service of the first weekend runs live
 */
export function planCounterbalancedServices(
  dates: readonly { date: string; weekday: number }[],
  startLive = false
): PlannedService[] {
  // Group into weekends by their position, not by parsing dates — a "weekend"
  // is whatever consecutive pair the operator scheduled, which may not be
  // Saturday and Sunday at every venue.
  return dates.map((d, index) => {
    const weekendIndex = Math.floor(index / 2)
    const withinWeekend = index % 2
    // Flip the leading arm each weekend, then alternate within it.
    const live = (weekendIndex + withinWeekend) % 2 === (startLive ? 0 : 1)

    return {
      date: d.date,
      weekday: d.weekday,
      arm: live ? 'LIVE' : 'CONTROL',
      reason: `Counterbalance: weekend ${weekendIndex + 1}, service ${withinWeekend + 1} — ${
        live ? 'tents out on every table' : 'no tents, control night'
      }`,
    }
  })
}

/**
 * Is the schedule actually counterbalanced?
 *
 * A schedule that runs every Saturday live and every Sunday dark measures the
 * difference between Saturday and Sunday, which is not the question. This is
 * the check worth running before a pilot rather than after it.
 */
export function isCounterbalanced(plan: readonly PlannedService[]): boolean {
  const byWeekday = new Map<number, { live: number; control: number }>()

  for (const p of plan) {
    const counts = byWeekday.get(p.weekday) ?? { live: 0, control: 0 }
    if (p.arm === 'LIVE') counts.live++
    else counts.control++
    byWeekday.set(p.weekday, counts)
  }

  // Every weekday used must appear on both arms, within one service of even.
  for (const counts of byWeekday.values()) {
    if (Math.abs(counts.live - counts.control) > 1) return false
    if (counts.live === 0 || counts.control === 0) return false
  }

  return byWeekday.size > 0
}

// ── The append-only record ─────────────────────────────────────────────────

export interface ArmRecord {
  arm: ServiceArm
  reason: string
  recordedAtMs: number
  /** Set only on a correction, naming the row it supersedes. */
  supersedesId?: string | null
  id: string
}

/**
 * The arm in force for a service: the latest row, and nothing else.
 *
 * Corrections arrive as new rows rather than as edits, so the history of what
 * was believed and when stays readable. A correction that overwrote its
 * predecessor would leave a service whose arm nobody could audit — which is the
 * one property this whole design exists to provide.
 */
export function armInForce(records: readonly ArmRecord[]): ArmRecord | null {
  if (records.length === 0) return null

  return [...records].sort((a, b) => b.recordedAtMs - a.recordedAtMs || (a.id < b.id ? 1 : -1))[0]!
}

/**
 * Was this service's arm decided before it opened?
 *
 * An arm recorded after the first guest scanned is an arm that could have been
 * chosen once the night was already going well.
 */
export function wasDecidedBeforeOpen(
  records: readonly ArmRecord[],
  serviceStartedAtMs: number
): boolean {
  const original = [...records].sort((a, b) => a.recordedAtMs - b.recordedAtMs)[0]
  return original !== undefined && original.recordedAtMs <= serviceStartedAtMs
}

/**
 * Does this history only ever add?
 *
 * Given the rows as they exist now, every correction must name what it
 * supersedes and no two rows may claim the same predecessor. The database
 * enforces the absence of updates; this catches a correction chain that has
 * been tampered with.
 */
export function isAppendOnly(records: readonly ArmRecord[]): boolean {
  const superseded = records.map((r) => r.supersedesId).filter((s): s is string => Boolean(s))

  if (new Set(superseded).size !== superseded.length) return false

  const ids = new Set(records.map((r) => r.id))
  return superseded.every((s) => ids.has(s))
}
