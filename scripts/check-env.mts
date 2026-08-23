/**
 * The build gate (TODO.md build item 8).
 *
 * Runs first in the Vercel build command, so a deployment with a missing
 * secret fails the *build* rather than the running server. The difference is
 * the one that matters on a Saturday: a failed build leaves the previous
 * deployment serving guests, while a server that throws at start has already
 * replaced it with a page that does not load.
 *
 * On a laptop it is a no-op — `isDeployment` keys on VERCEL_ENV, so
 * `npm run build` locally and the E2E suite's production build both pass
 * straight through. That is intended: development is allowed to be
 * half-configured, which is why the console email transport and the mock
 * extractor exist at all.
 */
import { assertDeploymentEnv, checkDeploymentEnv, isDeployment } from '../src/lib/deploy-env'

if (!isDeployment(process.env)) {
  console.log('check-env: not a deployment (VERCEL_ENV unset) — skipping.')
  process.exit(0)
}

try {
  assertDeploymentEnv(process.env)
  const warnings = checkDeploymentEnv(process.env).filter((p) => p.severity === 'warning')
  console.log(
    warnings.length === 0
      ? 'check-env: environment is complete.'
      : `check-env: ${warnings.length} warning(s), building anyway.`
  )
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
