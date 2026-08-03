import { assertDeploymentEnv } from '@/lib/deploy-env'

/**
 * Runs once per server start, before the first request is served.
 *
 * This is the backstop, not the gate. `scripts/check-env.mts` runs the same
 * check in the build command, and that is where a bad environment should be
 * caught — a failed Vercel build leaves the previous deployment serving, while
 * a server that throws here has already replaced it. The backstop earns its
 * place anyway: environment variables can be edited in the Vercel dashboard
 * after a build, and a redeploy from cache never re-runs the build command.
 *
 * Deliberately no try/catch. Throwing is the entire point.
 */
export function register(): void {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  assertDeploymentEnv()
}
