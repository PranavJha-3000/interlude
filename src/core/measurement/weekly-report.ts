/**
 * The Monday morning email (§9.4).
 *
 * Pure: services in, subject and body out. It carries **the same figures and
 * the same caveat** as the dashboard, and the only way to guarantee that is for
 * both to be built from the same reader — so this takes the dashboard's own
 * shape rather than querying anything itself.
 *
 * An email that flatters where the screen is honest is worse than no email:
 * the operator reads the email on the way in and the screen when something
 * looks wrong, and if they disagree the product has lied once.
 */

export interface ReportedService {
  serviceName: string
  serviceDateMs: number
  arm: 'LIVE' | 'CONTROL'
  netContributionPaise: number
  addOnContributionPaise: number
  prizeCostPaise: number
  runsOpened: number
  tablesTented: number
  scanRatePct: number | null
  completionRatePct: number | null
  tier: 'APP_ESTIMATE' | 'POS_BACKED'
}

export interface WeeklyReport {
  subject: string
  lines: string[]
  /** True when every service in the week was still on the app estimate. */
  estimateOnly: boolean
}

function rupees(paise: number): string {
  const sign = paise < 0 ? '-' : ''
  return `${sign}₹${Math.abs(Math.round(paise / 100)).toLocaleString('en-IN')}`
}

/**
 * Build the week's report.
 *
 * Control nights are included and labelled rather than filtered out. They are
 * half the evidence — a week that only reports the nights the product ran is
 * a week that cannot answer the question the pilot exists to ask.
 */
export function buildWeeklyReport(
  venueName: string,
  services: readonly ReportedService[]
): WeeklyReport {
  if (services.length === 0) {
    return {
      subject: `${venueName} — no services last week`,
      lines: [
        'No services were recorded last week, so there is nothing to report.',
        'If that is wrong, the floor console may not have opened a service.',
      ],
      estimateOnly: true,
    }
  }

  const live = services.filter((s) => s.arm === 'LIVE')
  const control = services.filter((s) => s.arm === 'CONTROL')

  const net = live.reduce((sum, s) => sum + s.netContributionPaise, 0)
  const prizeCost = live.reduce((sum, s) => sum + s.prizeCostPaise, 0)
  const runs = live.reduce((sum, s) => sum + s.runsOpened, 0)
  const estimateOnly = services.every((s) => s.tier === 'APP_ESTIMATE')

  const lines: string[] = [
    `${live.length} live ${live.length === 1 ? 'service' : 'services'}, ${control.length} control.`,
    '',
    `Net contribution across the live services: ${rupees(net)}.`,
    `Prizes cost ${rupees(prizeCost)} at cost price. ${runs} tables played.`,
    '',
    // The caveat travels with the figure, always, in the same words the screen
    // uses. It is not a footnote to be trimmed when the email gets long.
    estimateOnly
      ? 'This is an app-side estimate: spend above each table’s own baseline, minus prize cost at cost price. It is blind to cash tips, to walk-ins with no history, and to what these tables would have ordered anyway.'
      : 'Measured from your own bill export against the same-weekday baseline. Prize cost is at cost price.',
  ]

  if (control.length === 0) {
    lines.push(
      '',
      'No control night ran last week, so there is nothing to compare these figures against yet.'
    )
  }

  for (const s of services) {
    const label = s.arm === 'LIVE' ? 'live' : 'control'
    lines.push(
      '',
      `${s.serviceName} (${label}) — ${rupees(s.netContributionPaise)} net, ${s.runsOpened} of ${s.tablesTented} tables played${
        s.scanRatePct === null ? '' : ` (${s.scanRatePct}%)`
      }.`
    )
  }

  return {
    subject: `${venueName} — last week: ${rupees(net)} net contribution`,
    lines,
    estimateOnly,
  }
}
