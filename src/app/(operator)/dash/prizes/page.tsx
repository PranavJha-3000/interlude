import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { getOperatorWithoutVenue } from '@/lib/operator-session'
import { formatPaise, paiseToRupeeInput } from '@/lib/money'
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
import { decidePrizePool, type Mechanic, type PrizePoolResult } from '@/core/prize-engine'
import { parseRankingWeights } from '@/lib/prize-config'
import {
  clearVetoFromDash,
  updateFences,
  updateGates,
  updatePeak,
  updatePrep,
  updateRoundShape,
  updateWeights,
} from './actions'

export const dynamic = 'force-dynamic'

/**
 * The fences (PLATFORM.md §10). Every field here writes `VenueConfig`; nothing
 * here becomes a constant. Then the same `decidePrizePool` call the pass makes,
 * read-only, with every reason and every refusal — so an operator changing a
 * fence sees what it did before a guest does.
 */

const INPUT = 'mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3 font-mono text-base'
const LABEL = 'block text-sm text-muted'
const SECTION = 'mt-8 rounded-2xl border border-line p-5'
const SAVE = 'mt-5 min-h-11 rounded-xl border-2 border-line px-5 text-sm font-semibold'

export default async function PrizesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>
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

  const { error, saved } = await searchParams

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  const [venue, config, load, vetoIds, service, enabledGames, menuData, prizeRules] =
    await Promise.all([
      db.venue.findUniqueOrThrow({ where: { id: venueId } }),
      getVenueConfig(venueId),
      getKitchenLoad(venueId),
      getActiveVetoes(venueId),
      getOpenService(venueId),
      getEnabledGames(venueId),
      getMenuForEngine(venueId),
      getPrizeRules(venueId),
    ])

  const conceded = service ? await getConcededSoFarPaise(service.id) : 0
  const weights = parseRankingWeights(config.rankingWeights)

  // The same pure call the pass and the guest flow make — not a copy of its
  // logic. What this screen shows is exactly what the next guest is offered.
  const pools: Array<{ mechanic: Mechanic; pool: PrizePoolResult }> = enabledGames.map(
    (mechanic) => ({
      mechanic,
      pool: decidePrizePool({
        menu: menuData.engineMenu,
        velocity: menuData.velocity,
        kitchenLoad: load,
        chefVetoes: vetoIds,
        depthCaps: {
          perItemPct: config.depthCapPerItemPct,
          perServicePaise: config.depthCapPerServicePaise,
        },
        mechanic,
        outcome: 'WIN',
        prizeRules,
        rankingWeights: weights,
        concededSoFarPaise: conceded,
        serviceClockMinute: serviceClockMinute(now, venue.timezone),
        peakStartMinute: config.peakStartMinute,
        peakEndMinute: config.peakEndMinute,
      }),
    })
  )

  const menuItems = await db.menuItem.findMany({
    where: { venueId, active: true },
    select: { id: true, name: true, category: true, requiresKitchenWork: true },
    orderBy: { name: 'asc' },
  })
  const itemName = new Map(menuItems.map((m) => [m.id, m.name]))

  const prepConfigured = (config.prepMinutesByCategory ?? {}) as Record<string, number>
  const prepCategories = [
    ...new Set([...Object.keys(prepConfigured), ...menuItems.map((m) => m.category)]),
  ].sort()

  const vetoed = menuItems.filter((m) => vetoIds.includes(m.id))

  return (
    <Shell>
      <p className="mb-4 text-lg text-muted">{en.dash.prizes.body}</p>
      {saved && <p className="mb-4 text-sm text-muted">{en.dash.prizes.saved}</p>}
      {error && <p className="mb-4 text-sm text-bad">{en.dash.prizes.invalid}</p>}

      {/* ── Round shape ─────────────────────────────────────────────── */}
      <section className={SECTION}>
        <h2 className="text-lg font-semibold">{en.dash.prizes.round.heading}</h2>
        <form action={updateRoundShape} className="mt-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              name="ladderRungs"
              label={en.dash.prizes.round.ladderRungs}
              help={en.dash.prizes.round.ladderRungsHelp}
              defaultValue={config.ladderRungs}
            />
            <Field
              name="startingLives"
              label={en.dash.prizes.round.startingLives}
              defaultValue={config.startingLives}
            />
            <Field
              name="gamblePenaltyRungs"
              label={en.dash.prizes.round.gamblePenaltyRungs}
              defaultValue={config.gamblePenaltyRungs}
            />
            <Field
              name="pairGapRatio"
              label={en.dash.prizes.round.pairGapRatio}
              help={en.dash.prizes.round.pairGapRatioHelp}
              defaultValue={config.pairGapRatio}
              step="0.1"
            />
            <Field
              name="velocityWindowDays"
              label={en.dash.prizes.round.velocityWindowDays}
              help={en.dash.prizes.round.velocityWindowDaysHelp}
              defaultValue={config.velocityWindowDays}
            />
            <Field
              name="countdownBufferSec"
              label={en.dash.prizes.round.countdownBufferSec}
              help={en.dash.prizes.round.countdownBufferSecHelp}
              defaultValue={config.countdownBufferSec}
            />
            <Field
              name="untimedAfterSec"
              label={en.dash.prizes.round.untimedAfterSec}
              help={en.dash.prizes.round.untimedAfterSecHelp}
              defaultValue={config.untimedAfterSec}
            />
          </div>

          <p className="mt-6 text-sm font-semibold">{en.dash.prizes.round.livesHeading}</p>
          <div className="mt-2 flex flex-wrap gap-6">
            <Toggle
              name="lifeForAddOn"
              label={en.dash.prizes.round.lifeForAddOn}
              defaultChecked={config.lifeForAddOn}
            />
            <Toggle
              name="lifeForPhone"
              label={en.dash.prizes.round.lifeForPhone}
              defaultChecked={config.lifeForPhone}
            />
            <Toggle
              name="lifeForFeedback"
              label={en.dash.prizes.round.lifeForFeedback}
              defaultChecked={config.lifeForFeedback}
            />
          </div>

          <button type="submit" className={SAVE}>
            {en.dash.prizes.save}
          </button>
        </form>
      </section>

      {/* ── Prize fences ────────────────────────────────────────────── */}
      <section className={SECTION}>
        <h2 className="text-lg font-semibold">{en.dash.prizes.fences.heading}</h2>
        <form action={updateFences} className="mt-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              name="depthCapPerItemPct"
              label={en.dash.prizes.fences.depthCapPerItemPct}
              help={en.dash.prizes.fences.depthCapPerItemPctHelp}
              defaultValue={config.depthCapPerItemPct}
            />
            <Field
              name="depthCapPerServiceRupees"
              label={en.dash.prizes.fences.depthCapPerServiceRupees}
              help={en.dash.prizes.fences.depthCapPerServiceRupeesHelp}
              defaultValue={paiseToRupeeInput(config.depthCapPerServicePaise)}
              text
            />
            <Field
              name="mysteryPlateRupees"
              label={en.dash.prizes.fences.mysteryPlateRupees}
              defaultValue={paiseToRupeeInput(config.mysteryPlatePricePaise)}
              text
            />
          </div>

          <div className="mt-4">
            <label htmlFor="fallbackMenuItemId" className={LABEL}>
              {en.dash.prizes.fences.fallbackItem}
            </label>
            <select
              id="fallbackMenuItemId"
              name="fallbackMenuItemId"
              defaultValue={config.fallbackMenuItemId ?? ''}
              className={INPUT + ' max-w-md'}
            >
              <option value="">{en.dash.prizes.fences.fallbackNone}</option>
              {menuItems
                .filter((m) => !m.requiresKitchenWork)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
            <p className="mt-1 text-xs text-muted">{en.dash.prizes.fences.fallbackItemHelp}</p>
          </div>

          <button type="submit" className={SAVE}>
            {en.dash.prizes.save}
          </button>
        </form>
      </section>

      {/* ── Prep minutes ────────────────────────────────────────────── */}
      <section className={SECTION}>
        <h2 className="text-lg font-semibold">{en.dash.prizes.prep.heading}</h2>
        <p className="mt-1 text-sm text-muted">{en.dash.prizes.prep.body}</p>
        <form action={updatePrep} className="mt-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              name="defaultPrepMinutes"
              label={en.dash.prizes.prep.defaultLabel}
              defaultValue={config.defaultPrepMinutes}
            />
            {prepCategories.map((category) => (
              <Field
                key={category}
                name={`prep:${category}`}
                label={en.dash.prizes.prep.categoryLabel(category)}
                defaultValue={prepConfigured[category] ?? ''}
                optional
              />
            ))}
          </div>
          <button type="submit" className={SAVE}>
            {en.dash.prizes.save}
          </button>
        </form>
      </section>

      {/* ── Peak window ─────────────────────────────────────────────── */}
      <section className={SECTION}>
        <h2 className="text-lg font-semibold">{en.dash.prizes.peak.heading}</h2>
        <p className="mt-1 text-sm text-muted">{en.dash.prizes.peak.help}</p>
        <form action={updatePeak} className="mt-4">
          <div className="grid max-w-md gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="peakStart" className={LABEL}>
                {en.dash.prizes.peak.start}
              </label>
              <input
                id="peakStart"
                name="peakStart"
                type="time"
                required
                defaultValue={minutesToTime(config.peakStartMinute)}
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="peakEnd" className={LABEL}>
                {en.dash.prizes.peak.end}
              </label>
              <input
                id="peakEnd"
                name="peakEnd"
                type="time"
                required
                defaultValue={minutesToTime(config.peakEndMinute)}
                className={INPUT}
              />
            </div>
          </div>
          <button type="submit" className={SAVE}>
            {en.dash.prizes.save}
          </button>
        </form>
      </section>

      {/* ── Gates ───────────────────────────────────────────────────── */}
      <section className={SECTION}>
        <h2 className="text-lg font-semibold">{en.dash.prizes.gates.heading}</h2>
        <p className="mt-1 text-sm text-muted">{en.dash.prizes.gates.body}</p>
        <form action={updateGates} className="mt-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              name="attachDeltaGatePp"
              label={en.dash.prizes.gates.attachDeltaGatePp}
              defaultValue={config.attachDeltaGatePp}
              step="0.1"
            />
            <Field
              name="ticketDeltaKillPct"
              label={en.dash.prizes.gates.ticketDeltaKillPct}
              defaultValue={config.ticketDeltaKillPct}
              step="0.1"
            />
            <Field
              name="ticketDeltaProceedPct"
              label={en.dash.prizes.gates.ticketDeltaProceedPct}
              defaultValue={config.ticketDeltaProceedPct}
              step="0.1"
            />
            <Field
              name="scanRateKillPct"
              label={en.dash.prizes.gates.scanRateKillPct}
              defaultValue={config.scanRateKillPct}
              step="0.1"
            />
            <Field
              name="scanRateGoodPct"
              label={en.dash.prizes.gates.scanRateGoodPct}
              defaultValue={config.scanRateGoodPct}
              step="0.1"
            />
            <Field
              name="completionRateGatePct"
              label={en.dash.prizes.gates.completionRateGatePct}
              defaultValue={config.completionRateGatePct}
              step="0.1"
            />
            <Field
              name="reviewVelocityGateX"
              label={en.dash.prizes.gates.reviewVelocityGateX}
              defaultValue={config.reviewVelocityGateX}
              step="0.1"
            />
          </div>
          <button type="submit" className={SAVE}>
            {en.dash.prizes.save}
          </button>
        </form>
      </section>

      {/* ── Ranking weights ─────────────────────────────────────────── */}
      <section className={SECTION}>
        <h2 className="text-lg font-semibold">{en.dash.prizes.weights.heading}</h2>
        <p className="mt-1 text-sm text-muted">{en.dash.prizes.weights.body}</p>
        <form action={updateWeights} className="mt-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="notSelling" label={en.dash.prizes.weights.notSelling} defaultValue={weights.notSelling} />
            <Field name="slowMover" label={en.dash.prizes.weights.slowMover} defaultValue={weights.slowMover} />
            <Field
              name="fastMoverPenalty"
              label={en.dash.prizes.weights.fastMoverPenalty}
              defaultValue={weights.fastMoverPenalty}
            />
            <Field name="stale" label={en.dash.prizes.weights.stale} defaultValue={weights.stale} />
            <Field
              name="lowPrepBonus"
              label={en.dash.prizes.weights.lowPrepBonus}
              defaultValue={weights.lowPrepBonus}
            />
            <Field
              name="highPrepPenalty"
              label={en.dash.prizes.weights.highPrepPenalty}
              defaultValue={weights.highPrepPenalty}
            />
            <Field
              name="slowMoverMaxUnits"
              label={en.dash.prizes.weights.slowMoverMaxUnits}
              defaultValue={weights.slowMoverMaxUnits}
            />
            <Field
              name="fastMoverMinUnits"
              label={en.dash.prizes.weights.fastMoverMinUnits}
              defaultValue={weights.fastMoverMinUnits}
            />
            <Field
              name="staleMinDays"
              label={en.dash.prizes.weights.staleMinDays}
              defaultValue={weights.staleMinDays}
            />
          </div>
          <button type="submit" className={SAVE}>
            {en.dash.prizes.save}
          </button>
        </form>
      </section>

      {/* ── Vetoes ──────────────────────────────────────────────────── */}
      <section className={SECTION}>
        <h2 className="text-lg font-semibold">{en.dash.prizes.vetoes.heading}</h2>
        <p className="mt-1 text-sm text-muted">{en.dash.prizes.vetoes.body}</p>
        {vetoed.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{en.dash.prizes.vetoes.none}</p>
        ) : (
          <ul className="mt-3">
            {vetoed.map((item) => (
              <li key={item.id} className="flex items-center gap-3 border-t border-line py-3">
                <span className="flex-1">{item.name}</span>
                <form action={clearVetoFromDash}>
                  <input type="hidden" name="menuItemId" value={item.id} />
                  <button type="submit" className="text-sm underline">
                    {en.dash.prizes.vetoes.clear}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Tonight's pool, read-only ───────────────────────────────── */}
      <section className={SECTION}>
        <h2 className="text-lg font-semibold">{en.dash.prizes.pool.heading}</h2>
        <p className="mt-1 text-sm text-muted">{en.dash.prizes.pool.body}</p>
        {!service && <p className="mt-1 text-xs text-muted">{en.dash.prizes.pool.noService}</p>}

        {pools.map(({ mechanic, pool }) => (
          <div key={mechanic} className="mt-5">
            {pools.length > 1 && (
              <p className="text-xs tracking-widest text-muted uppercase">{mechanic}</p>
            )}
            {pool.entries.length === 0 && (
              <p className="mt-2 text-sm text-muted">{en.dash.prizes.pool.empty}</p>
            )}
            <ul className="mt-2">
              {pool.entries.map((entry) => (
                <li key={`in-${entry.itemId}`} className="border-t border-line py-2">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-xs text-muted">
                      {en.dash.prizes.pool.inLabel}
                    </span>
                    <span className="flex-1">{itemName.get(entry.itemId) ?? entry.itemId}</span>
                  </div>
                  <p className="mt-1 pl-9 font-mono text-xs text-muted">{entry.reason}</p>
                </li>
              ))}
              {pool.excluded.map((ex) => (
                <li key={`out-${ex.itemId}`} className="border-t border-line py-2">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-xs font-semibold">
                      {en.dash.prizes.pool.outLabel}
                    </span>
                    <span className="flex-1 text-muted line-through">
                      {itemName.get(ex.itemId) ?? ex.itemId}
                    </span>
                  </div>
                  <p className="mt-1 pl-9 font-mono text-xs">{ex.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <p className="mt-6 font-mono text-xs text-muted">
        {formatPaise(conceded)} conceded so far this service.
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="mb-2 text-xs tracking-widest text-muted uppercase">
        {en.dash.prizes.heading}
      </h1>
      {children}
    </main>
  )
}

function Field({
  name,
  label,
  help,
  defaultValue,
  step,
  text,
  optional,
}: {
  name: string
  label: string
  help?: string
  defaultValue: number | string
  step?: string
  text?: boolean
  optional?: boolean
}) {
  return (
    <div>
      <label htmlFor={name} className={LABEL}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={text ? 'text' : 'number'}
        inputMode="decimal"
        step={step ?? '1'}
        required={!optional}
        defaultValue={defaultValue}
        className={INPUT}
      />
      {help && <p className="mt-1 text-xs text-muted">{help}</p>}
    </div>
  )
}

function Toggle({
  name,
  label,
  defaultChecked,
}: {
  name: string
  label: string
  defaultChecked: boolean
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-5 w-5 accent-accent"
      />
      {label}
    </label>
  )
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
