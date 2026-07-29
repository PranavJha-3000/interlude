import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { readStaffSession } from '@/lib/staff-session'
import {
  getActiveVetoes,
  getConcededSoFarPaise,
  getKitchenLoad,
  getMenuForEngine,
  getOpenService,
  getPrizeRules,
  getVenueConfig,
  serviceClockMinute,
} from '@/lib/service'
import { decidePrizePool } from '@/core/prize-engine'
import { Poller } from '@/app/(guest)/t/[qrToken]/Poller'
import { setKitchenLoad, toggleVeto } from './actions'

export const dynamic = 'force-dynamic'

/**
 * The pass console (PLATFORM.md §3).
 *
 * One control that matters and one list. Read at a glance, mid-service, with
 * wet hands — so the load switch is three targets the size of a fist, and
 * everything else is secondary.
 */
export default async function PassPage() {
  const staff = await readStaffSession()
  if (!staff) redirect('/floor')

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  const [venue, config, load, vetoes, service] = await Promise.all([
    db.venue.findUniqueOrThrow({ where: { id: staff.venueId } }),
    getVenueConfig(staff.venueId),
    getKitchenLoad(staff.venueId),
    getActiveVetoes(staff.venueId),
    getOpenService(staff.venueId),
  ])

  const [menuData, prizeRules] = await Promise.all([
    getMenuForEngine(staff.venueId),
    getPrizeRules(staff.venueId),
  ])
  const menu = [...menuData.rows].sort((a, b) => a.name.localeCompare(b.name))
  const conceded = service ? await getConcededSoFarPaise(service.id) : 0

  // The same pure function the guest flow calls, with the same inputs and the
  // venue's own rules — so what the chef sees here is exactly what the next
  // guest will be offered. `outcome: WIN` because that is the deepest the pool
  // ever goes; a consolation is never worse for the kitchen than a win.
  const pool = decidePrizePool({
    menu: menuData.engineMenu,
    velocity: menuData.velocity,
    kitchenLoad: load,
    chefVetoes: vetoes,
    depthCaps: {
      perItemPct: config.depthCapPerItemPct,
      perServicePaise: config.depthCapPerServicePaise,
    },
    mechanic: 'KITCHEN_ROUND',
    outcome: 'WIN',
    prizeRules,
    concededSoFarPaise: conceded,
    serviceClockMinute: serviceClockMinute(now, venue.timezone),
    peakStartMinute: config.peakStartMinute,
    peakEndMinute: config.peakEndMinute,
  })

  const byId = new Map(menu.map((m) => [m.id, m]))
  const vetoedSet = new Set(vetoes)

  return (
    <main className="surface-staff min-h-dvh px-4 py-6">
      <Poller everyMs={10000} />
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xs tracking-widest text-white/40 uppercase">{en.pass.heading}</h1>

        {/* The one control that matters. */}
        <section className="mt-5">
          <p className="mb-3 text-sm text-white/50">{en.pass.load.label}</p>
          <div className="grid grid-cols-3 gap-3">
            {(['GREEN', 'AMBER', 'RED'] as const).map((level) => {
              const on = load === level
              const bg = level === 'GREEN' ? 'bg-good' : level === 'AMBER' ? 'bg-amber' : 'bg-bad'
              return (
                <form key={level} action={setKitchenLoad}>
                  <input type="hidden" name="level" value={level} />
                  <button
                    type="submit"
                    aria-pressed={on}
                    className={`min-h-28 w-full rounded-2xl text-xl font-bold tracking-wide ${
                      on ? `${bg} text-white` : 'bg-white/8 text-white/35'
                    }`}
                  >
                    {level === 'GREEN'
                      ? en.pass.load.green
                      : level === 'AMBER'
                        ? en.pass.load.amber
                        : en.pass.load.red}
                  </button>
                </form>
              )
            })}
          </div>
          <p className="mt-3 text-sm text-white/45">
            {load === 'GREEN'
              ? en.pass.load.greenHelp
              : load === 'AMBER'
                ? en.pass.load.amberHelp
                : en.pass.load.redHelp}
          </p>
        </section>

        {/* Tonight's pool, each line carrying the engine's own reason. */}
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-white/50 uppercase">
            {en.pass.pool.heading}
          </h2>
          {pool.entries.length === 0 ? (
            <p className="text-white/40">{en.pass.pool.empty}</p>
          ) : (
            <ul className="grid gap-2">
              {pool.entries.slice(0, 12).map((e) => {
                const item = byId.get(e.itemId)
                if (!item) return null
                return (
                  <li
                    key={e.itemId}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white/8 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-lg">{item.name}</p>
                      <p className="mt-0.5 text-xs text-white/45">{e.reason}</p>
                    </div>
                    <form action={toggleVeto} className="shrink-0">
                      <input type="hidden" name="menuItemId" value={e.itemId} />
                      <button
                        type="submit"
                        className="min-h-11 rounded-lg border border-white/25 px-4 text-sm text-white/70 active:bg-bad active:text-white"
                      >
                        {en.pass.pool.veto}
                      </button>
                    </form>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* Vetoed items stay visible, or the chef cannot undo one. */}
        {vetoes.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-white/50 uppercase">
              {en.pass.pool.vetoed}
            </h2>
            <ul className="grid gap-2">
              {menu
                .filter((m) => vetoedSet.has(m.id))
                .map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-bad/40 px-4 py-3"
                  >
                    <span className="truncate text-lg text-white/60 line-through">{m.name}</span>
                    <form action={toggleVeto} className="shrink-0">
                      <input type="hidden" name="menuItemId" value={m.id} />
                      <button
                        type="submit"
                        className="min-h-11 rounded-lg border border-white/25 px-4 text-sm text-white/70"
                      >
                        {en.pass.pool.unveto}
                      </button>
                    </form>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}
