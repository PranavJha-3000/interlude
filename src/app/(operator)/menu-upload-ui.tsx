import { en } from '@/strings/en'
import type { MenuDraft } from '@/lib/ai/types'
import { draftCategories } from '@/lib/menu-import'

/**
 * Menu upload, shared between onboarding's MENU step and /dash/menu — the
 * same grid either way, so a re-import later behaves exactly like setup did.
 *
 * Server-rendered, zero client JS. The editable grid is one big form: rows are
 * repeated field names read back with `formData.getAll`, and the include
 * checkbox carries the row index. Plain HTML is enough here, and it keeps the
 * operator surfaces at the same weight discipline as everything else.
 */

const INPUT = 'mt-2 min-h-11 w-full rounded-xl border border-line bg-paper px-3 text-base'

export function MenuUploadForm({
  action,
  error,
}: {
  action: (formData: FormData) => Promise<void>
  error?: string
}) {
  return (
    <section className="mt-10 border-t border-line pt-8">
      <h2 className="text-2xl font-semibold">{en.onboarding.menu.upload.heading}</h2>
      <p className="mt-2 text-lg text-muted">{en.onboarding.menu.upload.body}</p>
      {error && <p className="mt-3 text-sm text-bad">{error}</p>}

      <form action={action} className="mt-5">
        <label htmlFor="menuFile" className="block text-sm text-muted">
          {en.onboarding.menu.upload.fileLabel}
        </label>
        <input
          id="menuFile"
          name="menuFile"
          type="file"
          required
          accept="image/*,application/pdf,.csv,text/csv"
          className={INPUT}
        />
        <p className="mt-2 text-sm text-muted">{en.onboarding.menu.upload.csvHint}</p>
        <button
          type="submit"
          className="mt-4 min-h-11 w-full rounded-xl border border-line px-5 text-base font-semibold"
        >
          {en.onboarding.menu.upload.submit}
        </button>
      </form>
    </section>
  )
}

export function MenuDraftGrid({
  source,
  draft,
  confirmAction,
  discardAction,
  error,
}: {
  source: string
  draft: MenuDraft
  confirmAction: (formData: FormData) => Promise<void>
  discardAction: () => Promise<void>
  error?: string
}) {
  const categories = draftCategories(draft)

  return (
    <section className="mt-8">
      <h2 className="text-2xl font-semibold">{en.onboarding.menu.upload.draftHeading}</h2>
      <p className="mt-2 text-lg text-muted">{en.onboarding.menu.upload.draftBody}</p>
      <p className="mt-2 text-sm text-muted">
        {en.onboarding.menu.upload.draftFrom(source, draft.items.length)}
      </p>
      {error && <p className="mt-3 text-sm text-bad">{error}</p>}

      {draft.warnings.length > 0 && (
        <ul className="mt-4 rounded-xl border border-line bg-warm px-4 py-3">
          {draft.warnings.map((warning, i) => (
            <li key={i} className="font-mono text-xs text-muted">
              {warning}
            </li>
          ))}
        </ul>
      )}

      <form action={confirmAction} className="mt-6">
        <ul>
          {draft.items.map((item, i) => (
            <li key={i} className="border-t border-line py-3">
              <div className="flex items-start gap-3">
                <label className="flex min-h-11 items-center gap-2 pt-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    name="rowInclude"
                    value={String(i)}
                    defaultChecked
                    className="h-5 w-5 accent-accent"
                  />
                  {en.onboarding.menu.upload.includeLabel}
                </label>
                <div className="flex-1">
                  <input
                    name="rowName"
                    defaultValue={item.name}
                    aria-label={en.onboarding.menu.nameLabel}
                    className={INPUT}
                  />
                  <div className="mt-2 flex gap-3">
                    <input
                      name="rowCategory"
                      defaultValue={item.category}
                      aria-label={en.onboarding.menu.categoryLabel}
                      className={INPUT + ' flex-1'}
                    />
                    <input
                      name="rowPrice"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      defaultValue={item.priceRupees}
                      aria-label={en.onboarding.menu.priceLabel}
                      className={INPUT + ' w-28'}
                    />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <h3 className="mt-8 text-xl font-semibold">{en.onboarding.menu.upload.costPctHeading}</h3>
        <p className="mt-2 text-base text-muted">{en.onboarding.menu.upload.costPctBody}</p>
        {categories.map((category) => (
          <div key={category} className="mt-4">
            <label htmlFor={`costPct-${category}`} className="block text-sm text-muted">
              {en.onboarding.menu.upload.costPctLabel(category)}
            </label>
            <input
              id={`costPct-${category}`}
              name={`costPct:${category}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step="1"
              required
              className={INPUT + ' w-40'}
            />
          </div>
        ))}

        <button
          type="submit"
          className="mt-8 min-h-14 w-full rounded-xl bg-ink px-5 text-lg font-semibold text-paper"
        >
          {en.onboarding.menu.upload.confirm}
        </button>
      </form>

      <form action={discardAction} className="mt-3">
        <button type="submit" className="min-h-11 w-full text-sm text-muted underline">
          {en.onboarding.menu.upload.discard}
        </button>
      </form>
    </section>
  )
}
