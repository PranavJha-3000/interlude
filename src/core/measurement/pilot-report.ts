/**
 * The pooled pilot report (PLATFORM.md §9a) — the statistics behind
 * `scripts/pilot-report.mts`. Pure: counts in, numbers out, no I/O.
 *
 * The design constraint it encodes: a weekend produces exact **counts**,
 * usable **rates** (±~6pp at n≈200), and **deltas** it cannot honestly claim.
 * So every rate carries a 95% interval, and a delta carries one plus the words
 * "not yet conclusive" until the interval excludes zero. Publishing the delta
 * early spends the credibility honest measurement is the differentiator for.
 */

export interface RateEstimate {
  numerator: number
  denominator: number
  /** 0–1 point estimate, or null when the denominator is 0. */
  rate: number | null
  /** 95% Wilson interval, 0–1. Null when the denominator is 0. */
  low: number | null
  high: number | null
}

const Z = 1.959964 // 95%

/**
 * Wilson score interval — behaves at small n and at rates near 0 or 1, both of
 * which a pilot weekend will actually produce. A plain Wald interval at
 * 3/12 tables would claim precision it does not have.
 */
export function rateWithInterval(numerator: number, denominator: number): RateEstimate {
  if (denominator <= 0 || numerator < 0 || numerator > denominator) {
    return { numerator, denominator, rate: null, low: null, high: null }
  }
  const n = denominator
  const p = numerator / n
  const z2 = Z * Z
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n)
  const half = (Z / (1 + z2 / n)) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))
  return {
    numerator,
    denominator,
    rate: p,
    low: Math.max(0, centre - half),
    high: Math.min(1, centre + half),
  }
}

export interface DeltaEstimate {
  /** Percentage-point difference, treatment minus control. Null when either arm is empty. */
  deltaPp: number | null
  lowPp: number | null
  highPp: number | null
  /**
   * True only when the interval excludes zero. Until then the report prints
   * the number with "not yet conclusive" — never as a finding.
   */
  conclusive: boolean
}

/** Two-proportion delta with a Wald interval on the difference. */
export function deltaWithInterval(
  treatmentNum: number,
  treatmentDen: number,
  controlNum: number,
  controlDen: number
): DeltaEstimate {
  if (treatmentDen <= 0 || controlDen <= 0) {
    return { deltaPp: null, lowPp: null, highPp: null, conclusive: false }
  }
  const p1 = treatmentNum / treatmentDen
  const p2 = controlNum / controlDen
  const se = Math.sqrt(
    (p1 * (1 - p1)) / treatmentDen + (p2 * (1 - p2)) / controlDen
  )
  const delta = p1 - p2
  const low = delta - Z * se
  const high = delta + Z * se
  return {
    deltaPp: delta * 100,
    lowPp: low * 100,
    highPp: high * 100,
    conclusive: low > 0 || high < 0,
  }
}

/** One venue's weekend, as counts. Everything else is derived. */
export interface VenueCounts {
  slug: string
  name: string
  tablesTented: number
  tablesScanned: number
  runsStarted: number
  runsCompleted: number
  runsWithAddOn: number
  confirmedAddOns: number
  addOnGrossPaise: number
  addOnContributionPaise: number
  prizeCostPaise: number
  prizesClaimed: number
  /** The delta's arms, when the venue ran a control. Bill-backed, often 0. */
  treatmentTables: number
  treatmentAttached: number
  controlTables: number
  controlAttached: number
}

export interface VenueReport extends VenueCounts {
  scanRate: RateEstimate
  completionRate: RateEstimate
  addOnConversion: RateEstimate
  netContributionPaise: number
}

export interface PooledReport {
  venues: VenueReport[]
  pooled: VenueReport
  attachDelta: DeltaEstimate
}

function deriveOne(counts: VenueCounts): VenueReport {
  return {
    ...counts,
    scanRate: rateWithInterval(counts.tablesScanned, counts.tablesTented),
    completionRate: rateWithInterval(counts.runsCompleted, counts.runsStarted),
    addOnConversion: rateWithInterval(counts.runsWithAddOn, counts.tablesScanned),
    netContributionPaise: counts.addOnContributionPaise - counts.prizeCostPaise,
  }
}

/**
 * Pool by summing counts, never by averaging rates — a 40-table venue and an
 * 8-table venue pooled as an average of two percentages would let the small
 * one swing the number it cannot support.
 */
export function pilotReport(venues: VenueCounts[]): PooledReport {
  const zero: VenueCounts = {
    slug: 'pooled',
    name: 'All venues, pooled',
    tablesTented: 0,
    tablesScanned: 0,
    runsStarted: 0,
    runsCompleted: 0,
    runsWithAddOn: 0,
    confirmedAddOns: 0,
    addOnGrossPaise: 0,
    addOnContributionPaise: 0,
    prizeCostPaise: 0,
    prizesClaimed: 0,
    treatmentTables: 0,
    treatmentAttached: 0,
    controlTables: 0,
    controlAttached: 0,
  }

  const summed = venues.reduce(
    (acc, v) => ({
      ...acc,
      tablesTented: acc.tablesTented + v.tablesTented,
      tablesScanned: acc.tablesScanned + v.tablesScanned,
      runsStarted: acc.runsStarted + v.runsStarted,
      runsCompleted: acc.runsCompleted + v.runsCompleted,
      runsWithAddOn: acc.runsWithAddOn + v.runsWithAddOn,
      confirmedAddOns: acc.confirmedAddOns + v.confirmedAddOns,
      addOnGrossPaise: acc.addOnGrossPaise + v.addOnGrossPaise,
      addOnContributionPaise: acc.addOnContributionPaise + v.addOnContributionPaise,
      prizeCostPaise: acc.prizeCostPaise + v.prizeCostPaise,
      prizesClaimed: acc.prizesClaimed + v.prizesClaimed,
      treatmentTables: acc.treatmentTables + v.treatmentTables,
      treatmentAttached: acc.treatmentAttached + v.treatmentAttached,
      controlTables: acc.controlTables + v.controlTables,
      controlAttached: acc.controlAttached + v.controlAttached,
    }),
    zero
  )

  return {
    venues: venues.map(deriveOne),
    pooled: deriveOne(summed),
    attachDelta: deltaWithInterval(
      summed.treatmentAttached,
      summed.treatmentTables,
      summed.controlAttached,
      summed.controlTables
    ),
  }
}
