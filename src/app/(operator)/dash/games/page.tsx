import { redirect } from 'next/navigation'
import { en } from '@/strings/en'
import { getOperatorWithoutVenue } from '@/lib/operator-session'
import { listVenueGames } from '@/lib/service'
import { MECHANICS, type Mechanic } from '@/core/prize-engine'
import { toggleGame } from './actions'

export const dynamic = 'force-dynamic'

/**
 * Which games this venue runs.
 *
 * Turning one off stops new rounds offering it; a round already in progress
 * finishes on the rules it started under, because the mechanic is written to the
 * `Play` row at the start and the award is decided from that.
 */
export default async function GamesPage() {
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
  const rows = await listVenueGames(operator.venueId)
  const games = [
    ...rows,
    ...MECHANICS.filter((m) => !rows.some((r) => r.mechanic === m)).map((mechanic) => ({
      mechanic,
      enabled: false,
    })),
  ]
  const allOff = games.every((g) => !g.enabled)

  return (
    <Shell>
      <p className="mb-8 text-lg text-muted">{en.dash.games.body}</p>

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
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="mb-2 text-xs tracking-widest text-muted uppercase">{en.dash.games.heading}</h1>
      {children}
    </main>
  )
}

function nameOf(mechanic: Mechanic): string {
  return mechanic === 'MYSTERY_PLATE' ? en.dash.games.mysteryPlate : en.dash.games.kitchenRound
}

function blurbOf(mechanic: Mechanic): string {
  return mechanic === 'MYSTERY_PLATE'
    ? en.dash.games.mysteryPlateBlurb
    : en.dash.games.kitchenRoundBlurb
}
