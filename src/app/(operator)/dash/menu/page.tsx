import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { getOperatorWithoutVenue } from '@/lib/operator-session'
import { contributionPaise, formatPaise, paiseToRupeeInput } from '@/lib/money'
import { getMenuDraft } from '@/lib/menu-draft'
import { MenuDraftGrid, MenuUploadForm } from '../../menu-upload-ui'
import {
  addMenuItem,
  confirmDashMenu,
  discardDashMenu,
  setMenuItemActive,
  updateMenuItem,
  uploadDashMenu,
} from './actions'

export const dynamic = 'force-dynamic'

/**
 * The venue's own menu — every field the prize engine reads, editable, and the
 * computed contribution beside the money fields, because contribution is what
 * makes margin tier mean something to the person typing.
 *
 * No hard deletes anywhere on this screen: `Award` rows reference items, so an
 * item leaves service by deactivation and its history stays explicable.
 */

const ERRORS: Record<string, string> = {
  invalid: en.dash.menu.invalid,
  cost_over_price: en.dash.menu.costOverPrice,
  upload_failed: en.onboarding.menu.upload.failed,
  nothing_selected: en.onboarding.menu.upload.nothingSelected,
  missing_cost_pct: en.onboarding.menu.upload.missingCostPct,
}

const INPUT = 'mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3 text-base'
const LABEL = 'block text-xs tracking-widest text-muted uppercase'

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const operator = await getOperatorWithoutVenue()
  if (!operator) redirect('/signin')
  if (!operator.venueId)
    return (
      <Shell>
        <p className="text-lg text-muted">{en.dash.empty}</p>
      </Shell>
    )

  const { error } = await searchParams
  const message = error ? ERRORS[error] : undefined

  const pending = await getMenuDraft(operator.venueId)
  if (pending) {
    return (
      <Shell>
        <MenuDraftGrid
          source={pending.source}
          draft={pending.draft}
          confirmAction={confirmDashMenu}
          discardAction={discardDashMenu}
          error={message}
        />
      </Shell>
    )
  }

  const items = await db.menuItem.findMany({
    where: { venueId: operator.venueId },
    orderBy: [{ active: 'desc' }, { category: 'asc' }, { name: 'asc' }],
  })
  const active = items.filter((i) => i.active)
  const inactive = items.filter((i) => !i.active)

  return (
    <Shell>
      <p className="mb-2 text-lg text-muted">{en.dash.menu.body}</p>
      {message && <p className="mb-4 text-sm text-bad">{message}</p>}
      <p className="mb-8 font-mono text-sm text-muted">
        {en.dash.menu.count(active.length)}
        {inactive.length > 0 && ` · ${en.dash.menu.inactiveCount(inactive.length)}`}
      </p>

      {items.length === 0 && (
        <p className="mb-8 rounded-2xl border border-line bg-warm p-5 text-sm">
          {en.dash.menu.empty} {en.dash.menu.emptyHint}
        </p>
      )}

      <section className="rounded-2xl border border-line p-5">
        <h2 className="text-lg font-semibold">{en.dash.menu.addHeading}</h2>
        <form action={addMenuItem} className="mt-4">
          <ItemFields />
          <button
            type="submit"
            className="mt-5 min-h-11 rounded-xl bg-ink px-6 text-base font-semibold text-paper"
          >
            {en.dash.menu.add}
          </button>
        </form>
      </section>

      <ul className="mt-8 grid gap-4">
        {active.map((item) => (
          <li key={item.id} className="rounded-2xl border border-line p-5">
            <form action={updateMenuItem}>
              <input type="hidden" name="menuItemId" value={item.id} />
              <ItemFields item={item} />
              <div className="mt-4 flex items-center gap-4">
                <button
                  type="submit"
                  className="min-h-11 rounded-xl border-2 border-line px-5 text-sm font-semibold"
                >
                  {en.dash.menu.save}
                </button>
                <span className="ml-auto font-mono text-sm text-muted">
                  {en.dash.menu.contribution}{' '}
                  {formatPaise(contributionPaise(item.pricePaise, item.foodCostPaise))}
                </span>
              </div>
            </form>
            <form action={setMenuItemActive} className="mt-3 border-t border-line pt-3">
              <input type="hidden" name="menuItemId" value={item.id} />
              <input type="hidden" name="active" value="false" />
              <button type="submit" className="text-sm text-muted underline">
                {en.dash.menu.deactivate}
              </button>
              <span className="ml-3 text-xs text-muted">
                {en.dash.menu.deactivateNote(item.name)}
              </span>
            </form>
          </li>
        ))}
      </ul>

      {inactive.length > 0 && (
        <section className="mt-10">
          <h2 className={LABEL}>{en.dash.menu.inactiveHeading}</h2>
          <ul className="mt-3">
            {inactive.map((item) => (
              <li key={item.id} className="flex items-center gap-3 border-t border-line py-3">
                <span className="flex-1 text-muted">{item.name}</span>
                <span className="font-mono text-sm text-muted">{formatPaise(item.pricePaise)}</span>
                <form action={setMenuItemActive}>
                  <input type="hidden" name="menuItemId" value={item.id} />
                  <input type="hidden" name="active" value="true" />
                  <button type="submit" className="text-sm underline">
                    {en.dash.menu.reactivate}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <MenuUploadForm action={uploadDashMenu} />
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="mb-2 text-xs tracking-widest text-muted uppercase">{en.dash.menu.heading}</h1>
      {children}
    </main>
  )
}

/**
 * The shared field set for add and edit. Names match the action's parser.
 * Money fields pre-fill through `paiseToRupeeInput`, never a float.
 */
function ItemFields({
  item,
}: {
  item?: {
    id: string
    name: string
    category: string
    pricePaise: number
    foodCostPaise: number
    marginTier: string
    prepBurden: string
    requiresKitchenWork: boolean
    isHero: boolean
  }
}) {
  const uid = item?.id ?? 'new'
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`name-${uid}`} className={LABEL}>
            {en.dash.menu.nameLabel}
          </label>
          <input id={`name-${uid}`} name="name" required defaultValue={item?.name} className={INPUT} />
        </div>
        <div>
          <label htmlFor={`category-${uid}`} className={LABEL}>
            {en.dash.menu.categoryLabel}
          </label>
          <input
            id={`category-${uid}`}
            name="category"
            required
            defaultValue={item?.category ?? 'mains'}
            className={INPUT}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <div>
          <label htmlFor={`price-${uid}`} className={LABEL}>
            {en.dash.menu.priceLabel}
          </label>
          <input
            id={`price-${uid}`}
            name="price"
            inputMode="decimal"
            required
            defaultValue={item ? paiseToRupeeInput(item.pricePaise) : undefined}
            className={INPUT + ' font-mono'}
          />
        </div>
        <div>
          <label htmlFor={`cost-${uid}`} className={LABEL}>
            {en.dash.menu.costLabel}
          </label>
          <input
            id={`cost-${uid}`}
            name="cost"
            inputMode="decimal"
            required
            defaultValue={item ? paiseToRupeeInput(item.foodCostPaise) : undefined}
            className={INPUT + ' font-mono'}
          />
        </div>
        <div>
          <label htmlFor={`marginTier-${uid}`} className={LABEL}>
            {en.dash.menu.marginLabel}
          </label>
          <select
            id={`marginTier-${uid}`}
            name="marginTier"
            defaultValue={item?.marginTier ?? 'MID'}
            className={INPUT}
          >
            <option value="HIGH">HIGH</option>
            <option value="MID">MID</option>
            <option value="LOW">LOW</option>
          </select>
        </div>
        <div>
          <label htmlFor={`prepBurden-${uid}`} className={LABEL}>
            {en.dash.menu.prepLabel}
          </label>
          <select
            id={`prepBurden-${uid}`}
            name="prepBurden"
            defaultValue={item?.prepBurden ?? 'LOW'}
            className={INPUT}
          >
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="requiresKitchenWork"
            defaultChecked={item?.requiresKitchenWork ?? true}
            className="h-5 w-5 accent-ink"
          />
          {en.dash.menu.kitchenWorkLabel}
          <span className="text-xs text-muted">{en.dash.menu.kitchenWorkHelp}</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isHero"
            defaultChecked={item?.isHero ?? false}
            className="h-5 w-5 accent-ink"
          />
          {en.dash.menu.heroLabel}
          <span className="text-xs text-muted">{en.dash.menu.heroHelp}</span>
        </label>
      </div>
    </div>
  )
}
