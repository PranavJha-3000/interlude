/**
 * How long until the food lands? (PLATFORM.md §5, §10.)
 *
 * Pure: the caller passes the fire time, the courses, and the venue's own
 * configured minutes. No clock, no I/O — the estimate is what the `PosAdapter`
 * persists as `OrderFire.estReadyAt`, and the climb's run window is derived
 * from it.
 *
 * **We take the earliest course, not the latest.** This is the one decision in
 * the file and it used to run the other way. The run has to be over before the
 * food arrives, so an estimate that is too early costs a guest a shorter climb,
 * while one that is too late has them playing with a plate in front of them —
 * which is the exact failure `countdownBufferSec` exists to prevent. Starters
 * at 8 minutes and mains at 18 means the table is interrupted at 8.
 */

export interface PrepMinutes {
  readonly [category: string]: number
}

const MS_PER_MINUTE = 60_000

/** A configured prep time we can actually act on. */
function usableMinutes(value: number | undefined): number | null {
  if (value === undefined) return null
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

/**
 * @param courses Menu categories the floor reported. Empty is normal and means
 *   the server fired without naming them — one tap is the busy-night default.
 * @param defaultPrepMinutes The venue's own answer to "how long, typically?".
 *   Config, never a constant, so a venue that runs slow can say so.
 */
export function estimateReadyAtMs(
  firedAtMs: number,
  courses: readonly string[],
  prepMinutes: PrepMinutes,
  defaultPrepMinutes: number
): number {
  let earliest: number | null = null

  for (const course of courses) {
    const minutes = usableMinutes(prepMinutes[course])
    if (minutes === null) continue
    if (earliest === null || minutes < earliest) earliest = minutes
  }

  // No courses named, or none of them configured — fall back to the venue's
  // typical. A course we have never heard of tells us nothing, so it must not
  // read as "instant".
  const minutes = earliest ?? usableMinutes(defaultPrepMinutes) ?? 0

  return firedAtMs + Math.round(minutes * MS_PER_MINUTE)
}
