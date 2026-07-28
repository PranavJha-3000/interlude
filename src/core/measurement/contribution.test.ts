import { describe, expect, it } from 'vitest'
import {
  summariseContribution,
  summariseEngagement,
  type ConfirmedAddOn,
  type ConfirmedAward,
} from './contribution'

describe('the operator sees contribution, not revenue', () => {
  it('reports what the venue keeps, not what the guest spent', () => {
    const addOns: ConfirmedAddOn[] = [{ qty: 1, pricePaise: 29900, foodCostPaise: 8600 }]
    const s = summariseContribution(addOns, [])
    expect(s.addOnGrossPaise).toBe(29900)
    expect(s.addOnContributionPaise).toBe(21300)
    expect(s.netContributionPaise).toBe(21300)
  })

  it('multiplies by quantity', () => {
    const s = summariseContribution([{ qty: 3, pricePaise: 10000, foodCostPaise: 4000 }], [])
    expect(s.addOnGrossPaise).toBe(30000)
    expect(s.addOnContributionPaise).toBe(18000)
    expect(s.addOnCount).toBe(3)
  })

  it('subtracts what the prizes actually cost', () => {
    const addOns: ConfirmedAddOn[] = [{ qty: 1, pricePaise: 20000, foodCostPaise: 5000 }]
    const awards: ConfirmedAward[] = [{ kind: 'FREE', valuePaise: 29900, foodCostPaise: 8600 }]
    const s = summariseContribution(addOns, awards)
    expect(s.prizeCostPaise).toBe(8600)
    expect(s.netContributionPaise).toBe(15000 - 8600)
  })

  it('shows a negative night rather than hiding it', () => {
    const addOns: ConfirmedAddOn[] = [{ qty: 1, pricePaise: 10000, foodCostPaise: 8000 }]
    const awards: ConfirmedAward[] = [{ kind: 'FREE', valuePaise: 30000, foodCostPaise: 12000 }]
    const s = summariseContribution(addOns, awards)
    expect(s.netContributionPaise).toBe(2000 - 12000)
    expect(s.netContributionPaise).toBeLessThan(0)
  })

  it('reports zeroes for a service where nothing happened', () => {
    const s = summariseContribution([], [])
    expect(s).toEqual({
      addOnGrossPaise: 0,
      addOnContributionPaise: 0,
      prizeCostPaise: 0,
      netContributionPaise: 0,
      addOnCount: 0,
      awardCount: 0,
    })
  })

  it('ignores a negative quantity rather than crediting it', () => {
    const s = summariseContribution([{ qty: -2, pricePaise: 10000, foodCostPaise: 3000 }], [])
    expect(s.addOnGrossPaise).toBe(0)
    expect(s.addOnCount).toBe(0)
  })

  it('stays in whole paise — no floats reach the operator', () => {
    const s = summariseContribution([{ qty: 7, pricePaise: 33333, foodCostPaise: 11111 }], [])
    expect(Number.isInteger(s.addOnGrossPaise)).toBe(true)
    expect(Number.isInteger(s.netContributionPaise)).toBe(true)
  })
})

describe('engagement rates', () => {
  it('computes scan and completion rates', () => {
    const e = summariseEngagement({
      tentedTables: 15,
      scannedTables: 6,
      roundsStarted: 6,
      roundsCompleted: 5,
    })
    expect(e.scanRatePct).toBe(40)
    expect(e.completionRatePct).toBeCloseTo(83.3, 1)
  })

  it('reports zero rather than dividing by zero before a service starts', () => {
    const e = summariseEngagement({
      tentedTables: 0,
      scannedTables: 0,
      roundsStarted: 0,
      roundsCompleted: 0,
    })
    expect(e.scanRatePct).toBe(0)
    expect(e.completionRatePct).toBe(0)
  })
})
