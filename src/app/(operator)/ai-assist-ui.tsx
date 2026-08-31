import Link from 'next/link'
import { en } from '@/strings/en'
import type { NarrationDraftView } from '@/lib/ai-drafts'

/**
 * Shared pieces for the AI Assist areas (PLATFORM.md §6a).
 *
 * Server-rendered, zero client JS, the same weight discipline as the menu
 * upload grid. Every element a model produced carries the AI DRAFT badge and
 * the same three actions — approve, edit, reject — wherever it appears.
 */

export function AiDraftBadge() {
  return (
    <span className="inline-block rounded-full border border-line px-2 py-0.5 font-mono text-[10px] tracking-widest text-muted uppercase">
      {en.dash.aiAssist.draftBadge}
    </span>
  )
}

export function AiDraftActions({
  draftId,
  approveAction,
  rejectAction,
  editHref,
}: {
  draftId: string
  approveAction: (formData: FormData) => Promise<void>
  rejectAction: (formData: FormData) => Promise<void>
  editHref: string
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <form action={approveAction}>
        <input type="hidden" name="draftId" value={draftId} />
        <button
          type="submit"
          className="min-h-9 rounded-xl bg-ink px-4 text-xs font-semibold text-paper"
        >
          {en.dash.aiAssist.approve}
        </button>
      </form>
      <Link
        href={editHref}
        className="min-h-9 rounded-xl border border-line px-4 text-xs font-semibold leading-[2.25rem]"
      >
        {en.dash.aiAssist.edit}
      </Link>
      <form action={rejectAction}>
        <input type="hidden" name="draftId" value={draftId} />
        <button type="submit" className="min-h-9 rounded-xl border-2 border-line px-4 text-xs">
          {en.dash.aiAssist.reject}
        </button>
      </form>
    </div>
  )
}

/**
 * One draft card — any kind. The header always names the draft and carries the
 * AI DRAFT badge; the body is the draft's own shape; the actions are the same
 * three everywhere.
 */
export function DraftCard({
  title,
  badge,
  draftId,
  approveAction,
  rejectAction,
  editHref,
  children,
}: {
  title: string
  badge?: boolean
  draftId: string
  approveAction: (formData: FormData) => Promise<void>
  rejectAction: (formData: FormData) => Promise<void>
  editHref: string
  children: React.ReactNode
}) {
  return (
    <li className="rounded-xl border border-line bg-warm p-4">
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm font-medium">{title}</p>
        {(badge ?? true) && <AiDraftBadge />}
      </div>
      {children}
      <AiDraftActions
        draftId={draftId}
        approveAction={approveAction}
        rejectAction={rejectAction}
        editHref={editHref}
      />
    </li>
  )
}

/** Outcome lines shared by the pages that host AI Assist sections. */
export function AiStatusLine({ okCount, err }: { okCount?: number; err?: string }) {
  if (err) {
    const message =
      err === 'AI_UNAVAILABLE'
        ? en.dash.aiAssist.unavailable
        : err === 'NO_SERVICES'
          ? en.dash.aiAssist.noServices
          : err
    return <p className="mb-4 text-sm text-bad">{message}</p>
  }
  if (okCount !== undefined) {
    return <p className="mb-4 text-sm">{en.dash.aiAssist.decided(okCount)}</p>
  }
  return null
}

/**
 * The weekly narration card on the command center. The sentences shown were
 * validated against the week's own figures before they were stored — the card
 * renders them, and offers to regenerate or edit, never to compute.
 */
export function NarrationCard({
  drafts,
  generateAction,
  approveAction,
  rejectAction,
  editAction,
  editId,
}: {
  drafts: NarrationDraftView[]
  generateAction: () => Promise<void>
  approveAction: (formData: FormData) => Promise<void>
  rejectAction: (formData: FormData) => Promise<void>
  editAction: (formData: FormData) => Promise<void>
  editId?: string
}) {
  return (
    <section className="mt-10 rounded-2xl border border-line p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{en.dash.aiAssist.narrationHeading}</h2>
        <form action={generateAction}>
          <button
            type="submit"
            className="min-h-9 rounded-xl border border-line px-4 text-xs font-semibold"
          >
            {en.dash.aiAssist.narrationGenerate}
          </button>
        </form>
      </div>
      <p className="mt-1 text-sm text-muted">{en.dash.aiAssist.narrationBody}</p>

      {drafts.map((draft) => (
        <div key={draft.id} className="mt-4 rounded-xl border border-line bg-warm p-4">
          <AiDraftBadge />
          {editId === draft.id ? (
            <form action={editAction} className="mt-3">
              <input type="hidden" name="draftId" value={draft.id} />
              <textarea
                name="sentences"
                rows={3}
                defaultValue={draft.sentences.join('\n')}
                className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-muted">{en.dash.aiAssist.sentencesHint}</p>
              <button
                type="submit"
                className="mt-2 min-h-9 rounded-xl bg-ink px-4 text-xs font-semibold text-paper"
              >
                {en.dash.aiAssist.save}
              </button>
            </form>
          ) : (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
              {draft.sentences.map((sentence, i) => (
                <li key={i}>{sentence}</li>
              ))}
            </ol>
          )}
          <AiDraftActions
            draftId={draft.id}
            approveAction={approveAction}
            rejectAction={rejectAction}
            editHref={`/dash?edit=${draft.id}`}
          />
        </div>
      ))}
    </section>
  )
}