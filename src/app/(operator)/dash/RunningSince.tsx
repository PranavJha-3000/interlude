'use client'

import { useEffect, useState } from 'react'

/**
 * A wall clock for the dashboard's "running since" line. Renders the venue's
 * own wall time and re-renders every second so the line never feels static.
 *
 * The server is the source of the time, so the initial paint is correct even
 * with JS off — the first render is whatever the server stamped, the tick is
 * the polish. The timezone is passed in as a prop rather than read off the
 * venue's row here, because the parent server component is the one place that
 * already has it.
 */
export function RunningSince({
  startedAtMs,
  timezone,
  prefix,
}: {
  startedAtMs: number
  timezone: string
  prefix: string
}) {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // The first render paints the server-stamped time so the line is never
  // empty before the first tick lands. The tick is the polish, not the
  // source of truth.
  const current = now ?? startedAtMs
  const since = formatHm(startedAtMs, timezone)
  const elapsed = ` · ${formatElapsed(current - startedAtMs)}`

  return (
    <span className="tabular-nums">
      {prefix}
      {since}
      <span className="text-muted">{elapsed}</span>
    </span>
  )
}

function formatHm(atMs: number, timezone: string): string {
  return new Date(atMs).toLocaleTimeString('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}
