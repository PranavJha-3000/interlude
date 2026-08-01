import { describe, expect, it } from 'vitest'
import { buildWeeklyReport, type ReportedService } from './weekly-report'

/**
 * The Monday email must say the same thing the screen says. Most of these
 * assert the caveat travels with the figure — an email that flatters where the
 * dashboard is honest means the product has lied once, and the operator will
 * find out which one was lying at the worst possible moment.
 */

const service = (over: Partial<ReportedService> = {}): ReportedService => ({
  serviceName: 'Sat 4 Apr',
  serviceDateMs: Date.UTC(2026, 3, 4),
  arm: 'LIVE',
  netContributionPaise: 234000,
  addOnContributionPaise: 320000,
  prizeCostPaise: 86000,
  runsOpened: 12,
  tablesTented: 30,
  scanRatePct: 40,
  completionRatePct: 66,
  tier: 'APP_ESTIMATE',
  ...over,
})

describe('the weekly report', () => {
  it('leads with net contribution across the live services', () => {
    const r = buildWeeklyReport('The Pilot Kitchen', [service()])

    expect(r.subject).toContain('₹2,340')
    expect(r.lines.join('\n')).toContain('Net contribution')
  })

  it('carries the estimate caveat in the same words the screen uses', () => {
    const body = buildWeeklyReport('X', [service()]).lines.join('\n')

    expect(body).toContain('app-side estimate')
    expect(body).toContain('cash tips')
    expect(body).toContain('would have ordered anyway')
  })

  it('swaps the caveat once a bill export has landed', () => {
    const body = buildWeeklyReport('X', [service({ tier: 'POS_BACKED' })]).lines.join('\n')

    expect(body).toContain('bill export')
    expect(body).not.toContain('app-side estimate')
  })

  it('counts only the live services toward the money', () => {
    // A control night earns nothing by design; folding it in would drag the
    // figure down and read as the product underperforming.
    const r = buildWeeklyReport('X', [
      service({ netContributionPaise: 100000 }),
      service({ arm: 'CONTROL', netContributionPaise: 0, runsOpened: 0 }),
    ])

    expect(r.subject).toContain('₹1,000')
  })

  it('still lists the control nights, labelled', () => {
    // Half the evidence. A week that reports only the nights the product ran
    // cannot answer the question the pilot exists to ask.
    const body = buildWeeklyReport('X', [service(), service({ arm: 'CONTROL' })]).lines.join('\n')

    expect(body).toContain('(control)')
    expect(body).toContain('(live)')
  })

  it('says so when there was no control night to compare against', () => {
    const body = buildWeeklyReport('X', [service()]).lines.join('\n')

    expect(body).toContain('No control night')
  })

  it('does not say that when there was one', () => {
    const body = buildWeeklyReport('X', [service(), service({ arm: 'CONTROL' })]).lines.join('\n')

    expect(body).not.toContain('No control night')
  })

  it('reports a negative week as a negative number, not as zero', () => {
    const r = buildWeeklyReport('X', [service({ netContributionPaise: -50000 })])

    expect(r.subject).toContain('-₹500')
  })

  it('handles a week with no services without pretending it went well', () => {
    const r = buildWeeklyReport('The Pilot Kitchen', [])

    expect(r.subject).toContain('no services')
    expect(r.lines.join('\n')).toContain('nothing to report')
  })

  it('formats rupees in the Indian grouping', () => {
    const r = buildWeeklyReport('X', [service({ netContributionPaise: 12345600 })])

    expect(r.subject).toContain('₹1,23,456')
  })
})
