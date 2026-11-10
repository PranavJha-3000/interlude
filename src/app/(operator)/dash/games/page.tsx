import { redirect } from 'next/navigation'
import Link from 'next/link'
import { en } from '@/strings/en'
import { miniGames } from '@/strings/mini-games'
import { db } from '@/lib/db'
import { getOperatorWithoutVenue } from '@/lib/operator-session'
import { listVenueGames } from '@/lib/service'
import { MECHANICS, type Mechanic } from '@/core/prize-engine'
import {
  gameCopyDraftViews,
  mysteryCustomerDraftViews,
  secretRecipeDraftViews,
} from '@/lib/ai-drafts'
import { rankingReadiness } from '@/lib/table-run'
import { GamesAiAssist } from '../../game-ai-assist'
import {
  approveGameDraft,
  editGameDraft,
  generateGameCopyForVenue,
  generateMysteryCustomerDraftsForVenue,
  generateSecretRecipeDraftsForVenue,
  rejectGameDraft,
  toggleGame,
} from './actions'

export const dynamic = 'force-dynamic'

/**
 * Which games this venue runs.
 *
 * Turning one off stops new rounds offering it; a round already in progress
 * finishes on the rules it started under, because the mechanic is written to the
 * `Play` row at the start and the award is decided from that.
 *
 * The AI Assist panel drafts combinations, personas and copy from the venue's
 * own menu. Nothing is live until approved (PLATFORM.md §6a).
 */
