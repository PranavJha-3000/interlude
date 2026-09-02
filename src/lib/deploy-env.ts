/**
 * The boot-time environment check (TODO.md build item 8).
 *
 * Every variable already refuses at its own point of use — `db.ts` on
 * `DATABASE_URL`, `base-url.ts` on `APP_BASE_URL`, `email.ts` on
 * `RESEND_API_KEY`. Those refusals stay; they are the last line. This module is
 * the first line, and it exists because "throws at first use" and "fails at
 * boot" are not the same promise:
 *
 *   - A deployment with no `SESSION_SECRET` starts, serves `/`, survives a
 *     smoke test, and throws on the first guest scan — 8pm on a Saturday, in a
 *     restaurant, with nobody from us in the room.
 *   - A deployment with no `CRON_SECRET` never throws at all. The Monday route
 *     answers 404, which is exactly what it should do, and the weekly report
 *     silently never arrives.
 *
 * So the check runs once, at start, and names everything wrong at the same
 * time. One redeploy per missing variable is how a launch slips a day.
 *
 * No `server-only`: `scripts/check-env.mts` runs this as a build gate, so a bad
 * environment fails the deploy rather than the running server. That ordering
 * matters — a failed Vercel build leaves the previous deployment serving.
 */

export type Severity = 'fatal' | 'warning'

export interface EnvProblem {
  variable: string
  severity: Severity
  /** Written for whoever is staring at a failed deploy, not for a log parser. */
  problem: string
}

/** Anything shorter is worth guessing at, and it signs three kinds of cookie. */
const MIN_SECRET_LENGTH = 32

type Env = Record<string, string | undefined>

function missing(value: string | undefined): boolean {
  return !value || value.trim() === ''
}

/**
 * Is this a real deployment — something a guest, a server or an owner can open?
 *
 * Keyed on `VERCEL_ENV` rather than `NODE_ENV` on purpose. The E2E suite runs
 * `next build && next start`, which is `NODE_ENV=production` and is nobody's
 * deployment; it legitimately has no `RESEND_API_KEY` and no `CRON_SECRET`.
 * Keying on `NODE_ENV` would fail the suite for being a laptop.
 *
 * Preview counts. A preview URL is a real origin that real people open, and a
 * preview with a localhost base URL prints QR codes that go nowhere.
 */
export function isDeployment(env: Env = process.env): boolean {
  return env.VERCEL_ENV === 'production' || env.VERCEL_ENV === 'preview'
}

/**
 * Everything wrong with an environment, as a list. Pure — it reads the record
 * it is handed and nothing else, so the whole matrix is unit-testable without
 * a process to misconfigure.
 */
