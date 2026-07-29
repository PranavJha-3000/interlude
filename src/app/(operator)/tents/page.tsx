import { redirect } from 'next/navigation'
import QRCode from 'qrcode'
import { db } from '@/lib/db'
import { BRAND } from '@/brand'
import { readStaffSession } from '@/lib/staff-session'
import { getOperatorWithoutVenue } from '@/lib/operator-session'
import { publicBaseUrl } from '@/lib/base-url'
import { compareLabels } from '@/core/measurement/arm-assignment'

export const dynamic = 'force-dynamic'

/**
 * Printable table tents, one per table, with the QR a guest actually scans.
 *
 * Print to A4, cut, fold. Deliberately a plain print stylesheet rather than a
 * generated PDF: a venue prints these on whatever is in the back office, and a
 * browser's print dialog is a thing every manager already knows how to use.
 *
 * The scripted line from TODO.md wave 3 is on the tent as well as in the staff
 * briefing, because the tent is the only part guaranteed to reach the table.
 */
export default async function TentsPage() {
  // Two sessions can legitimately reach this page. The owner reaches it from
  // the /dash nav on their own laptop; a manager reaches it from the venue
  // tablet, which only ever holds a staff PIN session. Guarding on staff alone
  // bounced every operator to the floor PIN pad.
  //
  // Operator first, so an owner signed into both on one machine is scoped to
  // the venue their own session names.
  const operator = await getOperatorWithoutVenue()
  const staff = operator ? null : await readStaffSession()
  const venueId = operator?.venueId ?? staff?.venueId ?? null

  // A signed-in operator with no venue yet has nothing to print — send them to
  // the dashboard's empty state, not to a PIN pad they cannot satisfy.
  if (!venueId) redirect(operator ? '/dash' : '/floor')

  const [venue, tables] = await Promise.all([
    db.venue.findUniqueOrThrow({ where: { id: venueId } }),
    db.table.findMany({
      where: { venueId, active: true },
      select: { id: true, label: true, qrToken: true },
    }),
  ])

  const base = publicBaseUrl()
  const ordered = [...tables].sort((a, b) => compareLabels(a.label, b.label))

  const tents = await Promise.all(
    ordered.map(async (t) => ({
      label: t.label,
      url: `${base}/t/${t.qrToken}`,
      // Rendered server-side as inline SVG: no image request, no client JS,
      // and it stays crisp at whatever size it is printed.
      svg: await QRCode.toString(`${base}/t/${t.qrToken}`, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 0,
      }),
    }))
  )

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 print:max-w-none print:p-0">
      <div className="mb-8 print:hidden">
        <h1 className="text-2xl font-semibold">Table tents</h1>
        <p className="mt-2 text-muted">
          {tents.length} tables. Print to A4, cut along the lines, fold. Only tented tables can play
          — the tents are how the treatment arm is created, so put them out deliberately.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6 print:gap-0">
        {tents.map((t) => (
          <article
            key={t.label}
            className="flex break-inside-avoid flex-col items-center rounded-2xl border border-line p-6 text-center print:rounded-none print:border-dashed"
          >
            <p className="text-xs tracking-widest text-muted uppercase">{venue.name}</p>
            <p className="mt-4 text-lg font-semibold text-balance">
              Scan it while you wait — you might win dessert
            </p>

            <div className="mt-4 w-40" aria-hidden dangerouslySetInnerHTML={{ __html: t.svg }} />

            <p className="mt-4 text-4xl font-semibold tabular-nums">{t.label}</p>
            <p className="mt-1 text-[10px] break-all text-muted">{t.url}</p>
            <p className="mt-3 text-[10px] text-muted">{BRAND.name} · no app, no signup</p>
          </article>
        ))}
      </div>
    </main>
  )
}
