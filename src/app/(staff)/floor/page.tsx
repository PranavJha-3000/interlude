import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { formatPaise, guestPaysPaise } from '@/lib/money'
import { readStaffSession } from '@/lib/staff-session'
import { getArmRows, getKitchenLoad, getOpenService, getVenueConfig } from '@/lib/service'
import { armAt } from '@/core/measurement/arm-assignment'
import { Poller } from '@/app/(guest)/t/[qrToken]/Poller'
import {
  ackAddOn,
  closeService,
  confirmAward,
  fireOrder,
  openService,
  recordAddOn,
  swapArms,
} from './actions'

export const dynamic = 'force-dynamic'

/**
 * The floor console (PLATFORM.md §3, REVAMP-BRIEF.md Part 6).
 *
 * Exists to tell one person what to do, at which table, right now. At a
 * glance: what is the oldest thing waiting for me. One list, oldest first —
 * a guest waiting on a fire, a legacy add-on to ack, a prize to confirm —
 * each row is table, action, detail, age in the mono, and the oldest row sits
 * on top wearing the only border in the list.
 *
 * Below the list, the two things a server *initiates*: firing a table nobody
 * scanned, and writing down an add-on a guest asked for out loud. The server
 * is never shown a metric. Not their own, not the venue's.
 */
