import Link from 'next/link'
import { miniGames } from '@/strings/mini-games'

/** The explicit game picker shown after a guest consents. */
export function GameSelector({
  qrToken,
  games,
  onBeatTheKitchen,
}: {
  qrToken: string
  games: Array<{ slug: 'secret-recipe' | 'mystery-customer'; title: string }>
  onBeatTheKitchen: () => void
}) {
  return (
    <section aria-label={miniGames.selector.heading} className="mt-6">
      <p className="text-xs font-medium tracking-widest text-muted uppercase">
        {miniGames.selector.heading}
      </p>
      <div className="mt-3 grid gap-2">
        <button
          type="button"
          onClick={onBeatTheKitchen}
          className="flex min-h-14 items-center justify-between rounded-xl border-2 border-line px-4 text-left text-base font-medium transition-colors hover:border-ink"
        >
          <span>Beat the Kitchen</span>
          <span aria-hidden className="text-muted">
            &rsaquo;
          </span>
        </button>
        {games.map((g) => (
          <Link
            key={g.slug}
            href={`/t/${qrToken}/play/${g.slug}`}
            className="flex min-h-14 items-center justify-between rounded-xl border-2 border-line px-4 text-base font-medium transition-colors hover:border-ink"
          >
            <span>{g.title}</span>
            <span aria-hidden className="text-muted">
              &rsaquo;
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
