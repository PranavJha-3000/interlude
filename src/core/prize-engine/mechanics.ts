import type { Mechanic } from './types'

/**
 * Every mechanic the platform knows how to run, in the order a venue meets them.
 *
 * This list — not a venue's `VenueGame` rows — is what `/dash/games` renders. A
 * venue whose rows are missing, because a mechanic shipped after it was created
 * or because its creation half-failed, must still be able to switch a game on;
 * rendering the rows alone would leave it looking at an empty page with a guest
 * surface that says the venue is closed.
 *
 * Adding a mechanic is therefore an entry here and an entry in
 * `defaultVenueGames()` — no migration and no backfill, which is what the
 * `VenueGame` schema comment promises.
 */
export const MECHANICS = ['BEAT_THE_KITCHEN', 'SECRET_RECIPE', 'MYSTERY_CUSTOMER'] as const satisfies readonly Mechanic[]
