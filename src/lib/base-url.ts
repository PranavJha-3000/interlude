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
 * A Vercel *preview or per-deployment* URL is refused: those are ephemeral,
 * and a QR printed from one stops working the day the branch or deployment is
 * deleted. The project's own production origin — a custom domain, or the plain
 * `<project>.vercel.app` alias — is allowed, because that is the stable origin
 * a venue prints tents from. Preview and deployment URLs always carry a marker
 * the production alias never has (`-git-<branch>`, a trailing deployment hash,
 * or a `-<username>` suffix after one), so we refuse the markers, not
 * `.vercel.app` itself. The user almost always wants the canonical production
 * origin here, and would rather see a loud error than ship a tent that 404s a
 * month later.
 */

// The canonical Vercel project domain is exactly `<project>.vercel.app`.
// Preview and per-deployment URLs always add a marker to that label:
//
//   - git branch previews          `proj-git-<branch>[-<hash>].vercel.app`
//   - deployment URLs              `proj-<16-hex-hash>.vercel.app`
//   - old shared previews          `proj-<16-hex-hash>-<username>.vercel.app`
//
// The production alias matches none of those shapes, so refusing the markers
// lets `myinterlude.vercel.app` print tents while an ephemeral `-git-` or
// hashed URL still cannot.
const VERCEL_EPHEMERAL_HOST =
  /(?:-git-|[0-9a-f]{12,}(?:-[a-z0-9-]+)?)\.vercel\.app$/i

export function publicBaseUrl(): string {
  const base = process.env.APP_BASE_URL
  if (!base) {
    throw new Error(
      'APP_BASE_URL is not set. Every sign-in link and printed QR would point at the wrong origin — set it in your Vercel project (Production AND Preview environments) to your canonical origin, e.g. https://app.interlude.fit.'
    )
  }
  const trimmed = base.replace(/\/+$/, '')
  if (VERCEL_EPHEMERAL_HOST.test(safeHost(trimmed))) {
    throw new Error(
      `APP_BASE_URL looks like a Vercel preview or per-deployment URL (${trimmed}). A QR printed from one stops working the day the branch or deployment is deleted. Set it to the project's stable origin — a custom domain, or the plain <project>.vercel.app production alias — and re-print the tents.`
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
