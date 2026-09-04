'use client'

import Link from 'next/link'
import { en } from '@/strings/en'
import { startService, endService } from './actions'
import { SubmitButton } from '../../(staff)/SubmitButton'

/**
 * Tonight's service card: the operational section of the command center. It
 * shows the state and offers the one action the state calls for — Start
 * Service when idle, End Service when running. The Start button is ink, not
 * accent: money owns the accent ledger on this screen, and a control is not
 * money. End Service is a bordered, secondary control, also ink, with a
 * confirm step so a misclick does not close a live night.
 *
 * A client component because End Service guards on a `window.confirm` — the
 * one interaction the card owns. The parent server page hands it the facts
 * (status, games, tables engaged) as props; it owns nothing but the tap.
 */
export function ServiceCard({
  status,
  running,
  killed,
  games,
  tablesEngaged,
}: {
  status: string | null
  running: boolean
  killed: boolean
  games: string[]
  tablesEngaged: number | null
}) {
  return (
    <section className="mt-10 rounded-2xl border border-line bg-warm p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {status !== null && <p className="text-lg font-medium">{status}</p>}
        {running ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dash/activity"
              className="rounded-xl border border-ink px-4 py-2.5 text-sm font-medium transition-state hover:bg-ink hover:text-paper"
            >
              {en.dash.service.viewTonight}
            </Link>
            <form action={endService}>
              <SubmitButton
                type="submit"
                className="min-h-11 rounded-xl border-2 border-ink bg-paper px-4 text-sm font-semibold text-ink transition-state hover:bg-ink hover:text-paper"
                onClick={(event) => {
                  if (!window.confirm(en.dash.service.endConfirm)) event.preventDefault()
                }}
              >
                {en.dash.service.end}
              </SubmitButton>
            </form>
          </div>
        ) : (
          <form action={startService}>
            <SubmitButton
              type="submit"
              className="min-h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-paper transition-state active:bg-ink-warm"
            >
              {en.floor.service.start}
            </SubmitButton>
          </form>
        )}
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs tracking-wide text-muted uppercase">
            {en.dash.service.gamesLabel}
          </dt>
          <dd className="mt-1 text-sm">
            {games.length === 0 ? (
              <span className="text-muted">{en.dash.service.noGames}</span>
            ) : (
              games.join(' · ')
            )}
          </dd>
        </div>
        {tablesEngaged !== null && (
          <div>
            <dt className="text-xs tracking-wide text-muted uppercase">
              {en.dash.service.tablesEngaged}
            </dt>
            <dd className="mt-1 font-mono text-sm tabular-nums">{tablesEngaged}</dd>
          </div>
        )}
      </dl>

      {/* The chef's emergency stop is state the owner must not discover later:
          a night with prizes stopped reads differently in the morning. */}
      {killed && (
        <p className="mt-4 rounded-xl border border-line bg-paper px-3 py-2 text-sm">
          {en.dash.service.stopped}
        </p>
      )}
    </section>
  )
}