export function checkDeploymentEnv(env: Env): EnvProblem[] {
  const problems: EnvProblem[] = []
  const fatal = (variable: string, problem: string) =>
    problems.push({ variable, severity: 'fatal', problem })
  const warn = (variable: string, problem: string) =>
    problems.push({ variable, severity: 'warning', problem })

  // --- Database ------------------------------------------------------------
  if (missing(env.DATABASE_URL)) {
    fatal('DATABASE_URL', 'Not set. Nothing that touches the database can serve a request.')
  } else if (!env.DATABASE_URL!.includes('-pooler')) {
    // A warning, not a refusal: a host other than Neon may pool elsewhere, and
    // guessing wrong here would block a legitimate deploy. But an unpooled
    // runtime URL exhausts the connection limit under this product's polling
    // load, and it does that at peak — the one hour it must not.
    warn(
      'DATABASE_URL',
      'Hostname has no "-pooler". Serverless opens a connection per invocation, ' +
        'and the polling surfaces will exhaust an unpooled limit at peak. ' +
        'Use the pooled URL at runtime and the direct one only in DIRECT_URL.'
    )
  }

  if (missing(env.DIRECT_URL)) {
    fatal(
      'DIRECT_URL',
      'Not set. `prisma migrate deploy` needs a real session — a transaction-mode ' +
        'pooler breaks its advisory locks — so the build cannot migrate without it.'
    )
  }

  // --- Sessions ------------------------------------------------------------
  if (missing(env.SESSION_SECRET)) {
    fatal(
      'SESSION_SECRET',
      'Not set. It signs guest, staff and operator cookies; without it the first ' +
        'scan of the evening throws.'
    )
  } else if (env.SESSION_SECRET!.length < MIN_SECRET_LENGTH) {
    fatal(
      'SESSION_SECRET',
      `Shorter than ${MIN_SECRET_LENGTH} characters, so the signature is worth guessing at. ` +
        "A forged staff cookie is somebody else's venue. " +
        "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    )
  }

  // --- Public origin -------------------------------------------------------
  // The base URL the printed tents and onboarding QR encode. Server-rendered
  // only, so it lives as a regular env var (not `NEXT_PUBLIC_*`) — there is
  // nothing to expose, and we keep the slot.
  const base = env.APP_BASE_URL
  if (missing(base)) {
    fatal('APP_BASE_URL', 'Not set. Every printed QR and sign-in link needs an origin.')
  } else if (/localhost|127\.0\.0\.1/.test(base!)) {
    // This one gets printed onto paper and put on a table. It cannot be
    // recalled, and nobody finds out until a guest scans it and gets nothing.
    fatal(
      'APP_BASE_URL',
      'Points at localhost. Table tents are printed from this — every QR would ' +
        "resolve to the scanning phone's own machine."
    )
  } else if (!base!.startsWith('https://')) {
    fatal(
      'APP_BASE_URL',
      'Not https. Session cookies are set `secure` in production and will not be ' +
        'sent over http, so no session survives a request.'
    )
  }

  // --- Outbound email ------------------------------------------------------
  // Operator sign-in uses email + password (SECURITY.md §7a), so Resend is
  // not required to sign in. Magic links are dormant in the UI. Resend is
  // only used for the Monday weekly-report cron, which degrades gracefully.
  if (env.EMAIL_TRANSPORT === 'console') {
    // The waiver exists for the E2E suite, which is a production build with no
    // key on purpose. On a deployment it re-arms precisely the silent outage
    // `email.ts` refuses: any email-sending route says "sending" and writes to
    // a serverless log nobody reads.
    warn(
      'EMAIL_TRANSPORT',
      'Set to "console" on a deployment. Any email (weekly report) will be ' +
        'written to a serverless log instead of delivered. ' +
        'Unset it and configure RESEND_API_KEY when email delivery is needed.'
    )
  } else if (missing(env.RESEND_API_KEY)) {
    // Non-fatal: operators sign in with email+password, so a missing Resend
    // key does not lock anyone out. It only prevents the weekly cron report.
    warn(
      'RESEND_API_KEY',
      'Not set. The Monday weekly-report email will not be delivered. ' +
        'Operator sign-in uses email + password and is unaffected.'
    )
  }

  if (!missing(env.RESEND_API_KEY) && missing(env.EMAIL_FROM)) {
    warn(
      'EMAIL_FROM',
      'Not set, so there is no sender address for the weekly report email. ' +
        'The domain must also be verified in Resend — an unverified one is rejected with a 403.'
    )
  }

  // --- The Monday cron -----------------------------------------------------
  if (missing(env.CRON_SECRET)) {
    // Non-fatal for the pilot: the weekly report is valuable but not blocking.
    // The route answers 401 without it, so it simply never fires.
    warn(
      'CRON_SECRET',
      'Not set. /api/cron/weekly-report will refuse every request, so the ' +
        'weekly report will never arrive. Set it when email reporting is needed.'
    )
  }

  // --- The AI port ---------------------------------------------------------
  if (env.AI_TRANSPORT === 'mock') {
    // The mock returns a fixture menu. An operator who photographs their own
    // menu and is handed somebody else's items has been shown the product
    // lying to them at the exact moment it was meant to win them.
    fatal(
      'AI_TRANSPORT',
      'Set to "mock" on a deployment. Menu extraction would return the test ' +
        "fixture instead of reading the operator's own menu."
    )
  } else if (missing(env.GEMINI_API_KEY)) {
    // Degrades by design (PLATFORM.md §6a): photo and PDF reading go away, CSV
    // and typed entry still work, so a venue can still onboard. Degraded is
    // not an outage — say so and let the deploy through.
    warn(
      'GEMINI_API_KEY',
      'Not set. Menu reading from a photo or PDF is unavailable; CSV upload and ' +
        'typed entry still work, so onboarding degrades rather than breaking.'
    )
  }

  return problems
}

function format(problems: EnvProblem[]): string {
  return problems.map((p) => `  • ${p.variable} — ${p.problem}`).join('\n')
}

/**
 * The boot gate. Throws on a deployment with any fatal problem, naming all of
 * them; prints warnings; does nothing at all on a laptop.
 */
export function assertDeploymentEnv(env: Env = process.env): void {
  if (!isDeployment(env)) return

  const problems = checkDeploymentEnv(env)
  const warnings = problems.filter((p) => p.severity === 'warning')
  const fatals = problems.filter((p) => p.severity === 'fatal')

  if (warnings.length > 0) {
    console.warn(`Environment warnings — the deployment will run, degraded:\n${format(warnings)}`)
  }

  if (fatals.length > 0) {
    throw new Error(
      `This deployment is misconfigured and would fail in front of a guest rather ` +
        `than here.\n\n${format(fatals)}\n\n` +
        `Set these in the Vercel project's environment variables and redeploy. ` +
        `See .env.example for what each one is.`
    )
  }
}
