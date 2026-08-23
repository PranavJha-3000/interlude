import Link from 'next/link'
import { miniGames } from '@/strings/mini-games'

/**
 * `PLAY WHILE YOU WAIT` — the picker between the table's games.
 *
 * Rendered above the Beat-the-Kitchen start card, which remains the primary
 * action below it. Each entry links straight into its game; the launch is the
 * tap, with no intermediate screen and nothing to sign (§7 — no account
 * creation before gameplay). Games the venue disabled, or Secret Recipe
 * without any combinations configured, simply do not appear.
 *
 * `href`s point at `/t/[qrToken]/play/[game]`, which owns the mini-game
 * surfaces; Beat the Kitchen keeps its in-place start flow underneath.
 */
export function GameSelector({
  qrToken,
  games,
}: {
  qrToken: string
  games: Array<{ slug: 'secret-recipe' | 'mystery-customer'; title: string }>
}) {
  if (games.length === 0) return null

  return (
    <section aria-label={miniGames.selector.heading} className="mt-6">
      <p className="text-xs font-medium tracking-widest text-muted uppercase">
        {miniGames.selector.heading}
      </p>
      <div className="mt-3 grid gap-2">
        {games.map((g) => (
          <Link
            key={g.slug}
            href={`/t/${qrToken}/play/${g.slug}`}
            className="flex min-h-14 items-center justify-between rounded-xl border-2 border-line px-4 text-base font-medium transition-colors hover:border-ink"
          >
            <span>{g.title}</span>
            <span aria-hidden className="text-muted">
              ›
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
