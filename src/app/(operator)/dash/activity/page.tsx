import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { formatPaise, guestPaysPaise } from '@/lib/money'
import { getOperator } from '@/lib/operator-session'
import { getOpenService } from '@/lib/service'
import { getServiceActivity, type ActivityRow } from '@/lib/activity'

export const dynamic = 'force-dynamic'

/**
 * Which table scanned, what they played, and whether staff confirmed the prize.
 *
 * Anonymous by construction — a row is a table and a session, never a person.
 */
export default async function ActivityPage() {
  const operator = await getOperator()
  if (!operator) redirect('/signin')

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  const service =
    (await getOpenService(operator.venueId)) ??
    (await db.service.findFirst({
      where: { venueId: operator.venueId },
      orderBy: { startedAt: 'desc' },
    }))

  if (!service) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <h1 className="mb-8 text-xs tracking-widest text-muted uppercase">
          {en.dash.activity.heading}
        </h1>
        <p className="text-lg text-muted">{en.dash.empty}</p>
      </main>
    )
  }

  const { rows, controlTableLabels, funnel } = await getServiceActivity(
    service.id,
    operator.venueId,
    now
  )

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="text-xs tracking-widest text-muted uppercase">{en.dash.activity.heading}</h1>
      <p className="mt-2 text-lg tabular-nums">{en.dash.activity.funnel(funnel)}</p>

      {rows.length === 0 ? (
        <p className="mt-10 text-lg text-muted">{en.dash.activity.empty}</p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs tracking-wide text-muted uppercase">
              <tr>
                <th className="py-2 pr-4">{en.dash.activity.colTable}</th>
                <th className="py-2 pr-4">{en.dash.activity.colScanned}</th>
                <th className="py-2 pr-4">{en.dash.activity.colGame}</th>
                <th className="py-2 pr-4">{en.dash.activity.colResult}</th>
                <th className="py-2">{en.dash.activity.colClaimed}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sessionId} className="border-t border-line align-top">
                  <td className="py-3 pr-4 text-lg font-semibold tabular-nums">{r.tableLabel}</td>
                  <td className="py-3 pr-4 tabular-nums text-muted">{timeOf(r.scannedAt)}</td>
                  <td className="py-3 pr-4">{gameLabel(r.mechanic)}</td>
                  <td className="py-3 pr-4">{resultLabel(r)}</td>
                  <td className="py-3">{claimLabel(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {controlTableLabels.length > 0 && (
        <section className="mt-10 rounded-2xl border border-line bg-warm p-5">
          <p className="text-sm text-muted">{en.dash.activity.controlNote}</p>
          <p className="mt-2 text-lg tabular-nums">{controlTableLabels.join(' · ')}</p>
        </section>
      )}
    </main>
  )
}

function timeOf(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function gameLabel(mechanic: ActivityRow['mechanic']): string {
  if (mechanic === 'KITCHEN_ROUND') return en.dash.activity.gameKitchenRound
  if (mechanic === 'MYSTERY_PLATE') return en.dash.activity.gameMysteryPlate
  return '—'
}

function resultLabel(r: ActivityRow): string {
  if (r.mechanic === null) return en.dash.activity.notPlayed
  if (!r.completed) return en.dash.activity.inProgress

  const score = en.dash.activity.scoreLine(r.score ?? 0, r.maxScore ?? 0)
  if (!r.awardItemName || !r.awardKind) return score

  const pays = guestPaysPaise(
    r.awardKind,
    r.awardItemPricePaise ?? 0,
    r.awardPercentOff ?? undefined,
    r.awardFixedPricePaise ?? undefined
  )
  const depth = r.awardKind === 'FREE' ? 'free' : formatPaise(pays)
  return `${score} · ${r.awardItemName}, ${depth}`
}

function claimLabel(r: ActivityRow): string {
  if (r.awardStatus === null) return '—'
  if (r.awardStatus === 'CONFIRMED') {
    return r.confirmedAt ? `✓ ${timeOf(r.confirmedAt)}` : '✓'
  }
  return en.dash.activity.pending
}
