import { redirect } from 'next/navigation'
import QRCode from 'qrcode'
import { db } from '@/lib/db'
import { BRAND } from '@/brand'
import { en } from '@/strings/en'
import { readStaffSession } from '@/lib/staff-session'
import { getOperatorWithoutVenue } from '@/lib/operator-session'
import { publicBaseUrl } from '@/lib/base-url'
import { compareLabels } from '@/core/measurement/arm-assignment'

export const dynamic = 'force-dynamic'

/**
 * Printable table tents (REVAMP-BRIEF.md Part 6): a physical object that
 * exists to get scanned. 105×148mm — A6, four to an A4 sheet — cut on the
 * solid lines, fold on the dashed one. The top half is printed upside-down,
 * so the folded tent has a deliberate back face rather than a blank one: the
 * wordmark and the table number, legible from a standing server's eye height.
 *
 * Laser-safe and greyscale-safe by construction: nothing on the sheet is
 * tinted, and the QR is pure black on pure white with its full quiet zone —
 * a tinted QR is a scan failure, and a scan failure is the entire funnel.
 *
 * A plain print stylesheet, deliberately not a generated PDF: a venue prints
 * these on whatever is in the back office, and the browser's print dialog is
 * a thing every manager already knows.
 */
export default async function TentsPage() {
  // Two sessions can legitimately reach this page. The owner reaches it from
  // the /dash nav on their own laptop; a manager reaches it from the venue
  // tablet, which only ever holds a staff PIN session. Operator first, so an
  // owner signed into both on one machine is scoped to their own venue.
  const operator = await getOperatorWithoutVenue()
  const staff = operator ? null : await readStaffSession()
  const venueId = operator?.venueId ?? staff?.venueId ?? null

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
      // `margin` is the quiet zone in modules, and it is not whitespace we can
      // trim to taste — a scanner uses it to find the symbol's edge. 4 is the
      // spec minimum.
      svg: await QRCode.toString(`${base}/t/${t.qrToken}`, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 4,
        // Pure black on pure white, never the palette. A tinted QR is a
        // scan-rate problem dressed as a brand decision.
        color: { dark: '#000000ff', light: '#ffffffff' },
      }),
    }))
  )

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 print:m-0 print:max-w-none print:p-0">
      {/* Print geometry, not theme — the tent is a 105×148mm object and the
          sheet is A4. Screen keeps a responsive preview of the same markup. */}
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          .tent { width: 105mm; height: 148mm; }
        }
      `}</style>

      <div className="mb-8 print:hidden">
        <h1 className="text-2xl font-semibold">{en.tents.heading}</h1>
        <p className="mt-2 max-w-prose text-muted">{en.tents.intro(tents.length)}</p>
      </div>

      <div className="grid grid-cols-2 gap-6 print:gap-0">
        {tents.map((t) => (
          <article
            key={t.label}
            className="tent flex break-inside-avoid flex-col overflow-hidden border border-line bg-white text-center print:border-black"
          >
            {/* The back face — printed upside-down so the folded tent reads
                from the other side of the table. Wordmark in the display
                face (its third sanctioned place), table number at standing
                eye height. */}
            <div className="flex flex-1 rotate-180 flex-col items-center justify-center border-b border-dashed border-line px-4 print:border-black">
              <p className="font-display text-3xl">{BRAND.name}</p>
              <p className="mt-1 text-xs tracking-widest uppercase">{venue.name}</p>
              <p className="mt-3 font-mono text-6xl font-semibold tabular-nums">{t.label}</p>
            </div>

            {/* The front face: the pitch, the code, the table. */}
            <div className="flex flex-1 flex-col items-center justify-center px-4 py-4">
              <p className="text-xs tracking-widest uppercase">{venue.name}</p>
              <p className="mt-2 text-lg leading-snug font-semibold text-balance">
                {en.tents.pitch}
              </p>

              <div className="mt-3 w-36" aria-hidden dangerouslySetInnerHTML={{ __html: t.svg }} />

              <p className="mt-2 font-mono text-4xl font-semibold tabular-nums">{t.label}</p>
              <p className="mt-2 text-[10px] tracking-wide">
                {BRAND.name} · {en.tents.meta}
              </p>
            </div>
          </article>
        ))}
      </div>
    </main>
  )
}
