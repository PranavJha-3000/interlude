import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { readStaffSession } from '@/lib/staff-session'
import {
  getActiveVetoes,
  getConcededSoFarPaise,
  getEnabledGames,
  getKitchenLoad,
  getMenuForEngine,
  getOpenService,
  getPrizeRules,
  getVenueConfig,
  serviceClockMinute,
} from '@/lib/service'
import { decidePrizePool } from '@/core/prize-engine'
import { parseRankingWeights } from '@/lib/prize-config'
import { Poller } from '@/app/(guest)/t/[qrToken]/Poller'
import { setKitchenLoad, toggleKillSwitch, toggleVeto } from './actions'
import { SubmitButton } from '../../(staff)/SubmitButton'

export const dynamic = 'force-dynamic'

/**
 * The pass console (PLATFORM.md §3, REVAMP-BRIEF.md Part 6).
 *
 * Exists to let a chef with wet hands, mid-service, three metres away, control
 * what the engine may give away tonight. At a glance: what state am I in, and
 * what is on the list. One switch, one list, one kill switch — and nothing
 * goes above the switch (UI-SPEC §8), which is why the kill switch lives at
 * the bottom: it is an operator decision, not a fourth load state, and its
 * distance from the red block is part of saying so.
 *
 * No metrics, no revenue, no graphs, no accent, ever.
 */
