import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getOperatorWithoutVenue } from '@/lib/operator-session'
import { formatPaise } from '@/lib/money'
import { publicBaseUrl } from '@/lib/base-url'
import { ONBOARDING_ORDER, type OnboardingStepName } from '@/lib/venue-setup'
import { en } from '@/strings/en'
import type { Mechanic } from '@/core/prize-engine'
import {
  advanceStep,
  confirmUploadedMenu,
  discardUploadedMenu,
  removeItem,
  submitDetails,
  submitMenuDone,
  submitMenuItem,
  submitTables,
  uploadMenu,
} from './actions'
import { MenuDraftGrid, MenuUploadForm } from '../menu-upload-ui'
import { getMenuDraft } from '@/lib/menu-draft'
import { StaffPins } from './StaffPins'
import { ShareLink } from './ShareLink'

export const dynamic = 'force-dynamic'

/**
 * Self-serve onboarding — one route, six screens, resumable.
 *
 * The screen shown is a function of `Venue.onboardingStep` and nothing else.
 * There is no wizard state in a cookie, no step in the URL and no client-side
 * router: an owner who closes the laptop halfway through and comes back
 * tomorrow lands exactly where they stopped, on a different device if they
 * like, because the cursor lives in the row rather than in the browser.
 *
 * That is also why the step is never taken from the query string. A step in the
 * URL is a step an operator can edit, and skipping `MENU` would produce a venue
 * that cannot run a service.
 */

const ERRORS: Record<string, string> = {
  name_required: en.onboarding.details.nameRequired,
  name_taken: en.onboarding.details.nameTaken,
  count_invalid: en.onboarding.tables.countInvalid,
  invalid: en.onboarding.menu.invalid,
  cost_over_price: en.onboarding.menu.costOverPrice,
  need_one: en.onboarding.menu.needOne,
  upload_failed: en.onboarding.menu.upload.failed,
  nothing_selected: en.onboarding.menu.upload.nothingSelected,
  missing_cost_pct: en.onboarding.menu.upload.missingCostPct,
}

/** One wording per mechanic, shared with `/dash/games`. */
const GAME_LABEL: Record<Mechanic, string> = {
  BEAT_THE_KITCHEN: en.dash.games.beatTheKitchen,
  KITCHEN_ROUND: en.dash.games.kitchenRound,
  MYSTERY_PLATE: en.dash.games.mysteryPlate,
  SECRET_RECIPE: 'Secret Recipe',
  MYSTERY_CUSTOMER: 'Mystery Customer',
}

const INPUT = 'mt-2 min-h-14 w-full rounded-xl border border-line bg-paper px-4 text-lg'
const BUTTON = 'mt-6 min-h-14 w-full rounded-xl bg-ink px-5 text-lg font-semibold text-paper'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const operator = await getOperatorWithoutVenue()
  if (!operator) redirect('/signin')

  const { error } = await searchParams
  const message = error ? ERRORS[error] : undefined

  // No venue yet means the first screen, whatever any other state says.
  if (!operator.venueId) {
    return (
      <Shell step="DETAILS" message={message}>
        <Details />
      </Shell>
    )
  }

  const venue = await db.venue.findUnique({
    where: { id: operator.venueId },
    select: { id: true, name: true, qrToken: true, onboardingStep: true },
  })
  if (!venue) redirect('/onboarding')

  if (venue.onboardingStep === 'DONE') redirect('/dash')

  const step = venue.onboardingStep

  return (
    <Shell step={step} message={message}>
      {step === 'DETAILS' && <Details />}
      {step === 'TABLES' && <Tables />}
      {step === 'MENU' && <Menu venueId={venue.id} />}
      {step === 'STAFF' && <Staff />}
      {step === 'QR' && <Qr qrToken={venue.qrToken} />}
      {step === 'GAMES' && <Games venueId={venue.id} />}
    </Shell>
  )
}

