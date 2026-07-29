import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { formatPaise } from '@/lib/money'
import { readStaffSession } from '@/lib/staff-session'
import { getOperatorWithoutVenue } from '@/lib/operator-session'
import { getArmRows, getOpenService } from '@/lib/service'
import { partitionByArm } from '@/core/measurement/arm-assignment'
import { summariseContribution, summariseEngagement } from '@/core/measurement/contribution'
import { countScannedTreatmentTables } from '@/core/measurement/funnel'

export const dynamic = 'force-dynamic'

/**
 * The owner dashboard, wave 1 (PLATFORM.md §9).
 *
 * Leads with one number, and that number is **net contribution in rupees** —
 * not plays, not scans, not engagement. An operator does not renew because
 * people had fun; he renews because the night was worth more than it cost.
 *
 * This is tier 1: computed from the app's own confirmed rows. Tier 2 — the
 * POS-backed attach-rate delta — takes over the headline once a bill export
 * exists, in wave 2. The two are shown together and never merged, and the
 * caveat on tier 1 is not optional copy.
 */
export default async function DashPage() {
  // Staff lose access to /dash — a server must never be shown a metric
  // (PLATFORM.md §3). Only an operator's own magic-link session gets in; a
  // staff session that lands here is sent back to the floor, not shown a
  // partial dashboard.
  const operator = await getOperatorWithoutVenue()
  if (!operator) {
    const staff = await readStaffSession()
    if (staff) redirect('/floor')
    redirect('/signin')
  }

  // Signup and sign-in are the same request (see operator-auth.ts), so a
  // brand-new operator has a session but no venue yet. Onboarding does not
  // exist yet, so they land on the same empty state as a venue with no
  // service, rather than being bounced back to /signin with no explanation.
  if (!operator.venueId) {
    return (
      <Shell>
        <p className="text-lg text-muted">{en.dash.empty}</p>
      </Shell>
    )
  }

  const venueId = operator.venueId

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const service = await getOpenService(venueId)

  const target =
    service ??
    (await db.service.findFirst({
      where: { venueId },
      orderBy: { startedAt: 'desc' },
    }))

  if (!target) {
    return (
      <Shell>
        <p className="text-lg text-muted">{en.dash.empty}</p>
      </Shell>
    )
  }

  const [addOns, awards, armRows, tables, sessions, plays] = await Promise.all([
    db.addOnRequest.findMany({
      where: { status: 'ACKED', guestSession: { serviceId: target.id } },
      select: { qty: true, pricePaise: true, foodCostPaise: true },
    }),
    db.award.findMany({
      where: { status: 'CONFIRMED', play: { guestSession: { serviceId: target.id } } },
      select: { kind: true, valuePaise: true, foodCostPaise: true },
    }),
    getArmRows(target.id),
    db.table.findMany({ where: { venueId, active: true }, select: { id: true } }),
    db.guestSession.findMany({ where: { serviceId: target.id }, select: { tableId: true } }),
    db.play.findMany({
      where: { guestSession: { serviceId: target.id } },
      select: { completedAt: true },
    }),
  ])

  const money = summariseContribution(addOns, awards)

  const { treatment } = partitionByArm(
    armRows,
    tables.map((t) => t.id),
    now
  )
  const engagement = summariseEngagement({
    tentedTables: treatment.length,
    // The same treatment-filtered count `/dash/activity` prints, from the same
    // function — an unfiltered set here counts tables that are not in the
    // denominator and can report a scan rate above 100%.
    scannedTables: countScannedTreatmentTables(treatment, sessions),
    roundsStarted: plays.length,
    roundsCompleted: plays.filter((p) => p.completedAt !== null).length,
  })

  const negative = money.netContributionPaise < 0

  return (
    <Shell>
      {/* One number, large. Everything else is collapsible detail. */}
      <section>
        <p className="text-sm tracking-wide text-muted uppercase">{en.dash.tier1.headline}</p>
        <p
          className={`mt-1 text-6xl font-semibold tabular-nums ${negative ? 'text-bad' : 'text-ink'}`}
        >
          {formatPaise(money.netContributionPaise)}
        </p>
        <p className="mt-4 max-w-prose text-sm leading-relaxed text-muted">
          {en.dash.tier1.caveat}
        </p>
      </section>

      <section className="mt-10 grid grid-cols-2 gap-3">
        <Stat label={en.dash.tier1.addOnGross} value={formatPaise(money.addOnGrossPaise)} />
        <Stat
          label={en.dash.tier1.addOnContribution}
          value={formatPaise(money.addOnContributionPaise)}
        />
        <Stat label={en.dash.tier1.prizeCost} value={formatPaise(money.prizeCostPaise)} />
        <Stat label={en.dash.tier1.redemptions} value={String(money.awardCount)} />
      </section>

      {/* Tier 2 placeholder — present so the operator knows the real number is
          coming, and so tier 1 is never mistaken for it. */}
      <section className="mt-10 rounded-2xl border border-line bg-warm p-5">
        <p className="text-sm tracking-wide text-muted uppercase">{en.dash.tier2.headline}</p>
        <p className="mt-1 text-2xl text-muted">{en.dash.tier2.pending}</p>
        <p className="mt-2 text-sm text-muted">{en.dash.tier2.comparison}</p>
      </section>

      <details className="mt-8">
        <summary className="cursor-pointer text-sm text-muted">Engagement</summary>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Stat label={en.dash.tier1.scans} value={`${engagement.scannedTables}`} />
          <Stat label="Tented tables" value={`${engagement.tentedTables}`} />
          <Stat label="Scan rate" value={`${engagement.scanRatePct}%`} />
          <Stat label="Completion" value={`${engagement.completionRatePct}%`} />
        </div>
      </details>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-5 py-10">
      <h1 className="mb-8 text-xs tracking-widest text-muted uppercase">{en.dash.heading}</h1>
      {children}
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-warm p-4">
      <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}
