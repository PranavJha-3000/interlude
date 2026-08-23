/**
 * The §6.3 metrics, computed from the event log alone.
 *
 * Pure, and deliberately taking a flat list of events rather than a database
 * handle. Two consequences worth stating because they are the point:
 *
 * **Every metric is over table runs, not devices.** Four people at one table
 * are one run. Counting the devices would inflate scan rate and deflate
 * completion rate simultaneously, and both would look like product signal
 * rather than arithmetic. `devicesPerRun` is the one figure that deliberately
 * counts devices, because it is the measurement of the inheritance mechanic.
 *
 * **Abandonment is split by cause.** A run that ended because the food arrived
 * is a success wearing a failure's clothes (§6.2). Folding it into abandonment
 * makes completion rate look broken on exactly the nights the product worked.
 */

export type MetricEventType =
  | 'TENT_PRESENT'
  | 'SESSION_OPEN'
  | 'CONSENT_GIVEN'
  | 'RUN_START'
  | 'RUNG_REACHED'
  | 'RUN_END'
  | 'DEVICE_SPENT'
  | 'LIFE_EARNED'
  | 'PRIZE_TAKEN'
  | 'ADDON_REQUESTED'
  | 'ADDON_CONFIRMED'
  | 'ADDON_CANCELLED'
  | 'REVIEW_SHOWN'
  | 'REVIEW_OPENED'
  | 'REVIEW_HANDED_OFF'
  | (string & {})

export interface MetricEvent {
  type: MetricEventType
  tableRunId: string | null
  deviceSessionId: string | null
  at: number
  detail?: Record<string, unknown>
}

export interface FunnelCounts {
  tablesTented: number
  runsOpened: number
  runsStarted: number
  runsReachingARung: number
  devices: number
  prizesTaken: number
  addOnsRequested: number
  addOnsConfirmed: number
  livesEarned: number
}

export interface RunEndBreakdown {
  wrongAnswer: number
  foodArrived: number
  abandoned: number
  timeout: number
  prizeTaken: number
}

export interface Metrics extends FunnelCounts {
  /** Runs opened / tables tented. Null when nothing was tented. */
  scanRatePct: number | null
  /** Runs reaching any rung / runs started. Null when nothing started. */
  completionRatePct: number | null
  /** Mean devices per run — the inheritance mechanic's own measurement. */
  devicesPerRun: number | null
  /** Confirmed add-ons / runs opened. */
  addOnConversionPct: number | null
  runEnds: RunEndBreakdown
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.round((numerator / denominator) * 1000) / 10
}

function countDistinctRuns(events: readonly MetricEvent[], type: string): number {
  const runs = new Set<string>()
  for (const e of events) {
    if (e.type === type && e.tableRunId) runs.add(e.tableRunId)
  }
  return runs.size
}

/**
 * @param events every event for one service, in any order
 * @param tablesTented how many tables carried a tent. Passed in rather than
 *   counted from `TENT_PRESENT` when the venue records it another way — a
 *   service where nobody logged tents still has a denominator.
 */
export function computeMetrics(events: readonly MetricEvent[], tablesTented?: number): Metrics {
  const tentedFromEvents = countDistinctRuns(events, 'TENT_PRESENT')
  const tables = tablesTented ?? tentedFromEvents

  const runsOpened = countDistinctRuns(events, 'SESSION_OPEN')
  const runsStarted = countDistinctRuns(events, 'RUN_START')
  const runsReachingARung = countDistinctRuns(events, 'RUNG_REACHED')

  const devices = new Set(
    events.filter((e) => e.deviceSessionId !== null).map((e) => e.deviceSessionId!)
  ).size

  const prizesTaken = events.filter((e) => e.type === 'PRIZE_TAKEN').length
  const addOnsRequested = events.filter((e) => e.type === 'ADDON_REQUESTED').length
  const addOnsConfirmed = events.filter((e) => e.type === 'ADDON_CONFIRMED').length
  const livesEarned = events.filter((e) => e.type === 'LIFE_EARNED').length

  const runEnds: RunEndBreakdown = {
    wrongAnswer: 0,
    foodArrived: 0,
    abandoned: 0,
    timeout: 0,
    prizeTaken: 0,
  }

  for (const e of events) {
    if (e.type !== 'RUN_END') continue
    switch (e.detail?.reason) {
      case 'WRONG_ANSWER':
        runEnds.wrongAnswer++
        break
      case 'FOOD_ARRIVED':
        runEnds.foodArrived++
        break
      case 'TIMEOUT':
        runEnds.timeout++
        break
      case 'PRIZE_TAKEN':
        runEnds.prizeTaken++
        break
      default:
        // An end with no reason recorded is abandonment — the state a closed
        // tab produces, and the one nothing gets to write a tidier label for.
        runEnds.abandoned++
    }
  }

  return {
    tablesTented: tables,
    runsOpened,
    runsStarted,
    runsReachingARung,
    devices,
    prizesTaken,
    addOnsRequested,
    addOnsConfirmed,
    livesEarned,
    scanRatePct: pct(runsOpened, tables),
    completionRatePct: pct(runsReachingARung, runsStarted),
    devicesPerRun: runsOpened > 0 ? Math.round((devices / runsOpened) * 100) / 100 : null,
    addOnConversionPct: pct(addOnsConfirmed, runsOpened),
    runEnds,
  }
}

