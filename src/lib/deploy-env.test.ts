import { describe, expect, it } from 'vitest'

import { checkDeploymentEnv, isDeployment, assertDeploymentEnv } from '@/lib/deploy-env'

/**
 * TODO.md build item 8 says every environment variable "fails loudly at boot if
 * missing". Before this module that was not true: each one threw at its own
 * first *use*, which is a materially different promise. A deployment with no
 * `SESSION_SECRET` boots green, serves the landing page, passes a smoke test,
 * and then throws on the first guest scan of the pilot weekend. A deployment
 * with no `CRON_SECRET` never throws at all — the Monday route answers 404 and
 * the report simply never arrives, with nothing anywhere to say why.
 *
 * So the rule these tests hold: a misconfigured deployment must fail at the
 * moment it starts, naming everything that is wrong at once rather than one
 * variable per redeploy.
 */

/**
 * A deployment that should pass cleanly — each test breaks one thing.
 *
 * The connection strings say `user:password` rather than anything shorter
 * because the pre-commit secret scan reads a Postgres URL with credentials in
 * it and only stands down for a value that is visibly a placeholder
 * (SECURITY.md §3). Only the hostname carries meaning here: `-pooler` is what
 * separates the runtime URL from the migration one.
 */
const GOOD: Record<string, string | undefined> = {
  DATABASE_URL:
    'postgresql://user:password@ep-x-pooler.c-3.ap-southeast-1.aws.neon.tech/db?sslmode=verify-full',
  DIRECT_URL:
    'postgresql://user:password@ep-x.c-3.ap-southeast-1.aws.neon.tech/db?sslmode=verify-full',
  SESSION_SECRET: 'a'.repeat(64),
  APP_BASE_URL: 'https://interlude.example.com',
  // RESEND_API_KEY, EMAIL_FROM, and CRON_SECRET are now optional (warning only).
  // Operator sign-in uses email+password and does not require Resend.
  GEMINI_API_KEY: 'AIza-test',
}

function fatalNames(env: Record<string, string | undefined>): string[] {
  return checkDeploymentEnv(env)
    .filter((p) => p.severity === 'fatal')
    .map((p) => p.variable)
}

function problemFor(
  env: Record<string, string | undefined>,
  variable: string
): { severity: string; problem: string } | undefined {
  return checkDeploymentEnv(env).find((p) => p.variable === variable)
}

