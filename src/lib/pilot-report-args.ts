/**
 * Arguments for `scripts/pilot-report.mts`.
 *
 * Pure and separately tested because of what the `--venues` allowlist is for.
 * The script used to pool every venue in the database, which quietly assumes
 * that everything in the database is the pilot. It is not: a venue you
 * smoke-test a deployment on, open a service on and play a round through
 * enters the pooled scan rate, add-on count and contribution. Pooled across
 * ~200 tented tables that is not noise, and the pooled rate is one of the
 * three things the MLP actually claims (PLATFORM.md §9a).
 *
 * So the pilot's membership is something someone states, and the script says
 * out loud which it used.
 */

export interface PilotReportArgs {
  days: number
  /** `null` means every venue — the old behaviour, kept and announced. */
  venueSlugs: string[] | null
}

const FLAG = '--venues'

function parseSlugs(raw: string): string[] | null {
  const slugs = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
  return slugs.length > 0 ? slugs : null
}

export function parsePilotReportArgs(argv: string[]): PilotReportArgs {
  let days = 7
  let venueSlugs: string[] | null = null

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!

    if (arg === FLAG) {
      venueSlugs = parseSlugs(argv[i + 1] ?? '')
      i++
      continue
    }

    if (arg.startsWith(`${FLAG}=`)) {
      venueSlugs = parseSlugs(arg.slice(FLAG.length + 1))
      continue
    }

    // The bare day count, which is how this script has always been called.
    const parsed = Number(arg)
    // NaN would become an epoch-wide window and the report would still look
    // plausible, which is the worst way for this to be wrong.
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`Not a usable number of days: "${arg}". Usage: [days] [${FLAG}=a,b]`)
    }
    days = parsed
  }

  return { days, venueSlugs }
}
