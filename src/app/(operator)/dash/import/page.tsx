import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { getOperatorWithoutVenue } from '@/lib/operator-session'
import { formatPaise } from '@/lib/money'
import { submitPosRefMapping, uploadBaseline, uploadBillExport } from './actions'

export const dynamic = 'force-dynamic'

/**
 * Bill import — the door tier 2 walks in through.
 *
 * Three parts: the end-of-day export upload, the unjoined bills with the
 * mapping form that resolves them (never dropped, §6.5), and the historical
 * baseline import that gives Saturday something honest to compare to.
 */

const INPUT = 'mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3 text-base'
const LABEL = 'block text-sm text-muted'
const SECTION = 'mt-8 rounded-2xl border border-line p-5'
const BUTTON = 'mt-4 min-h-11 rounded-xl bg-ink px-6 text-base font-semibold text-paper'

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const operator = await getOperatorWithoutVenue()
  if (!operator) redirect('/signin')
  if (!operator.venueId)
    return (
      <Shell>
        <p className="text-lg text-muted">{en.dash.empty}</p>
      </Shell>
    )
  const venueId = operator.venueId

  const params = await searchParams

  const [unjoined, mappings, tables, ticketCount] = await Promise.all([
    db.ticket.findMany({
      where: { tableId: null, service: { venueId } },
      select: { id: true, posRef: true, externalRef: true, totalPaise: true, closedAt: true },
      orderBy: { closedAt: 'desc' },
      take: 200,
    }),
    db.posTableMap.findMany({
      where: { venueId },
      select: { posRef: true, table: { select: { label: true } } },
      orderBy: { posRef: 'asc' },
    }),
    db.table.findMany({
      where: { venueId, active: true },
      select: { id: true, label: true },
      orderBy: { label: 'asc' },
    }),
    db.ticket.count({ where: { service: { venueId } } }),
  ])

  // One mapping form per distinct unmapped reference, not per bill.
  const unmappedRefs = [...new Set(unjoined.map((t) => t.posRef ?? ''))].filter((r) => r !== '')

  const imported = params.imported
  const history = params.history
  const error = params.error

  return (
    <Shell>
      <p className="mb-2 text-lg text-muted">{en.dash.import.body}</p>
      <p className="mb-6 font-mono text-sm text-muted">{en.dash.import.ticketsSoFar(ticketCount)}</p>

      {imported !== undefined && (
        <p className="mb-4 rounded-xl border border-line bg-warm px-4 py-3 font-mono text-sm">
          {en.dash.import.result(
            Number(imported),
            Number(params.duplicate ?? 0),
            Number(params.rejected ?? 0),
            Number(params.unattributed ?? 0)
          )}
        </p>
      )}
      {history !== undefined && (
        <p className="mb-4 rounded-xl border border-line bg-warm px-4 py-3 font-mono text-sm">
          {en.dash.import.historyResult(Number(history))}
        </p>
      )}
      {error === 'parse' && <p className="mb-4 text-sm text-bad">{en.dash.import.failed}</p>}
      {error === 'no_service' && <p className="mb-4 text-sm text-bad">{en.dash.import.noService}</p>}
      {error === 'history' && <p className="mb-4 text-sm text-bad">{en.dash.import.historyFailed}</p>}

      {/* ── The export upload ───────────────────────────────────────── */}
      <section className={SECTION}>
        <form action={uploadBillExport}>
          <label htmlFor="billFile" className={LABEL}>
            {en.dash.import.fileLabel}
          </label>
          <input
            id="billFile"
            name="billFile"
            type="file"
            required
            accept=".csv,text/csv"
            className={INPUT}
          />

          <h2 className="mt-6 text-base font-semibold">{en.dash.import.columnsHeading}</h2>
          <p className="mt-1 text-sm text-muted">{en.dash.import.columnsBody}</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-4">
            <Col name="colExternalRef" label={en.dash.import.colExternalRef} defaultValue="bill no" />
            <Col name="colPosRef" label={en.dash.import.colPosRef} defaultValue="table" />
            <Col name="colClosedAt" label={en.dash.import.colClosedAt} defaultValue="time" />
            <Col name="colTotal" label={en.dash.import.colTotal} defaultValue="total" />
            <Col name="colCovers" label={en.dash.import.colCovers} defaultValue="covers" />
            <Col name="colItemName" label={en.dash.import.colItemName} defaultValue="" />
            <Col name="colItemQty" label={en.dash.import.colItemQty} defaultValue="" />
            <Col name="colItemPrice" label={en.dash.import.colItemPrice} defaultValue="" />
          </div>

          <button type="submit" className={BUTTON}>
            {en.dash.import.submit}
          </button>
        </form>
      </section>

      {/* ── Unjoined bills + mapping ────────────────────────────────── */}
      <section className={SECTION}>
        <h2 className="text-lg font-semibold">{en.dash.import.unjoinedHeading}</h2>
        <p className="mt-1 text-sm text-muted">{en.dash.import.unjoinedBody}</p>

        {unjoined.length === 0 ? (
          <p className="mt-3 text-sm text-muted">—</p>
        ) : (
          <>
            <p className="mt-3 font-mono text-sm">{en.dash.import.unjoinedCount(unjoined.length)}</p>
            <ul className="mt-3">
              {unmappedRefs.map((posRef) => (
                <li key={posRef} className="border-t border-line py-3">
                  <form action={submitPosRefMapping} className="flex items-end gap-3">
                    <input type="hidden" name="posRef" value={posRef} />
                    <div className="flex-1">
                      <label htmlFor={`map-${posRef}`} className={LABEL}>
                        {en.dash.import.mapLabel(posRef)}
                      </label>
                      <select id={`map-${posRef}`} name="tableId" required className={INPUT}>
                        {tables.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="submit"
                      className="min-h-11 rounded-xl border-2 border-line px-5 text-sm font-semibold"
                    >
                      {en.dash.import.mapSubmit}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            <ul className="mt-4">
              {unjoined.slice(0, 20).map((t) => (
                <li key={t.id} className="flex gap-3 border-t border-line py-2 font-mono text-xs text-muted">
                  <span>{t.externalRef}</span>
                  <span>“{t.posRef}”</span>
                  <span className="ml-auto">{formatPaise(t.totalPaise)}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <h3 className="mt-6 text-base font-semibold">{en.dash.import.mappingsHeading}</h3>
        {mappings.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{en.dash.import.mappingsNone}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {mappings.map((m) => (
              <li key={m.posRef} className="rounded-xl border border-line px-3 py-1 font-mono text-xs">
                “{m.posRef}” → {m.table.label}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Historical baseline ─────────────────────────────────────── */}
      <section className={SECTION}>
        <h2 className="text-lg font-semibold">{en.dash.import.historyHeading}</h2>
        <p className="mt-1 text-sm text-muted">{en.dash.import.historyBody}</p>
        <form action={uploadBaseline} className="mt-3">
          <label htmlFor="baselineFile" className={LABEL}>
            {en.dash.import.historyFile}
          </label>
          <input
            id="baselineFile"
            name="baselineFile"
            type="file"
            required
            accept=".csv,text/csv"
            className={INPUT}
          />
          <button type="submit" className={BUTTON}>
            {en.dash.import.historySubmit}
          </button>
        </form>
      </section>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="mb-2 text-xs tracking-widest text-muted uppercase">
        {en.dash.import.heading}
      </h1>
      {children}
    </main>
  )
}

function Col({
  name,
  label,
  defaultValue,
}: {
  name: string
  label: string
  defaultValue: string
}) {
  return (
    <div>
      <label htmlFor={name} className={LABEL}>
        {label}
      </label>
      <input id={name} name={name} defaultValue={defaultValue} className={INPUT + ' font-mono'} />
    </div>
  )
}