function Shell({
  step,
  message,
  children,
}: {
  step: OnboardingStepName
  message?: string
  children: React.ReactNode
}) {
  // `DONE` is not a screen, so the count is of the steps someone actually walks.
  const total = ONBOARDING_ORDER.length - 1
  const position = ONBOARDING_ORDER.indexOf(step) + 1

  return (
    <main className="mx-auto w-full max-w-md px-6 py-12">
      <p className="text-sm text-muted">{en.onboarding.progress(position, total)}</p>
      {message && <p className="mt-4 text-sm text-bad">{message}</p>}
      {children}
    </main>
  )
}

function Details() {
  return (
    <>
      <h1 className="mt-3 text-3xl font-semibold">{en.onboarding.details.heading}</h1>
      <p className="mt-3 text-lg text-muted">{en.onboarding.details.body}</p>

      <form action={submitDetails} className="mt-8">
        <label htmlFor="name" className="block text-sm text-muted">
          {en.onboarding.details.nameLabel}
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder={en.onboarding.details.namePlaceholder}
          className={INPUT}
        />

        <label htmlFor="city" className="mt-6 block text-sm text-muted">
          {en.onboarding.details.cityLabel}
        </label>
        <input
          id="city"
          name="city"
          placeholder={en.onboarding.details.cityPlaceholder}
          className={INPUT}
        />

        <button type="submit" className={BUTTON}>
          {en.onboarding.details.submit}
        </button>
      </form>
    </>
  )
}

function Tables() {
  return (
    <>
      <h1 className="mt-3 text-3xl font-semibold">{en.onboarding.tables.heading}</h1>
      <p className="mt-3 text-lg text-muted">{en.onboarding.tables.body}</p>

      <form action={submitTables} className="mt-8">
        <label htmlFor="count" className="block text-sm text-muted">
          {en.onboarding.tables.countLabel}
        </label>
        <input
          id="count"
          name="count"
          type="number"
          inputMode="numeric"
          min={1}
          max={500}
          defaultValue={20}
          required
          className={INPUT}
        />

        <button type="submit" className={BUTTON}>
          {en.onboarding.tables.submit}
        </button>
      </form>
    </>
  )
}

async function Menu({ venueId }: { venueId: string }) {
  const items = await db.menuItem.findMany({
    where: { venueId },
    select: { id: true, name: true, pricePaise: true },
    orderBy: { name: 'asc' },
  })

  // An unconfirmed upload takes over the screen: the operator is mid-decision,
  // and showing the manual form beside 40 draft rows buries both.
  const pending = await getMenuDraft(venueId)
  if (pending) {
    return (
      <>
        <h1 className="mt-3 text-3xl font-semibold">{en.onboarding.menu.heading}</h1>
        <MenuDraftGrid
          source={pending.source}
          draft={pending.draft}
          confirmAction={confirmUploadedMenu}
          discardAction={discardUploadedMenu}
        />
      </>
    )
  }

  return (
    <>
      <h1 className="mt-3 text-3xl font-semibold">{en.onboarding.menu.heading}</h1>
      <p className="mt-3 text-lg text-muted">{en.onboarding.menu.body}</p>

      <MenuUploadForm action={uploadMenu} />

      <form action={submitMenuItem} className="mt-8">
        <label htmlFor="item-name" className="block text-sm text-muted">
          {en.onboarding.menu.nameLabel}
        </label>
        <input id="item-name" name="name" required className={INPUT} />

        <div className="mt-6 flex gap-4">
          <div className="flex-1">
            <label htmlFor="price" className="block text-sm text-muted">
              {en.onboarding.menu.priceLabel}
            </label>
            <input
              id="price"
              name="price"
              type="number"
              inputMode="decimal"
              min={1}
              step="1"
              required
              className={INPUT}
            />
          </div>
          <div className="flex-1">
            <label htmlFor="cost" className="block text-sm text-muted">
              {en.onboarding.menu.costLabel}
            </label>
            <input
              id="cost"
              name="cost"
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              required
              className={INPUT}
            />
          </div>
        </div>
        <p className="mt-2 text-sm text-muted">{en.onboarding.menu.costHelp}</p>

        <label htmlFor="category" className="mt-6 block text-sm text-muted">
          {en.onboarding.menu.categoryLabel}
        </label>
        <select id="category" name="category" defaultValue="mains" className={INPUT}>
          <option value="starters">starters</option>
          <option value="mains">mains</option>
          <option value="breads">breads</option>
          <option value="sides">sides</option>
          <option value="desserts">desserts</option>
          <option value="beverages">beverages</option>
        </select>

        <button type="submit" className={BUTTON}>
          {en.onboarding.menu.add}
        </button>
      </form>

      <div className="mt-10">
        <p className="text-sm text-muted">
          {items.length === 0 ? en.onboarding.menu.empty : en.onboarding.menu.added(items.length)}
        </p>

        <ul className="mt-3">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 border-t border-line py-3">
              <span className="flex-1">{item.name}</span>
              <span className="font-mono text-muted tabular-nums">{formatPaise(item.pricePaise)}</span>
              <form action={removeItem}>
                <input type="hidden" name="menuItemId" value={item.id} />
                <button type="submit" className="text-sm text-muted underline">
                  {en.onboarding.menu.remove}
                </button>
              </form>
            </li>
          ))}
        </ul>

        <form action={submitMenuDone}>
          <button type="submit" className={BUTTON}>
            {en.onboarding.menu.submit}
          </button>
        </form>
      </div>
    </>
  )
}

