import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { formatPaise, guestPaysPaise } from '@/lib/money'
import { readStaffSession } from '@/lib/staff-session'
import { getArmRows, getOpenService } from '@/lib/service'
import { armAt } from '@/core/measurement/arm-assignment'
import { Poller } from '@/app/(guest)/t/[qrToken]/Poller'
import { ackAddOn, closeService, confirmAward, fireOrder, openService, swapArms } from './actions'

export const dynamic = 'force-dynamic'

/**
 * The floor console (PLATFORM.md §3).
 *
 * Never shows a dashboard or a metric. Only: what to do, at which table, right
 * now. A server holding three plates has about one second of attention for
 * this, so everything actionable is a single large tap and the ordering is
 * by urgency, not by table number.
 */
export default async function FloorPage() {
  const staff = await readStaffSession()
  if (!staff) return <NeedsVenueLink />

  const service = await getOpenService(staff.venueId)

  if (!service) {
    return (
      <Shell>
        <p className="text-lg text-white/60">No service running.</p>
        <form action={openService} className="mt-6">
          <BigButton>Start service</BigButton>
        </form>
      </Shell>
    )
  }

  // Dynamic server component: one render per request, and "the time of this
  // request" is what the arm lookup needs. See the same note in the guest page.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const [tables, armRows, addOns, awards] = await Promise.all([
    db.table.findMany({
      where: { venueId: staff.venueId, active: true },
      orderBy: { label: 'asc' },
      include: {
        orderFires: { where: { serviceId: service.id }, orderBy: { firedAt: 'desc' }, take: 1 },
        guestSessions: {
          where: { serviceId: service.id },
          include: { plays: { orderBy: { startedAt: 'desc' }, take: 1 } },
        },
      },
    }),
    getArmRows(service.id),
    db.addOnRequest.findMany({
      where: { status: 'REQUESTED', guestSession: { serviceId: service.id } },
      include: { menuItem: true, guestSession: { include: { table: true } } },
      orderBy: { requestedAt: 'asc' },
    }),
    db.award.findMany({
      where: { status: 'PENDING', play: { guestSession: { serviceId: service.id } } },
      include: {
        menuItem: true,
        play: { include: { guestSession: { include: { table: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const sorted = [...tables].sort((a, b) => Number(a.label) - Number(b.label))

  return (
    <Shell>
      <Poller everyMs={2000} />

      {/* Urgent first: these are things a guest is currently waiting on. */}
      {awards.length > 0 && (
        <Section title={en.floor.redemptions.heading}>
          {awards.map((a) => (
            <form key={a.id} action={confirmAward}>
              <input type="hidden" name="id" value={a.id} />
              <Row
                label={
                  a.kind === 'FREE'
                    ? en.floor.redemptions.lineFree(
                        a.play.guestSession.table.label,
                        a.menuItem.name
                      )
                    : a.kind === 'PERCENT_OFF'
                      ? en.floor.redemptions.linePercent(
                          a.play.guestSession.table.label,
                          a.menuItem.name,
                          a.percentOff ?? 0
                        )
                      : en.floor.redemptions.lineFixed(
                          a.play.guestSession.table.label,
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
                tone="accent"
              />
            </form>
          ))}
        </Section>
      )}

      {addOns.length > 0 && (
        <Section title={en.floor.addOns.heading}>
          {addOns.map((r) => (
            <form key={r.id} action={ackAddOn}>
              <input type="hidden" name="id" value={r.id} />
              <Row
                label={en.floor.addOns.line(r.guestSession.table.label, r.qty, r.menuItem.name)}
                action={en.floor.addOns.ack}
                tone="good"
              />
            </form>
          ))}
        </Section>
      )}

      <Section title={en.floor.tables.heading}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {sorted.map((t) => {
            const arm = armAt(armRows, t.id, now)
            const fire = t.orderFires[0]
            const session = t.guestSessions[0]
            const play = session?.plays[0]

            const status = !session
              ? fire
                ? en.floor.tables.statusFired
                : en.floor.tables.statusSeated
              : play && !play.completedAt
                ? en.floor.tables.statusPlaying
                : en.floor.tables.statusFired

            return (
              <div
                key={t.id}
                className={`rounded-xl border p-3 ${
                  arm === 'CONTROL' ? 'border-white/10 bg-white/5' : 'border-white/25 bg-white/10'
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-semibold">{t.label}</span>
                  <span
                    className={`text-[11px] tracking-wide uppercase ${
                      arm === 'CONTROL' ? 'text-white/35' : 'text-load-amber'
                    }`}
                  >
                    {arm === 'CONTROL' ? en.floor.tables.control : en.floor.tables.tented}
                  </span>
                </div>
                <p className="mt-1 text-xs text-white/50">{status}</p>

                {/* Firing a control table's order is still correct — the
                    kitchen timing is real. It simply never becomes a game. */}
                {!fire ? (
                  <form action={fireOrder} className="mt-2">
                    <input type="hidden" name="tableId" value={t.id} />
                    <button
                      type="submit"
                      className="min-h-11 w-full rounded-lg bg-white/90 text-sm font-semibold text-black active:bg-load-amber"
                    >
                      {en.floor.tables.fireOrder}
                    </button>
                  </form>
                ) : (
                  <p className="mt-2 text-xs text-white/40">
                    {en.floor.tables.fired(
                      fire.firedAt.toLocaleTimeString('en-GB', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    )}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </Section>

      <div className="mt-10 flex gap-3 border-t border-white/10 pt-6">
        <form action={swapArms} className="flex-1">
          <button
            type="submit"
            className="min-h-12 w-full rounded-lg border border-white/20 text-sm text-white/70"
          >
            Swap tented / control
          </button>
        </form>
        <form action={closeService} className="flex-1">
          <button
            type="submit"
            className="min-h-12 w-full rounded-lg border border-white/20 text-sm text-white/70"
          >
            End service
          </button>
        </form>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="surface-staff min-h-dvh px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-xs tracking-widest text-white/40 uppercase">
          {en.floor.tables.heading}
        </h1>
        {children}
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-white/50 uppercase">{title}</h2>
      <div className="grid gap-2">{children}</div>
    </section>
  )
}

/**
 * A one-tap action row.
 *
 * Both fills carry dark text rather than white. These are read on a dark
 * tablet mid-service, and the load green is bright enough that white on it is
 * about 1.8:1 — the same trap the kitchen switch had.
 */
function Row({ label, action, tone }: { label: string; action: string; tone: 'accent' | 'good' }) {
  return (
    <button
      type="submit"
      className={`flex min-h-16 w-full items-center justify-between rounded-xl px-4 text-left ${
        tone === 'accent' ? 'bg-accent text-paper' : 'bg-load-green text-staff-ground'
      }`}
    >
      <span className="text-lg">{label}</span>
      <span className="ml-4 shrink-0 rounded-lg bg-black/25 px-4 py-2 text-sm font-semibold">
        {action}
      </span>
    </button>
  )
}

function BigButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="min-h-14 w-full rounded-xl bg-white px-5 text-lg font-semibold text-black"
    >
      {children}
    </button>
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
        <p className="mt-4 text-lg text-white/60">{en.floor.signIn.needsVenueLink}</p>
      </div>
    </main>
  )
}
