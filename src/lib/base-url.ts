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
 * No `server-only` here: `NEXT_PUBLIC_BASE_URL` is a public origin by
 * definition, and the printed table tents render it into the page.
 */
export function publicBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL
  if (!base) {
    throw new Error(
      'NEXT_PUBLIC_BASE_URL is not set. Every sign-in link and printed QR would point at the wrong origin — copy .env.example to .env and fill it in.'
    )
  }
  return base.replace(/\/+$/, '')
}
