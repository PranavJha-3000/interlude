import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { getOperatorWithoutVenue } from '@/lib/operator-session'
import { contributionPaise, formatPaise, paiseToRupeeInput } from '@/lib/money'
import { getMenuDraft } from '@/lib/menu-draft'
import { itemDescriptionDraftsByItem } from '@/lib/ai-drafts'
import { MenuDraftGrid, MenuUploadForm } from '../../menu-upload-ui'
import { AiDraftBadge, AiDraftActions } from '../../ai-assist-ui'
import {
  addMenuItem,
  approveMenuItemDescriptionDraft,
  confirmDashMenu,
  discardDashMenu,
  editMenuItemDescriptionDraft,
  generateMenuItemDescriptions,
  rejectMenuItemDescriptionDraft,
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
 *
 * The AI Assist section drafts one playful line per active item. The model
 * never writes to a `MenuItem` row; an approve action does, and only after
 * the operator has decided (PLATFORM.md §6a).
 */

const ERRORS: Record<string, string> = {
  invalid: en.dash.menu.invalid,
  cost_over_price: en.dash.menu.costOverPrice,
  upload_failed: en.onboarding.menu.upload.failed,
  empty: en.onboarding.menu.upload.empty,
  too_large: en.onboarding.menu.upload.tooLarge,
  unsupported: en.onboarding.menu.upload.unsupported,
  csv_header: en.onboarding.menu.upload.csvHeader,
  csv_empty: en.onboarding.menu.upload.csvEmpty,
  // The menu upload's AI keys are deliberately distinct from the AI Assist
  // `ai_*` keys: both fail for the same reason (no model wired in), but "menu
  // reader" is the clearer copy on a screen whose previous line was "upload
  // a menu".
  upload_ai_unavailable: en.onboarding.menu.upload.aiUnavailable,
  upload_ai_auth: en.onboarding.menu.upload.aiAuth,
  upload_ai_quota: en.onboarding.menu.upload.aiQuota,
  upload_ai_failed: en.onboarding.menu.upload.aiFailed,
  no_items: en.onboarding.menu.upload.noItems,
  nothing_selected: en.onboarding.menu.upload.nothingSelected,
  missing_cost_pct: en.onboarding.menu.upload.missingCostPct,
  ai_unavailable: en.dash.aiAssist.unavailable,
  ai_failed: en.dash.aiAssist.failed,
  ai_not_found: en.dash.aiAssist.nothing,
  ai_item_gone: en.dash.aiAssist.menuChanged,
  ai_menu_changed: en.dash.aiAssist.menuChanged,
  ai_invalid: en.dash.aiAssist.generic,
}

const INPUT = 'mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3 text-base'
const LABEL = 'block text-xs tracking-widest text-muted uppercase'

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; aiOk?: string; edit?: string }>
}) {
  const operator = await getOperatorWithoutVenue()
  if (!operator) redirect('/signin')
  if (!operator.venueId)
    return (
      <Shell>
        <p className="text-lg text-muted">{en.dash.empty}</p>
      </Shell>
    )

  const { error, aiOk, edit } = await searchParams
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
  const draftsByItem = await itemDescriptionDraftsByItem(operator.venueId)

  return (
    <Shell>
      <p className="mb-2 text-lg text-muted">{en.dash.menu.body}</p>
      {message && <p className="mb-4 text-sm text-bad">{message}</p>}
      {aiOk && <p className="mb-4 text-sm">{en.dash.aiAssist.decided(Number(aiOk))}</p>}
      <p className="mb-8 font-mono text-sm text-muted">
        {en.dash.menu.count(active.length)}
        {inactive.length > 0 && ` · ${en.dash.menu.inactiveCount(inactive.length)}`}
      </p>

      {items.length === 0 && (
        <p className="mb-8 rounded-2xl border border-line bg-warm p-5 text-sm">
          {en.dash.menu.empty} {en.dash.menu.emptyHint}
        </p>
      )}

      {/* ── AI Assist (§6a) — drafts only, approval required. ── */}
      <section className="mt-10 rounded-2xl border border-line p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{en.dash.aiAssist.heading}</h2>
            <p className="mt-1 text-sm text-muted">{en.dash.aiAssist.menuBody}</p>
          </div>
          <form action={generateMenuItemDescriptions}>
            <button
              type="submit"
              disabled={active.length === 0}
              className="min-h-9 rounded-xl border border-line px-4 text-xs font-semibold disabled:opacity-60"
            >
              {en.dash.aiAssist.menuGenerate}
            </button>
          </form>
        </div>

        {active.length === 0 && (
          <p className="mt-4 text-sm text-muted">{en.dash.aiAssist.noItems}</p>
        )}

        {active.filter((i) => draftsByItem.has(i.id)).length === 0 && active.length > 0 && (
          <p className="mt-4 text-sm text-muted">
            {en.dash.aiAssist.decided(0)} {en.dash.aiAssist.menuGenerate}
          </p>
        )}

        <ul className="mt-4 grid gap-3">
          {active
            .filter((item) => draftsByItem.has(item.id))
            .map((item) => {
              const draft = draftsByItem.get(item.id)!
              const approvedLine = item.aiDescription
              return (
                <li key={item.id} className="rounded-xl border border-line bg-warm p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex-1 text-sm font-medium">{item.name}</span>
                    {draft ? <AiDraftBadge /> : null}
                  </div>

                  {approvedLine && (
                    <p className="mt-2 text-xs text-muted">
                      {en.dash.aiAssist.approvedLabel} {approvedLine}
                    </p>
                  )}

                  {draft && (
                    <>
                      {edit === draft.id ? (
                        <form action={editMenuItemDescriptionDraft} className="mt-3">
                          <input type="hidden" name="draftId" value={draft.id} />
                          <textarea
                            name="description"
                            rows={2}
                            defaultValue={draft.description}
                            className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm"
                          />
                          <div className="mt-2 flex gap-2">
                            <button
                              type="submit"
                              className="min-h-9 rounded-xl bg-ink px-4 text-xs font-semibold text-paper"
                            >
                              {en.dash.aiAssist.save}
                            </button>
                            <Link
                              href="/dash/menu"
                              className="min-h-9 rounded-xl border border-line px-4 text-xs font-semibold leading-[2.25rem]"
                            >
                              {en.dash.aiAssist.cancel}
                            </Link>
                          </div>
                        </form>
                      ) : (
                        <p className="mt-2 text-sm leading-relaxed text-ink">{draft.description}</p>
                      )}
                      <AiDraftActions
                        draftId={draft.id}
                        approveAction={approveMenuItemDescriptionDraft}
                        rejectAction={rejectMenuItemDescriptionDraft}
                        editHref={`/dash/menu?edit=${draft.id}`}
                      />
                    </>
                  )}
                </li>
              )
            })}
        </ul>
      </section>

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
            {item.aiDescription && (
              <p className="mb-3 text-sm text-muted">
                {en.dash.aiAssist.approvedLabel}{' '}
                <span className="text-ink">{item.aiDescription}</span>
              </p>
            )}
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
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
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
          <input
            id={`name-${uid}`}
            name="name"
            required
            defaultValue={item?.name}
            className={INPUT}
          />
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