export default async function PassPage() {
  const staff = await readStaffSession()
  // Sign-in is venue-addressed (`/floor/[venueSlug]`) and this page has no
  // venue to name yet, so bounce to the bare console — which tells staff to
  // open their venue's own link rather than showing a PIN pad or a picker.
  if (!staff) redirect('/floor')

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  const [venue, config, load, vetoes, service, enabledGames] = await Promise.all([
    db.venue.findUniqueOrThrow({ where: { id: staff.venueId } }),
    getVenueConfig(staff.venueId),
    getKitchenLoad(staff.venueId),
    getActiveVetoes(staff.venueId),
    getOpenService(staff.venueId),
    getEnabledGames(staff.venueId),
  ])

  const [menuData, prizeRules] = await Promise.all([
    getMenuForEngine(staff.venueId),
    getPrizeRules(staff.venueId),
  ])
  const conceded = service ? await getConcededSoFarPaise(service.id) : 0
  const killed = service?.killedAt !== null && service?.killedAt !== undefined

  // The same pure function the guest flow calls, with the same inputs and the
  // venue's own rules — so what the chef sees here is exactly what the next
  // guest will be offered. The platform runs one game (§4), so this is one
  // pool; the per-mechanic machinery that used to live here served games that
  // no longer exist.
  const gameOn = enabledGames.length > 0
  const pool = gameOn
    ? decidePrizePool({
        menu: menuData.engineMenu,
        velocity: menuData.velocity,
        kitchenLoad: load,
        chefVetoes: vetoes,
        depthCaps: {
          perItemPct: config.depthCapPerItemPct,
          perServicePaise: config.depthCapPerServicePaise,
        },
        mechanic: 'BEAT_THE_KITCHEN',
        outcome: 'WIN',
        prizeRules,
        rankingWeights: parseRankingWeights(config.rankingWeights),
        concededSoFarPaise: conceded,
        serviceClockMinute: serviceClockMinute(now, venue.timezone),
        peakStartMinute: config.peakStartMinute,
        peakEndMinute: config.peakEndMinute,
      })
    : null

  const byId = new Map(menuData.rows.map((m) => [m.id, m]))
  const vetoedSet = new Set(vetoes)
  const prepMinutes = (config.prepMinutesByCategory ?? {}) as Record<string, number>

  /** Item, station, fire time — what a chef needs to judge a veto (Part 6). */
  const rowMeta = (itemId: string) => {
    const item = byId.get(itemId)
    if (!item) return null
    const minutes = prepMinutes[item.category] ?? config.defaultPrepMinutes
    return { name: item.name, station: en.floor.tables.course(item.category), minutes }
  }

  const inPool = (pool?.entries ?? []).map((e) => e.itemId).filter((id) => byId.has(id))
  const vetoedItems = menuData.rows.filter((m) => vetoedSet.has(m.id)).map((m) => m.id)

  return (
    <main className="surface-staff min-h-dvh px-6 py-6">
      <Poller everyMs={10000} />
      <div className="mx-auto max-w-3xl">
        <header className="flex items-baseline justify-between">
          <h1 className="text-xs tracking-widest text-staff-muted uppercase">{en.pass.heading}</h1>
          <p className="text-xs tracking-widest text-staff-muted uppercase">{venue.name}</p>
        </header>

        {/* ── The one control that matters. Nothing goes above it. ─────────── */}
        <section className="mt-5">
          <div className="grid grid-cols-3 gap-4">
            {(['GREEN', 'AMBER', 'RED'] as const).map((level) => {
              const on = load === level
              // Dark text on the active fill, not white. These hues are bright
              // by design — they have to read across a pass — and white on
              // them is about 1.8:1. The dark ground they sit on is 6.1:1.
              const bg =
                level === 'GREEN'
                  ? 'bg-load-green'
                  : level === 'AMBER'
                    ? 'bg-load-amber'
                    : 'bg-load-red'
              const label =
                level === 'GREEN'
                  ? en.pass.load.green
                  : level === 'AMBER'
                    ? en.pass.load.amber
                    : en.pass.load.red
              const help =
                level === 'GREEN'
                  ? en.pass.load.greenHelp
                  : level === 'AMBER'
                    ? en.pass.load.amberHelp
                    : en.pass.load.redHelp

              return (
                <form key={level} action={setKitchenLoad}>
                  <input type="hidden" name="level" value={level} />
                  {/* The active state is a filled block with dark text —
                      readable by fill area and position alone; the colour is
                      confirmation, never the only carrier (Part 4). */}
                  <SubmitButton
                    type="submit"
                    aria-pressed={on}
                    className={`transition-state min-h-32 w-full rounded-2xl px-3 py-4 text-left ${
                      on ? `${bg} text-staff-ground` : 'bg-panel-iron'
                    }`}
                  >
                    <span
                      className={`block text-2xl font-bold tracking-wide ${on ? '' : 'text-staff-ink'}`}
                    >
                      {label}
                    </span>
                    <span
                      className={`mt-1 block text-sm leading-snug ${
                        on ? 'font-medium' : 'text-staff-muted'
                      }`}
                    >
                      {help}
                    </span>
                  </SubmitButton>
                </form>
              )
            })}
          </div>
        </section>

        {/* ── Tonight's pool: one list, the row is the toggle. ─────────────── */}
        <section className="mt-10">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-staff-muted uppercase">
              {en.pass.pool.heading}
            </h2>
            <p className="text-xs text-staff-muted">{en.pass.pool.hint}</p>
          </div>

          {!gameOn ? (
            <p className="text-staff-muted">{en.pass.pool.noGames}</p>
          ) : inPool.length === 0 && vetoedItems.length === 0 ? (
            <p className="text-staff-muted">{en.pass.pool.empty}</p>
          ) : (
            <ul className="grid gap-2">
              {[...inPool, ...vetoedItems].map((itemId) => {
                const meta = rowMeta(itemId)
                if (!meta) return null
                const isVetoed = vetoedSet.has(itemId)

                return (
                  <li key={itemId}>
                    <form action={toggleVeto}>
                      <input type="hidden" name="menuItemId" value={itemId} />
                      <SubmitButton
                        type="submit"
                        aria-pressed={isVetoed}
                        className={`transition-state flex min-h-16 w-full items-center justify-between gap-4 rounded-xl px-4 py-3 text-left ${
                          isVetoed ? 'border border-load-red/40' : 'bg-panel-iron'
                        }`}
                      >
                        <span className="min-w-0">
                          <span
                            className={`block truncate text-xl ${
                              isVetoed ? 'text-staff-muted line-through' : 'text-staff-ink'
                            }`}
                          >
                            {meta.name}
                          </span>
                          <span className="mt-0.5 block text-sm text-staff-muted">
                            {meta.station} ·{' '}
                            <span className="font-mono tabular-nums">
                              {en.pass.pool.fireMinutes(meta.minutes)}
                            </span>
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full border px-3 py-1 text-xs tracking-wide uppercase ${
                            isVetoed
                              ? 'border-load-red/60 text-load-red'
                              : 'border-staff-muted/40 text-staff-muted'
                          }`}
                        >
                          {isVetoed ? en.pass.pool.vetoed : en.pass.pool.inPool}
                        </span>
                      </SubmitButton>
                    </form>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* ── The kill switch (§7.4) — an operator decision, not a load state.
            Pinned to the bottom of the viewport, bordered rather than filled,
            the whole pool list away from the red block: findable in a hurry
            even under a forty-item menu, hard to read as part of the traffic
            light, and hard to hit by accident — it sits alone on its own
            band of ground. ──────────────────────────────────────────────── */}
        {service && (
          <section className="sticky bottom-0 mt-14 bg-staff-ground pt-3 pb-4">
            <form action={toggleKillSwitch}>
              <SubmitButton
                type="submit"
                aria-pressed={killed}
                className={`transition-state min-h-16 w-full rounded-2xl border-2 text-base font-semibold tracking-wide ${
                  killed
                    ? 'border-load-red bg-load-red text-staff-ground'
                    : 'border-load-red/40 text-load-red'
                }`}
              >
                {killed ? en.pass.kill.on : en.pass.kill.off}
              </SubmitButton>
              <p className="mt-2 text-xs text-staff-muted">
                {killed ? en.pass.kill.onNote : en.pass.kill.offNote}
              </p>
            </form>
          </section>
        )}
      </div>
    </main>
  )
}
