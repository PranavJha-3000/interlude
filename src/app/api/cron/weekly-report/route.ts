import { db } from '@/lib/db'
import { pruneExpiredIdentities } from '@/lib/loyalty'
import { sendEmail, isEmailConfigured } from '@/lib/email'
import { getDashboardData } from '@/lib/dashboard'
import { buildWeeklyReport, type ReportedService } from '@/core/measurement/weekly-report'

export const dynamic = 'force-dynamic'

/**
 * The Monday 09:00 email (§9.4), driven by Vercel Cron.
 *
 * It reads through `getDashboardData`, so the figures and the caveat are the
 * same ones the screen shows. Building them here independently would let the
 * two drift, and the operator would discover the drift at the worst moment.
 *
 * **Authorised by a shared secret, not by obscurity.** A route that emails
 * every operator their venue's numbers is not something to leave open because
 * the path is hard to guess.
 */
function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  // No secret configured means the route refuses rather than runs open. A cron
  // that silently stops is a missing email; a cron anyone can trigger is a
  // venue's P&L on request.
  if (!secret) return false

  const header = request.headers.get('authorization')
  return header === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return new Response('Not found', { status: 404 })
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const venues = await db.venue.findMany({
    where: { onboardingStep: 'DONE' },
    select: {
      id: true,
      name: true,
      operators: { select: { email: true } },
      services: {
        where: { startedAt: { gte: weekAgo } },
        orderBy: { startedAt: 'asc' },
        select: { id: true, name: true, arm: true, serviceDate: true },
      },
    },
  })

  let sent = 0
  let pruned = 0
  const skipped: string[] = []

  for (const venue of venues) {
    // DPDP storage limitation, swept weekly. Deliberately before the report and
    // outside the email guard: a venue with no operator to mail still must not
    // keep a guest's hash past its own expiry.
    pruned += await pruneExpiredIdentities(venue.id, Date.now())

    const recipients = venue.operators.map((o) => o.email).filter(Boolean)
    if (recipients.length === 0) {
      skipped.push(`${venue.name}: no operator to send to`)
      continue
    }

    const reported: ReportedService[] = []
    for (const service of venue.services) {
      const data = await getDashboardData(venue.id, service.id)
      reported.push({
        serviceName: service.name,
        serviceDateMs: service.serviceDate.getTime(),
        arm: service.arm,
        netContributionPaise: data.contribution.netContributionPaise,
        addOnContributionPaise: data.contribution.addOnContributionPaise,
        prizeCostPaise: data.contribution.prizeCostPaise,
        runsOpened: data.metrics.runsOpened,
        tablesTented: data.metrics.tablesTented,
        scanRatePct: data.metrics.scanRatePct,
        completionRatePct: data.metrics.completionRatePct,
        tier: data.tier,
      })
    }

    const report = buildWeeklyReport(venue.name, reported)

    if (!isEmailConfigured()) {
      // Same refusal `email.ts` makes everywhere else: a deployment with no key
      // is an outage, not a quiet fallback. Reported, not swallowed.
      skipped.push(`${venue.name}: email is not configured`)
      continue
    }

    for (const to of recipients) {
      await sendEmail({
        to,
        subject: report.subject,
        text: report.lines.join('\n'),
      })
      sent++
    }
  }

  return Response.json({ venues: venues.length, sent, pruned, skipped })
}