// ── Bill-backed figures ────────────────────────────────────────────────────

export interface BillForMetrics {
  tableId: string | null
  totalPaise: number
  covers: number | null
  /** Whether the bill carried at least one dessert or beverage line. */
  attached: boolean
}

export interface SpendMetrics {
  covers: number
  bills: number
  totalPaise: number
  /** **The primary figure** (§3). Spend per table is dominated by party size. */
  spendPerCoverPaise: number | null
  /** Secondary, and only meaningful next to the one above. */
  spendPerTablePaise: number | null
  /** Share of bills carrying a dessert or beverage line. */
  attachRatePct: number | null
}

/**
 * Spend, per cover first.
 *
 * Bills without a cover count contribute to the per-table figure and are
 * excluded from the per-cover one, rather than being assumed to seat two. A
 * guessed denominator is worse than a smaller honest one.
 */
export function computeSpend(bills: readonly BillForMetrics[]): SpendMetrics {
  const withCovers = bills.filter((b) => b.covers !== null && b.covers > 0)
  const covers = withCovers.reduce((sum, b) => sum + b.covers!, 0)
  const coveredTotal = withCovers.reduce((sum, b) => sum + b.totalPaise, 0)
  const totalPaise = bills.reduce((sum, b) => sum + b.totalPaise, 0)
  const attached = bills.filter((b) => b.attached).length

  return {
    covers,
    bills: bills.length,
    totalPaise,
    spendPerCoverPaise: covers > 0 ? Math.round(coveredTotal / covers) : null,
    spendPerTablePaise: bills.length > 0 ? Math.round(totalPaise / bills.length) : null,
    attachRatePct: pct(attached, bills.length),
  }
}

// ── Comparison ─────────────────────────────────────────────────────────────

export type GateVerdict = 'KILL' | 'WATCH' | 'PROCEED' | 'UNKNOWN'

export interface Comparison {
  livePaise: number | null
  baselinePaise: number | null
  deltaPct: number | null
  verdict: GateVerdict
}

/**
 * Live spend per cover against the historical same-weekday baseline (§3).
 *
 * `UNKNOWN` rather than a cheerful zero when either side is missing. The whole
 * argument for the historical baseline is that it is honest without spending a
 * live service, and inventing a number when it is absent gives that away.
 */
export function compareToBaseline(
  livePerCoverPaise: number | null,
  baselinePerCoverPaise: number | null,
  gates: { killBelowPct: number; proceedAtPct: number }
): Comparison {
  if (livePerCoverPaise === null || baselinePerCoverPaise === null || baselinePerCoverPaise <= 0) {
    return {
      livePaise: livePerCoverPaise,
      baselinePaise: baselinePerCoverPaise,
      deltaPct: null,
      verdict: 'UNKNOWN',
    }
  }

  const deltaPct =
    Math.round(((livePerCoverPaise - baselinePerCoverPaise) / baselinePerCoverPaise) * 1000) / 10

  const verdict: GateVerdict =
    deltaPct >= gates.proceedAtPct ? 'PROCEED' : deltaPct < gates.killBelowPct ? 'KILL' : 'WATCH'

  return { livePaise: livePerCoverPaise, baselinePaise: baselinePerCoverPaise, deltaPct, verdict }
}

/** Mean spend per cover across the imported same-weekday history. */
export function baselineForWeekday(
  history: readonly { weekday: number; covers: number; totalPaise: number }[],
  weekday: number
): number | null {
  const matching = history.filter((h) => h.weekday === weekday && h.covers > 0)
  if (matching.length === 0) return null

  const covers = matching.reduce((s, h) => s + h.covers, 0)
  const total = matching.reduce((s, h) => s + h.totalPaise, 0)
  return covers > 0 ? Math.round(total / covers) : null
}