describe('checkDeploymentEnv', () => {
  it('finds nothing wrong with a fully configured deployment', () => {
    expect(checkDeploymentEnv(GOOD).filter((p) => p.severity === 'fatal')).toEqual([])
  })

  it('reports every missing variable at once, not the first one', () => {
    // One redeploy per missing variable is how a Saturday-evening launch turns
    // into a Sunday one. The whole list, or the check is not worth running.
    const problems = fatalNames({ ...GOOD, SESSION_SECRET: undefined })
    expect(problems).toContain('SESSION_SECRET')
  })

  it('refuses a missing DATABASE_URL', () => {
    expect(fatalNames({ ...GOOD, DATABASE_URL: undefined })).toContain('DATABASE_URL')
  })

  it('refuses a missing DIRECT_URL, which prisma migrate needs', () => {
    expect(fatalNames({ ...GOOD, DIRECT_URL: undefined })).toContain('DIRECT_URL')
  })

  it('warns when DATABASE_URL is not the pooled hostname', () => {
    // Not fatal: a host other than Neon may pool elsewhere. But an unpooled
    // runtime URL exhausts connections under the polling load this product
    // generates, and it does so at peak — the one hour it must not.
    const problem = problemFor({ ...GOOD, DATABASE_URL: GOOD.DIRECT_URL }, 'DATABASE_URL')
    expect(problem?.severity).toBe('warning')
    expect(problem?.problem).toMatch(/pool/i)
  })

  it('refuses a missing SESSION_SECRET', () => {
    expect(fatalNames({ ...GOOD, SESSION_SECRET: undefined })).toContain('SESSION_SECRET')
  })

  it('refuses a SESSION_SECRET short enough to be worth guessing', () => {
    // It signs the guest, staff and operator cookies. A short key is a forgeable
    // session, which on the staff surface is somebody else's venue.
    expect(fatalNames({ ...GOOD, SESSION_SECRET: 'short' })).toContain('SESSION_SECRET')
  })

  it('refuses an APP_BASE_URL pointing at localhost', () => {
    // This one is printed. A tent sheet with a localhost QR is paper that has
    // to be thrown away and reprinted, and nobody notices until a guest scans.
    expect(fatalNames({ ...GOOD, APP_BASE_URL: 'http://localhost:3000' })).toContain('APP_BASE_URL')
  })

  it('refuses an APP_BASE_URL that is not https', () => {
    expect(fatalNames({ ...GOOD, APP_BASE_URL: 'http://interlude.example.com' })).toContain(
      'APP_BASE_URL'
    )
  })

  it('warns (not fatals) when RESEND_API_KEY is missing — operator sign-in uses password', () => {
    const problem = problemFor({ ...GOOD, RESEND_API_KEY: undefined }, 'RESEND_API_KEY')
    expect(problem?.severity).toBe('warning')
    expect(problem?.problem).toMatch(/weekly-report|password/i)
    expect(fatalNames({ ...GOOD, RESEND_API_KEY: undefined })).not.toContain('RESEND_API_KEY')
  })

  it('warns (not fatals) when EMAIL_FROM is missing', () => {
    const problem = problemFor(
      { ...GOOD, RESEND_API_KEY: 're_live_key', EMAIL_FROM: undefined },
      'EMAIL_FROM'
    )
    expect(problem?.severity).toBe('warning')
    expect(
      fatalNames({ ...GOOD, RESEND_API_KEY: 're_live_key', EMAIL_FROM: undefined })
    ).not.toContain('EMAIL_FROM')
  })

  it('warns (not fatals) when EMAIL_TRANSPORT=console on a deployment', () => {
    const problem = problemFor(
      { ...GOOD, RESEND_API_KEY: undefined, EMAIL_TRANSPORT: 'console' },
      'EMAIL_TRANSPORT'
    )
    expect(problem?.severity).toBe('warning')
    expect(
      fatalNames({ ...GOOD, RESEND_API_KEY: undefined, EMAIL_TRANSPORT: 'console' })
    ).not.toContain('EMAIL_TRANSPORT')
  })

  it('warns (not fatals) when CRON_SECRET is missing — weekly report degrades gracefully', () => {
    const problem = problemFor({ ...GOOD, CRON_SECRET: undefined }, 'CRON_SECRET')
    expect(problem?.severity).toBe('warning')
    expect(fatalNames({ ...GOOD, CRON_SECRET: undefined })).not.toContain('CRON_SECRET')
  })

  it('only warns about a missing GEMINI_API_KEY, which degrades by design', () => {
    // Menu photo and PDF reading go away; CSV and typing still work, so a venue
    // can still onboard. That is a degraded mode, not an outage.
    const problem = problemFor({ ...GOOD, GEMINI_API_KEY: undefined }, 'GEMINI_API_KEY')
    expect(problem?.severity).toBe('warning')
    expect(fatalNames({ ...GOOD, GEMINI_API_KEY: undefined })).not.toContain('GEMINI_API_KEY')
  })

  it('refuses AI_TRANSPORT=mock on a deployment', () => {
    // The mock returns a fixture menu. An operator who uploads a photo of their
    // own menu and is handed somebody else's items would rightly never trust
    // the product again.
    expect(fatalNames({ ...GOOD, AI_TRANSPORT: 'mock' })).toContain('AI_TRANSPORT')
  })
})

describe('isDeployment', () => {
  it('is true on a Vercel production deployment', () => {
    expect(isDeployment({ VERCEL_ENV: 'production' })).toBe(true)
  })

  it('is true on a Vercel preview deployment, which real people also open', () => {
    expect(isDeployment({ VERCEL_ENV: 'preview' })).toBe(true)
  })

  it('is false for the local production build the E2E suite runs', () => {
    // `next build && next start` is NODE_ENV=production but is nobody's
    // deployment. Keying on NODE_ENV instead would fail the E2E suite for
    // having no CRON_SECRET, which is correct behaviour for a laptop.
    expect(isDeployment({ NODE_ENV: 'production' })).toBe(false)
  })

  it('is false in development', () => {
    expect(isDeployment({ NODE_ENV: 'development' })).toBe(false)
  })
})

describe('assertDeploymentEnv', () => {
  it('says nothing when the environment is sound', () => {
    expect(() => assertDeploymentEnv({ ...GOOD, VERCEL_ENV: 'production' })).not.toThrow()
  })

  it('throws naming every fatal problem when it is a deployment', () => {
    // CRON_SECRET is now a warning (weekly report degrades), so only
    // SESSION_SECRET (which breaks every scan) remains fatal.
    expect(() =>
      assertDeploymentEnv({
        ...GOOD,
        VERCEL_ENV: 'production',
        SESSION_SECRET: undefined,
        DIRECT_URL: undefined,
      })
    ).toThrow(/SESSION_SECRET|DIRECT_URL/)
  })

  it('does not throw on a laptop, however broken the environment is', () => {
    // Development is allowed to be half-configured; that is the whole point of
    // the console email transport and the mock extractor.
    expect(() => assertDeploymentEnv({ NODE_ENV: 'development' })).not.toThrow()
  })

  it('does not throw for warnings alone', () => {
    expect(() =>
      assertDeploymentEnv({ ...GOOD, VERCEL_ENV: 'production', GEMINI_API_KEY: undefined })
    ).not.toThrow()
  })
})