function Staff() {
  return (
    <>
      <h1 className="mt-3 text-3xl font-semibold">{en.onboarding.staff.heading}</h1>
      <p className="mt-3 text-lg text-muted">{en.onboarding.staff.body}</p>
      <StaffPins />
    </>
  )
}

function Qr({ qrToken }: { qrToken: string }) {
  const url = `${publicBaseUrl()}/v/${qrToken}`

  return (
    <>
      <h1 className="mt-3 text-3xl font-semibold">{en.onboarding.qr.heading}</h1>
      <p className="mt-3 text-lg text-muted">{en.onboarding.qr.body}</p>

      <p className="mt-6 rounded-xl border border-line bg-warm px-4 py-3 font-mono text-sm break-all">
        {url}
      </p>

      <div className="mt-6 flex gap-3">
        {/*
          A plain link, not a print dialog: `/tents` is the print stylesheet
          that already exists, and it prints every table's tent as well as this
          code. Opening in a new tab keeps the wizard where it was.
        */}
        <a
          href="/tents"
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-14 flex-1 rounded-xl border border-line px-5 text-lg font-semibold flex items-center justify-center"
        >
          {en.onboarding.qr.print}
        </a>
        <ShareLink url={url} />
      </div>

      <form action={advanceStep}>
        <input type="hidden" name="step" value="QR" />
        <button type="submit" className={BUTTON}>
          {en.onboarding.qr.submit}
        </button>
      </form>
    </>
  )
}

async function Games({ venueId }: { venueId: string }) {
  const games = await db.venueGame.findMany({
    where: { venueId },
    orderBy: { displayOrder: 'asc' },
    select: { id: true, mechanic: true, enabled: true },
  })

  return (
    <>
      <h1 className="mt-3 text-3xl font-semibold">{en.onboarding.games.heading}</h1>
      <p className="mt-3 text-lg text-muted">{en.onboarding.games.body}</p>

      <ul className="mt-8">
        {games.map((game) => (
          <li key={game.id} className="flex items-center gap-3 border-t border-line py-4">
            <span className="flex-1 text-lg">{GAME_LABEL[game.mechanic]}</span>
            <span className="text-sm text-muted">
              {game.enabled ? en.dash.games.on : en.dash.games.off}
            </span>
          </li>
        ))}
      </ul>

      {/*
        Both games arrive on (`defaultVenueGames`), so this screen confirms
        rather than configures — turning one off is a decision for /dash/games,
        where it can be made mid-service and carries a timestamp.
      */}
      <form action={advanceStep}>
        <input type="hidden" name="step" value="GAMES" />
        <button type="submit" className={BUTTON}>
          {en.onboarding.games.submit}
        </button>
      </form>
    </>
  )
}
