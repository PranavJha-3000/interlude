import { en } from '@/strings/en'
import { formatPaise } from '@/lib/money'
import { DraftCard } from './ai-assist-ui'
import type {
  GameCopyDraftView,
  MysteryCustomerDraftView,
  SecretRecipeDraftView,
} from '@/lib/ai-drafts'

/**
 * AI Assist on /dash/games (PLATFORM.md §6a).
 *
 * Candidate combinations, personas and game copy, drafted only from the
 * venue's active menu and all carrying the AI DRAFT badge until an operator
 * approves them. Approving a combination merges it into `VenueGame.data`;
 * approving a persona merges its budget and cravings. None of it touches the
 * prize engine.
 */

export function GamesAiAssist({
  secretDrafts,
  mysteryDrafts,
  copyDrafts,
  itemNames,
  generateSecret,
  generateMystery,
  generateCopy,
  approve,
  reject,
}: {
  secretDrafts: SecretRecipeDraftView[]
  mysteryDrafts: MysteryCustomerDraftView[]
  copyDrafts: GameCopyDraftView[]
  itemNames: Map<string, string>
  generateSecret: () => Promise<void>
  generateMystery: () => Promise<void>
  generateCopy: (formData: FormData) => Promise<void>
  approve: (formData: FormData) => Promise<void>
  reject: (formData: FormData) => Promise<void>
}) {
  return (
    <section className="mt-10 rounded-2xl border border-line p-5">
      <h2 className="text-lg font-semibold">{en.dash.aiAssist.heading}</h2>
      <p className="mt-1 text-sm text-muted">{en.dash.aiAssist.gamesBody}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {en.dash.aiAssist.secretHeading}
            </h3>
            <form action={generateSecret}>
              <button
                type="submit"
                className="min-h-9 rounded-xl border border-line px-3 text-xs font-semibold"
              >
                {en.dash.aiAssist.gamesSecretCta}
              </button>
            </form>
          </div>
          <ul className="mt-3 grid gap-3">
            {secretDrafts.map((d) => (
              <DraftCard
                key={d.id}
                title={d.discoveryName}
                draftId={d.id}
                approveAction={approve}
                rejectAction={reject}
                editHref={`/dash/games?edit=${d.id}&kind=SECRET_RECIPE`}
              >
                <p className="mt-2 text-xs text-muted">{d.revealCopy}</p>
                <p className="mt-2 text-xs text-muted">
                  {en.dash.aiAssist.items}{' '}
                  {d.itemIds.map((id) => itemNames.get(id) ?? id).join(' + ')}
                </p>
              </DraftCard>
            ))}
            {secretDrafts.length === 0 && (
              <p className="text-sm text-muted">{en.dash.aiAssist.noSecretsYet}</p>
            )}
          </ul>
        </section>
        <section>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {en.dash.aiAssist.mysteryHeading}
            </h3>
            <form action={generateMystery}>
              <button
                type="submit"
                className="min-h-9 rounded-xl border border-line px-3 text-xs font-semibold"
              >
                {en.dash.aiAssist.gamesMysteryCta}
              </button>
            </form>
          </div>
          <ul className="mt-3 grid gap-3">
            {mysteryDrafts.map((d) => (
              <DraftCard
                key={d.id}
                title={d.scenarioCopy}
                draftId={d.id}
                approveAction={approve}
                rejectAction={reject}
                editHref={`/dash/games?edit=${d.id}&kind=MYSTERY_CUSTOMER`}
              >
                <dl className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted">
                  <div>
                    <dt>{en.dash.aiAssist.budget}</dt>
                    <dd className="font-mono tabular-nums">{formatPaise(d.budgetPaise)}</dd>
                  </div>
                  <div>
                    <dt>{en.dash.aiAssist.craving}</dt>
                    <dd>{d.cravings.join(', ')}</dd>
                  </div>
                  <div>
                    <dt>{en.dash.aiAssist.appetite}</dt>
                    <dd>{d.appetiteDishes}</dd>
                  </div>
                </dl>
              </DraftCard>
            ))}
            {mysteryDrafts.length === 0 && (
              <p className="text-sm text-muted">{en.dash.aiAssist.noPersonasYet}</p>
            )}
          </ul>
        </section>
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
            {en.dash.aiAssist.copyHeading}
          </h3>
          <div className="flex gap-2">
            <form action={generateCopy}>
              <input type="hidden" name="game" value="SECRET_RECIPE" />
              <button
                type="submit"
                className="min-h-9 rounded-xl border border-line px-3 text-xs font-semibold"
              >
                {en.dash.aiAssist.copySecretCta}
              </button>
            </form>
            <form action={generateCopy}>
              <input type="hidden" name="game" value="MYSTERY_CUSTOMER" />
              <button
                type="submit"
                className="min-h-9 rounded-xl border border-line px-3 text-xs font-semibold"
              >
                {en.dash.aiAssist.copyMysteryCta}
              </button>
            </form>
          </div>
        </div>

        <ul className="mt-3 grid gap-3">
          {copyDrafts.map((d) => (
            <DraftCard
              key={d.id}
              title={en.dash.aiAssist.copyFor(d.game ?? 'MYSTERY_CUSTOMER')}
              draftId={d.id}
              approveAction={approve}
              rejectAction={reject}
              editHref={`/dash/games?edit=${d.id}&kind=GAME_COPY`}
            >
              <div className="mt-2 grid gap-1 text-sm text-muted">
                <p>
                  <span className="text-xs uppercase">{en.dash.aiAssist.intro}</span> {d.introCopy}
                </p>
                <p>
                  <span className="text-xs uppercase">{en.dash.aiAssist.prompt}</span>{' '}
                  {d.promptCopy}
                </p>
                <p>
                  <span className="text-xs uppercase">{en.dash.aiAssist.discovery}</span>{' '}
                  {d.discoveryCopy}
                </p>
              </div>
            </DraftCard>
          ))}
          {copyDrafts.length === 0 && (
            <p className="text-sm text-muted">{en.dash.aiAssist.noGameCopy}</p>
          )}
        </ul>
      </section>
    </section>
  )
}
