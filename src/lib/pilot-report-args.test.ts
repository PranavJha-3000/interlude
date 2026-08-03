import { describe, expect, it } from 'vitest'

import { parsePilotReportArgs } from '@/lib/pilot-report-args'

/**
 * `scripts/pilot-report.mts` used to call `venue.findMany()` with no filter, so
 * it pooled whatever happened to be in the database. That is fine right up
 * until somebody smoke-tests a deployment: a throwaway venue you actually open
 * a service on and play a round through enters the pilot's scan rate, add-on
 * count and contribution. Pooled across ~200 tented tables, a handful of fake
 * rows is not noise — and the pooled rate is one of the three things the MLP
 * claims.
 *
 * So which venues are in the pilot becomes a stated argument rather than an
 * accident of the database.
 */

describe('parsePilotReportArgs', () => {
  it('defaults to the last 7 days and every venue', () => {
    const args = parsePilotReportArgs([])
    expect(args.days).toBe(7)
    expect(args.venueSlugs).toBeNull()
  })

  it('still takes the day count as a bare first argument', () => {
    // The old call shape. Breaking it would break the habit of whoever runs it.
    expect(parsePilotReportArgs(['14']).days).toBe(14)
  })

  it('reads an allowlist from --venues', () => {
    const args = parsePilotReportArgs(['--venues=bandra-social,koramangala-toit'])
    expect(args.venueSlugs).toEqual(['bandra-social', 'koramangala-toit'])
  })

  it('takes days and an allowlist together, in either order', () => {
    const a = parsePilotReportArgs(['14', '--venues=one,two'])
    const b = parsePilotReportArgs(['--venues=one,two', '14'])
    expect(a).toEqual({ days: 14, venueSlugs: ['one', 'two'] })
    expect(b).toEqual({ days: 14, venueSlugs: ['one', 'two'] })
  })

  it('accepts --venues one,two as a separate argument', () => {
    expect(parsePilotReportArgs(['--venues', 'one,two']).venueSlugs).toEqual(['one', 'two'])
  })

  it('trims whitespace and drops empty entries', () => {
    expect(parsePilotReportArgs(['--venues=one, two ,,three']).venueSlugs).toEqual([
      'one',
      'two',
      'three',
    ])
  })

  it('treats an allowlist of nothing but separators as no allowlist', () => {
    expect(parsePilotReportArgs(['--venues=,,']).venueSlugs).toBeNull()
  })

  it('rejects a non-numeric day count rather than reporting on NaN days', () => {
    // `since` is computed from this. NaN would silently become an epoch-wide
    // window, and the report would look plausible.
    expect(() => parsePilotReportArgs(['last-week'])).toThrow(/days/i)
  })

  it('rejects a day count of zero or less', () => {
    expect(() => parsePilotReportArgs(['0'])).toThrow(/days/i)
    expect(() => parsePilotReportArgs(['-3'])).toThrow(/days/i)
  })
})
