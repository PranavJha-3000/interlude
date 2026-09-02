/**
 * The public origin, and the one place that reads it.
 *
 * It is absent-or-throw rather than absent-with-a-fallback for the same reason
 * `db.ts` throws on `DATABASE_URL` and `operator-session.ts` throws on
 * `SESSION_SECRET`: a localhost default in production is not a degraded mode,
 * it is a silent outage. Every emailed sign-in link would point at the
 * recipient's own machine and nobody would ever be able to sign in, with no
 * error anywhere to say why.
 *
 * `APP_BASE_URL` is intentionally a non-`NEXT_PUBLIC_` variable. The value
 * ships into the table tents and onboarding QR — both server-rendered — and
 * never reaches the browser, so exposing it via the public prefix would be
 * spending a slot on a leak that is not one.
 *
 * A Vercel preview URL (`*.vercel.app`) is refused outright: those are
 * ephemeral branch deployments, and a QR printed from one stops working the
 * day the branch is deleted. The user almost always wants the canonical
 * production origin here, and would rather see a loud error than ship a tent
 * that 404s a month later.
 */

const VERCEL_PREVIEW_HOST = /\.vercel\.app$/i

export function publicBaseUrl(): string {
  const base = process.env.APP_BASE_URL
  if (!base) {
    throw new Error(
      'APP_BASE_URL is not set. Every sign-in link and printed QR would point at the wrong origin — set it in your Vercel project (Production AND Preview environments) to your canonical origin, e.g. https://app.interlude.fit.'
    )
  }
  const trimmed = base.replace(/\/+$/, '')
  if (VERCEL_PREVIEW_HOST.test(safeHost(trimmed))) {
    throw new Error(
      `APP_BASE_URL is a Vercel preview URL (${trimmed}). A QR printed from a preview deployment stops working the day the branch is deleted. Set it in Vercel → Settings → Environment Variables to your canonical production origin, e.g. https://app.interlude.fit, and re-print the tents.`
    )
  }
  return trimmed
}

function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