export default async function FloorPage() {
  const staff = await readStaffSession()
  if (!staff) return <NeedsVenueLink />

  const service = await getOpenService(staff.venueId)

  if (!service) {
    return (
      <Shell venueName={null} clock={null}>
        <p className="text-lg text-staff-muted">{en.floor.service.none}</p>
        <form action={openService} className="mt-6">
          <button
            type="submit"
            className="min-h-14 w-full rounded-xl bg-staff-ink px-5 text-lg font-semibold text-staff-ground"
          >
            {en.floor.service.start}
          </button>
        </form>
      </Shell>
    )
  }

  // Dynamic server component: one render per request, and "the time of this
  // request" is what the arm lookup and every age figure need.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  const [venue, config, load, tables, armRows, runs, addOns, awards, menu] = await Promise.all([
    db.venue.findUniqueOrThrow({ where: { id: staff.venueId }, select: { name: true } }),
    getVenueConfig(staff.venueId),
    getKitchenLoad(staff.venueId),
    db.table.findMany({
      where: { venueId: staff.venueId, active: true },
      orderBy: { label: 'asc' },
      include: {
        orderFires: { where: { serviceId: service.id }, orderBy: { firedAt: 'desc' }, take: 1 },
      },
    }),
    getArmRows(service.id),
    db.tableRun.findMany({
      where: { serviceId: service.id },
      include: { table: { select: { id: true, label: true } } },
    }),
    db.addOnRequest.findMany({
      // Tickets hang off the TableRun now; guestSession rows are climb-era.
      // Both parents are matched so old rows still surface.
      where: {
        status: 'REQUESTED',
        OR: [{ tableRun: { serviceId: service.id } }, { guestSession: { serviceId: service.id } }],
      },
      include: {
        menuItem: true,
        guestSession: { include: { table: true } },
        tableRun: { include: { table: true } },
      },
      orderBy: { requestedAt: 'asc' },
    }),
    db.award.findMany({
      where: { status: 'PENDING', tableRun: { serviceId: service.id } },
      include: { menuItem: true, tableRun: { include: { table: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.menuItem.findMany({
      where: { venueId: staff.venueId, active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, pricePaise: true },
    }),
  ])

  const killed = service.killedAt !== null
  const firedTableIds = new Set(tables.filter((t) => t.orderFires[0]).map((t) => t.id))
  const courses = Object.keys(config.prepMinutesByCategory as Record<string, number>)

  // ── The one list: everything waiting, oldest first. ─────────────────────
  type Task = {
    key: string
    tableLabel: string
    since: number
    body: React.ReactNode
  }

  const tasks: Task[] = [
    // A table with an open run and no fire is guests waiting on the clock.
    ...runs
      .filter((r) => !firedTableIds.has(r.table.id))
      .map((r) => ({
        key: `fire:${r.id}`,
        tableLabel: r.table.label,
        since: r.openedAt.getTime(),
        body: <FireForm tableId={r.table.id} courses={courses} />,
      })),
    ...addOns.map((r) => ({
      key: `ack:${r.id}`,
      tableLabel: (r.tableRun ?? r.guestSession)?.table.label ?? en.common.none,
      since: r.requestedAt.getTime(),
      body: (
        <form action={ackAddOn}>
          <input type="hidden" name="id" value={r.id} />
          <TaskButton
            detail={en.floor.addOns.line(
              (r.tableRun ?? r.guestSession)?.table.label ?? en.common.none,
              r.qty,
              r.menuItem.name
            )}
            action={en.floor.now.ackAction}
          />
        </form>
      ),
    })),
    ...awards.map((a) => ({
      key: `confirm:${a.id}`,
      tableLabel: a.tableRun?.table.label ?? en.common.none,
      since: a.createdAt.getTime(),
      body: (
        <form action={confirmAward}>
          <input type="hidden" name="id" value={a.id} />
          <TaskButton
            detail={
              a.kind === 'FREE'
                ? en.floor.redemptions.lineFree(a.menuItem.name)
                : a.kind === 'PERCENT_OFF'
                  ? en.floor.redemptions.linePercent(a.menuItem.name, a.percentOff ?? 0)
                  : en.floor.redemptions.lineFixed(
                      a.menuItem.name,
                      // What the guest hands over. Read off the award, not
                      // recomputed — the menu price may have changed since.
                      formatPaise(
                        guestPaysPaise(
                          a.kind,
                          a.menuItem.pricePaise,
                          a.percentOff ?? undefined,
                          a.fixedPricePaise ?? undefined
                        )
                      )
                    )
            }
            action={en.floor.redemptions.confirm}
          />
        </form>
      ),
    })),
  ].sort((a, b) => a.since - b.since)

  const unseatedUnfired = tables.filter(
    (t) => !t.orderFires[0] && !runs.some((r) => r.table.id === t.id)
  )
  const firedTables = tables.filter((t) => t.orderFires[0])

  return (
    <Shell
      venueName={venue.name}
      clock={new Date(now).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
    >
      <Poller everyMs={2000} />

      {/* The kitchen's state, read-only — same shape and meaning as the pass,
          no floor-specific colour. A server should not have to walk to the
          kitchen to know why the pool is thin. */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {(['GREEN', 'AMBER', 'RED'] as const).map((level) => {
          const on = load === level
          const bg =
            level === 'GREEN' ? 'bg-load-green' : level === 'AMBER' ? 'bg-load-amber' : 'bg-load-red'
          const label =
            level === 'GREEN'
              ? en.pass.load.green
              : level === 'AMBER'
                ? en.pass.load.amber
                : en.pass.load.red
          return (
            <div
              key={level}
              className={`flex min-h-9 items-center justify-center rounded-lg text-sm font-semibold tracking-wide ${
                on ? `${bg} text-staff-ground` : 'bg-panel-iron text-staff-muted'
              }`}
            >
              {label}
            </div>
          )
        })}
      </div>
      {killed && <p className="mt-2 text-xs text-load-red">{en.pass.kill.onNote}</p>}

      {/* ── Now. ──────────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-staff-muted uppercase">
          {en.floor.now.heading}
        </h2>
        {tasks.length === 0 ? (
          <p className="text-staff-muted">{en.floor.now.empty}</p>
        ) : (
          <ul className="grid gap-2">
            {tasks.map((t, i) => (
              <li
                key={t.key}
                className={`rounded-xl bg-panel-iron p-4 ${
                  i === 0 ? 'border border-staff-muted/50' : ''
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-2xl font-semibold tabular-nums">
                    {t.tableLabel}
                  </span>
                  <span
                    className={`font-mono text-sm tabular-nums ${
                      i === 0 ? 'text-staff-ink' : 'text-staff-muted'
                    }`}
                  >
                    {age(now - t.since)}
                  </span>
                </div>
                <div className="mt-2">{t.body}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Tables nobody has scanned yet — firing starts their kitchen clock
          all the same; a control table's food is just as real. ───────────── */}
      {unseatedUnfired.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-staff-muted uppercase">
            {en.floor.tables.heading}
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {unseatedUnfired.map((t) => {
              const arm = armAt(armRows, t.id, now)
              return (
                <div key={t.id} className="rounded-xl bg-panel-iron p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-2xl font-semibold tabular-nums">{t.label}</span>
                    {arm === 'CONTROL' && (
                      <span className="text-xs tracking-wide text-staff-muted uppercase">
                        {en.floor.tables.control}
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <FireForm tableId={t.id} courses={courses} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Add-ons: the guest asks out loud, the server writes it down. ──── */}
      {firedTables.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-1 text-sm font-semibold tracking-wide text-staff-muted uppercase">
            {en.floor.addOns.heading}
          </h2>
          <p className="mb-3 text-xs text-staff-muted">{en.floor.addOns.hint}</p>
          <div className="grid gap-2">
            {firedTables.map((t) => (
              <details key={t.id} className="rounded-xl bg-panel-iron">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 text-base text-staff-ink">
                  <span>{en.floor.addOns.addTo(t.label)}</span>
                  <span className="font-mono text-xs text-staff-muted tabular-nums">
                    {en.floor.tables.fired(
                      t.orderFires[0]!.firedAt.toLocaleTimeString('en-IN', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    )}
                  </span>
                </summary>
                <div className="grid grid-cols-2 gap-1 px-3 pb-3">
                  {menu.map((m) => (
                    <form key={m.id} action={recordAddOn}>
                      <input type="hidden" name="tableId" value={t.id} />
                      <input type="hidden" name="menuItemId" value={m.id} />
                      <button
                        type="submit"
                        className="transition-state flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-staff-muted/30 px-3 text-left text-sm active:border-staff-ink"
                      >
                        <span className="truncate">{m.name}</span>
                        <span className="shrink-0 font-mono text-xs text-staff-muted tabular-nums">
                          {formatPaise(m.pricePaise)}
                        </span>
                      </button>
                    </form>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      <div className="mt-10 flex gap-3 border-t border-staff-muted/20 pt-6">
        <form action={swapArms} className="flex-1">
          <button
            type="submit"
            className="min-h-12 w-full rounded-lg border border-staff-muted/40 text-sm text-staff-muted"
          >
            {en.floor.service.swap}
          </button>
        </form>
        <form action={closeService} className="flex-1">
          <button
            type="submit"
            className="min-h-12 w-full rounded-lg border border-staff-muted/40 text-sm text-staff-muted"
          >
            {en.floor.service.end}
          </button>
        </form>
      </div>
    </Shell>
  )
}

/** `mm:ss` since the row started waiting. Discrete — it moves on the poll. */
function age(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Fire the order — party size captured in the same tap flow, one thumb, no
 * keyboard, never a second screen (Part 6). Courses stay collapsed: one tap
 * fires with the venue's default prep, the chips only ever sharpen it.
 *
 * Selection is ink, not a load hue — saturation is information, and the
 * kitchen's three colours must never be spent on a checked chip.
 */
function FireForm({ tableId, courses }: { tableId: string; courses: string[] }) {
  return (
    <form action={fireOrder}>
      <input type="hidden" name="tableId" value={tableId} />
      <fieldset>
        <legend className="sr-only">{en.floor.tables.partySize}</legend>
        <div className="flex gap-1">
          {[2, 3, 4, 5].map((n) => (
            <label key={n} className="flex-1 cursor-pointer">
              <input
                type="radio"
                name="partySize"
                value={n}
                defaultChecked={n === 2}
                className="peer sr-only"
              />
              <span className="flex min-h-11 items-center justify-center rounded-lg border border-staff-muted/30 font-mono text-sm text-staff-muted tabular-nums peer-checked:border-staff-ink peer-checked:bg-staff-ink peer-checked:text-staff-ground peer-focus-visible:outline-2 peer-focus-visible:outline-staff-ink">
                {n === 5 ? '5+' : n}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {courses.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer list-none text-xs text-staff-muted underline underline-offset-2">
            {en.floor.tables.coursesToggle}
          </summary>
          <p className="mt-1 text-xs text-staff-muted">{en.floor.tables.coursesHint}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {courses.map((c) => (
              <label key={c} className="cursor-pointer">
                <input type="checkbox" name="course" value={c} className="peer sr-only" />
                <span className="flex min-h-11 items-center rounded-lg border border-staff-muted/30 px-2 text-xs text-staff-muted peer-checked:border-staff-ink peer-checked:bg-staff-ink peer-checked:text-staff-ground peer-focus-visible:outline-2 peer-focus-visible:outline-staff-ink">
                  {en.floor.tables.course(c)}
                </span>
              </label>
            ))}
          </div>
        </details>
      )}

      <button
        type="submit"
        className="transition-state mt-2 min-h-11 w-full rounded-lg bg-staff-ink text-sm font-semibold text-staff-ground active:bg-staff-muted"
      >
        {en.floor.tables.fireOrder}
      </button>
    </form>
  )
}

/**
 * A one-tap task row body: the detail on the left, the action pill on the
 * right, the whole thing the button. Ink on iron, deliberately — the accent
 * that used to fill redemption rows was the ledger's recorded drift, and
 * urgency here is carried by position and age, not by brand colour.
 */
function TaskButton({ detail, action }: { detail: string; action: string }) {
  return (
    <button
      type="submit"
      className="transition-state flex min-h-14 w-full items-center justify-between gap-4 rounded-lg bg-staff-ink px-4 text-left text-staff-ground"
    >
      <span className="min-w-0 truncate text-base">{detail}</span>
      <span className="shrink-0 rounded-md bg-staff-ground/20 px-3 py-1.5 text-sm font-semibold">
        {action}
      </span>
    </button>
  )
}

function Shell({
  venueName,
  clock,
  children,
}: {
  venueName: string | null
  clock: string | null
  children: React.ReactNode
}) {
  return (
    <main className="surface-staff min-h-dvh px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-baseline justify-between gap-3">
          <h1 className="text-xs tracking-widest text-staff-muted uppercase">
            {en.floor.signIn.heading}
          </h1>
          {venueName && (
            <p className="min-w-0 truncate text-xs tracking-widest text-staff-muted uppercase">
              {venueName}
            </p>
          )}
          {clock && (
            <p className="shrink-0 font-mono text-xs text-staff-muted tabular-nums">{clock}</p>
          )}
        </header>
        <div className="mt-2">{children}</div>
      </div>
    </main>
  )
}

/**
 * The signed-out console. Not a PIN pad and deliberately not a venue picker —
 * sign-in lives at `/floor/[venueSlug]`, because a PIN can only be checked
 * against one venue's staff, and a list of venues is a list of every restaurant
 * that is a customer.
 */
function NeedsVenueLink() {
  return (
    <main className="surface-staff flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-xs">
        <h1 className="text-2xl font-semibold">{en.floor.signIn.heading}</h1>
        <p className="mt-4 text-lg text-staff-muted">{en.floor.signIn.needsVenueLink}</p>
      </div>
    </main>
  )
}