export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; aiOk?: string; edit?: string; kind?: string }>
}) {
  // Venue-less is a signed-in state, not a signed-out one — signup and sign-in
  // are the same request, so a first-time operator holds a valid session and no
  // venue yet.
  const operator = await getOperatorWithoutVenue()
  if (!operator) redirect('/signin')
  if (!operator.venueId)
    return (
      <Shell>
        <p className="text-lg text-muted">{en.dash.empty}</p>
      </Shell>
    )

  // Every mechanic the platform knows, with this venue's rows joined onto it —
  // not the rows alone. A mechanic with no row reads as off and its toggle
  // writes one, so a venue that somehow has no rows is a venue with everything
  // switched off rather than a venue with an empty screen and a guest surface
  // that says it is closed.
  // Rows for retired mechanics are history, not options — they stay in the
  // table for the audit trail and off this screen.
  const rows = (await listVenueGames(operator.venueId)).filter((r) =>
    MECHANICS.some((m) => m === r.mechanic)
  )
  const games = [
    ...rows,
    ...MECHANICS.filter((m) => !rows.some((r) => r.mechanic === m)).map((mechanic) => ({
      mechanic,
      enabled: false,
    })),
  ]
  const allOff = games.every((g) => !g.enabled)

  const params = await searchParams
  const editId = params.edit
  const editKind =
    params.kind === 'SECRET_RECIPE' ||
    params.kind === 'MYSTERY_CUSTOMER' ||
    params.kind === 'GAME_COPY'
      ? params.kind
      : null

  const [secretDrafts, mysteryDrafts, copyDrafts, menu] = await Promise.all([
    secretRecipeDraftViews(operator.venueId),
    mysteryCustomerDraftViews(operator.venueId),
    gameCopyDraftViews(operator.venueId),
    db.menuItem.findMany({
      where: { venueId: operator.venueId },
      select: { id: true, name: true, active: true, trailingSales: true, chefRank: true },
    }),
  ])
  const itemNames = new Map(menu.map((m) => [m.id, m.name]))
  // Beat the Kitchen needs ranking data.  On a fresh venue the runtime
  // assigns a default order from the menu's own category/name sort, so the
  // game is playable immediately — but the operator should see that the
  // engine is on a placeholder and be one click from taking control.
  const beatTheKitchenReadiness = rankingReadiness(menu)

  const message =
    params.error === 'ai_unavailable'
      ? en.dash.aiAssist.unavailable
      : params.error === 'ai_menu_changed'
        ? en.dash.aiAssist.menuChanged
        : params.error === 'ai_not_found'
          ? en.dash.aiAssist.nothing
          : params.error === 'ai_invalid'
            ? en.dash.aiAssist.generic
            : params.error
              ? en.dash.aiAssist.failed
              : undefined

  return (
    <Shell>
      <p className="mb-8 text-lg text-muted">{en.dash.games.body}</p>
      {message && <p className="mb-4 text-sm text-bad">{message}</p>}
      {params.aiOk && (
        <p className="mb-4 text-sm">{en.dash.aiAssist.decided(Number(params.aiOk))}</p>
      )}

      {allOff && (
        <p className="mb-6 rounded-2xl border border-line bg-warm p-5 text-sm">
          {en.dash.games.allOffWarning}
        </p>
      )}

      <ul className="grid gap-4">
        {games.map((game) => (
          <li
            key={game.mechanic}
            className="flex items-start justify-between gap-6 rounded-2xl border border-line p-5"
          >
            <div>
              <p className="text-lg font-semibold">{nameOf(game.mechanic)}</p>
              <p className="mt-1 text-sm text-muted">{blurbOf(game.mechanic)}</p>
              {game.mechanic === 'BEAT_THE_KITCHEN' && game.enabled && (
                <BeatTheKitchenNote readiness={beatTheKitchenReadiness} />
              )}
              <p className="mt-2 text-xs tracking-widest text-muted uppercase">
                {game.enabled ? en.dash.games.on : en.dash.games.off}
              </p>
            </div>
            <form action={toggleGame}>
              <input type="hidden" name="mechanic" value={game.mechanic} />
              <input type="hidden" name="enabled" value={game.enabled ? 'false' : 'true'} />
              <button
                type="submit"
                className="min-h-11 rounded-xl border-2 border-line px-4 text-sm"
              >
                {game.enabled ? en.dash.games.turnOff : en.dash.games.turnOn}
              </button>
            </form>
          </li>
        ))}
      </ul>

      {/* ── AI Assist (§6a) — drafts only, approval required. ── */}
      <GamesAiAssist
        secretDrafts={secretDrafts}
        mysteryDrafts={mysteryDrafts}
        copyDrafts={copyDrafts}
        itemNames={itemNames}
        generateSecret={generateSecretRecipeDraftsForVenue}
        generateMystery={generateMysteryCustomerDraftsForVenue}
        generateCopy={generateGameCopyForVenue}
        approve={approveGameDraft}
        reject={rejectGameDraft}
      />

      {editId && editKind && <EditDraftForm id={editId} kind={editKind} action={editGameDraft} />}
    </Shell>
  )
}

const INPUT = 'mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3 text-sm'
const SAVE = 'min-h-9 rounded-xl bg-ink px-4 text-xs font-semibold text-paper'
const CANCEL = 'min-h-9 rounded-xl border border-line px-4 text-xs font-semibold leading-[2.25rem]'

