import { describe, expect, it } from 'vitest'
import { deltaWithInterval, pilotReport, rateWithInterval, type VenueCounts } from './pilot-report'

function venue(overrides: Partial<VenueCounts>): VenueCounts {
  return {
    slug: 'v',
    name: 'Venue',
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
    ...overrides,
  }
}

describe('rateWithInterval', () => {
  it('a pooled weekend rate at n=200 carries roughly a ±6pp interval', () => {
    // 50/200 scanned — the shape §9a plans around.
    const est = rateWithInterval(50, 200)
    expect(est.rate).toBe(0.25)
    const halfWidth = ((est.high! - est.low!) / 2) * 100
    expect(halfWidth).toBeGreaterThan(4)
    expect(halfWidth).toBeLessThan(7)
  })

  it('stays inside [0,1] at the edges where Wald would not', () => {
    const zero = rateWithInterval(0, 12)
    expect(zero.low).toBe(0)
    expect(zero.high).toBeGreaterThan(0)

    const all = rateWithInterval(12, 12)
    expect(all.high).toBe(1)
    expect(all.low).toBeLessThan(1)
  })

  it('an empty denominator is null, never NaN or a fake zero', () => {
    const est = rateWithInterval(0, 0)
    expect(est.rate).toBeNull()
    expect(est.low).toBeNull()
  })
})

describe('deltaWithInterval', () => {
  it('a weekend-sized delta spans zero and is labelled inconclusive', () => {
    // 25% vs 20% at ~100 tables per arm — a plausible real effect that a
    // single weekend cannot resolve. The label is the product's honesty.
    const delta = deltaWithInterval(25, 100, 20, 100)
    expect(delta.deltaPp).toBeCloseTo(5, 5)
    expect(delta.lowPp!).toBeLessThan(0)
    expect(delta.conclusive).toBe(false)
  })

  it('a large-sample delta with the interval clear of zero is conclusive', () => {
    const delta = deltaWithInterval(250, 1000, 200, 1000)
    expect(delta.conclusive).toBe(true)
    expect(delta.lowPp!).toBeGreaterThan(0)
  })

  it('an absent control arm produces no delta at all', () => {
    const delta = deltaWithInterval(25, 100, 0, 0)
    expect(delta.deltaPp).toBeNull()
    expect(delta.conclusive).toBe(false)
  })
})

describe('pilotReport', () => {
  it('pools by summing counts, never averaging rates', () => {
    const big = venue({ slug: 'big', tablesTented: 90, tablesScanned: 9 }) // 10%
    const small = venue({ slug: 'small', tablesTented: 10, tablesScanned: 9 }) // 90%
    const report = pilotReport([big, small])
    // Summed: 18/100 = 18%, not the 50% an average of rates would claim.
    expect(report.pooled.scanRate.rate).toBeCloseTo(0.18, 10)
  })

  it('a seeded synthetic weekend reports the known ground truth end to end', () => {
    // Two venues, hand-built: 60 tented, 24 scanned (40%), 20 runs started,
    // 15 completed (75%), 10 with an add-on. Money: ₹2,400 add-on gross,
    // ₹1,500 contribution, ₹400 prize cost → net ₹1,100.
    const a = venue({
      slug: 'a',
      tablesTented: 40,
      tablesScanned: 16,
      runsStarted: 12,
      runsCompleted: 9,
      runsWithAddOn: 6,
      confirmedAddOns: 7,
      addOnGrossPaise: 160000,
      addOnContributionPaise: 100000,
      prizeCostPaise: 30000,
      treatmentTables: 20,
      treatmentAttached: 8,
      controlTables: 20,
      controlAttached: 6,
    })
    const b = venue({
      slug: 'b',
      tablesTented: 20,
      tablesScanned: 8,
      runsStarted: 8,
      runsCompleted: 6,
      runsWithAddOn: 4,
      confirmedAddOns: 4,
      addOnGrossPaise: 80000,
      addOnContributionPaise: 50000,
      prizeCostPaise: 10000,
      treatmentTables: 10,
      treatmentAttached: 4,
      controlTables: 10,
      controlAttached: 3,
    })

    const report = pilotReport([a, b])
    expect(report.pooled.tablesTented).toBe(60)
    expect(report.pooled.scanRate.rate).toBeCloseTo(0.4, 10)
    expect(report.pooled.completionRate.rate).toBeCloseTo(0.75, 10)
    expect(report.pooled.netContributionPaise).toBe(110000)
    // The delta exists (12/30 vs 9/30) but a sample this size cannot claim it.
    expect(report.attachDelta.deltaPp).toBeCloseTo(10, 5)
    expect(report.attachDelta.conclusive).toBe(false)
    // Per-venue rows survive alongside the pooled one.
    expect(report.venues).toHaveLength(2)
    expect(report.venues[0]!.netContributionPaise).toBe(70000)
  })
})
