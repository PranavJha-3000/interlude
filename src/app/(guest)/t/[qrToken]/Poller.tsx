'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Refreshes the server component on an interval.
 *
 * Intervals are per-surface rather than a blanket 2s. With multiplayer cut,
 * the guest countdown needs no polling at all — it runs off a server-issued
 * end timestamp — so the only things worth asking about are state changes:
 * has the order been fired, has the server confirmed the prize. A 3-hour
 * service across 30 tables is tens of thousands of requests, and most of them
 * were never necessary.
 */
export function Poller({ everyMs }: { everyMs: number }) {
  const router = useRouter()

  useEffect(() => {
    let stopped = false

    const tick = () => {
      // Nothing changes while the phone is in a pocket, and waking a sleeping
      // serverless database to say so is pure waste.
      if (document.visibilityState === 'visible' && !stopped) router.refresh()
    }

    const id = setInterval(tick, everyMs)
    document.addEventListener('visibilitychange', tick)
    return () => {
      stopped = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [everyMs, router])

  return null
}