/** Inline operator edit form — the draft stays DRAFT until separately approved. */
function EditDraftForm({
  id,
  kind,
  action,
}: {
  id: string
  kind: 'SECRET_RECIPE' | 'MYSTERY_CUSTOMER' | 'GAME_COPY'
  action: (formData: FormData) => Promise<void>
}) {
  return (
    <form action={action} className="mt-6 rounded-2xl border border-line bg-warm p-5">
      <input type="hidden" name="draftId" value={id} />
      <input type="hidden" name="kind" value={kind} />
      {kind === 'SECRET_RECIPE' && (
        <>
          <label className="block text-xs tracking-widest text-muted uppercase">
            {en.dash.aiAssist.discoveryName}
          </label>
          <input name="discoveryName" className={INPUT} />
          <label className="mt-3 block text-xs tracking-widest text-muted uppercase">
            {en.dash.aiAssist.revealCopy}
          </label>
          <input name="revealCopy" className={INPUT} />
        </>
      )}
      {kind === 'MYSTERY_CUSTOMER' && (
        <>
          <label className="block text-xs tracking-widest text-muted uppercase">
            {en.dash.aiAssist.scenario}
          </label>
          <input name="scenarioCopy" className={INPUT} />
          <label className="mt-3 block text-xs tracking-widest text-muted uppercase">
            {en.dash.aiAssist.budget} (₹)
          </label>
          <input name="budgetRupees" className={INPUT} />
          <label className="mt-3 block text-xs tracking-widest text-muted uppercase">
            {en.dash.aiAssist.craving} (comma-separated)
          </label>
          <input name="cravings" className={INPUT} />
        </>
      )}
      {kind === 'GAME_COPY' && (
        <>
          <label className="block text-xs tracking-widest text-muted uppercase">
            {en.dash.aiAssist.intro}
          </label>
          <input name="introCopy" className={INPUT} />
          <label className="mt-3 block text-xs tracking-widest text-muted uppercase">
            {en.dash.aiAssist.prompt}
          </label>
          <input name="promptCopy" className={INPUT} />
          <label className="mt-3 block text-xs tracking-widest text-muted uppercase">
            {en.dash.aiAssist.discovery}
          </label>
          <input name="discoveryCopy" className={INPUT} />
        </>
      )}
      <div className="mt-3 flex gap-2">
        <button type="submit" className={SAVE}>
          {en.dash.aiAssist.save}
        </button>
        <Link href="/dash/games" className={CANCEL}>
          {en.dash.aiAssist.cancel}
        </Link>
      </div>
    </form>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="mb-2 text-xs tracking-widest text-muted uppercase">{en.dash.games.heading}</h1>
      {children}
    </main>
  )
}

function nameOf(mechanic: Mechanic): string {
  if (mechanic === 'MYSTERY_PLATE') return en.dash.games.mysteryPlate
  if (mechanic === 'KITCHEN_ROUND') return en.dash.games.kitchenRound
  if (mechanic === 'SECRET_RECIPE') return miniGames.secretRecipe.title
  if (mechanic === 'MYSTERY_CUSTOMER') return miniGames.mysteryCustomer.title
  return en.dash.games.beatTheKitchen
}

function blurbOf(mechanic: Mechanic): string {
  if (mechanic === 'MYSTERY_PLATE') return en.dash.games.mysteryPlateBlurb
  if (mechanic === 'KITCHEN_ROUND') return en.dash.games.kitchenRoundBlurb
  if (mechanic === 'SECRET_RECIPE')
    return 'Ingredient combinations that reveal secret menu pairings.'
  if (mechanic === 'MYSTERY_CUSTOMER')
    return 'Guests build a meal for a mystery customer and see how it scores.'
  return en.dash.games.beatTheKitchenBlurb
}

/**
 * Beat the Kitchen's ranking-basis note — shown only when the game is on.
 *
 * The note is an honest label of what the engine is currently doing, not a
 * warning, so the operator understands why the game is playable on day one
 * and what they could change to take control.
 */
function BeatTheKitchenNote({
  readiness,
}: {
  readiness: ReturnType<typeof rankingReadiness>
}) {
  if (readiness.kind === 'SALES' || readiness.kind === 'CHEF') {
    return (
      <p className="mt-2 text-xs text-muted">
        {readiness.kind === 'SALES'
          ? en.dash.games.rankingBasisSales
          : en.dash.games.rankingBasisChef}
      </p>
    )
  }
  if (readiness.kind === 'TOO_FEW') {
    return (
      <p className="mt-2 text-xs text-bad">{en.dash.games.rankingReadyTooFew}</p>
    )
  }
  return (
    <p className="mt-2 text-xs text-muted">{en.dash.games.rankingReadyDefault}</p>
  )
}
