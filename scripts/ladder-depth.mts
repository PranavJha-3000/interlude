import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { eligiblePairs, rankingFor, pairKey, type GameItem } from '../src/core/game/pairing'

/**
 * REVAMP-BRIEF.md Part 7 — the numbers the owner asked to see before anything
 * in the pairing is tuned.
 *
 * Three questions, answered from each venue's actual menu as the game reads it
 * (`getMenuForGame`'s mapping, reproduced here):
 *
 * 1. STRUCTURE — how many defensible pairs exist at the venue's gap ratio, and
 *    how long the longest chain of ≥gap steps is. Under the brief's
 *    winner-stays design, that chain length IS the reachable rung ceiling: an
 *    incumbent that keeps winning ratchets up the ranking, and when no item
 *    outsells it by the gap any more, no upward challenger can be drawn.
 *
 * 2. TODAY'S EXPLOIT — the shipped dealer draws an independent fresh pair each
 *    round, so the exploit is not "tap the survivor" (there is no survivor);
 *    it is "tap the dish everyone knows". We simulate a guest whose prior
 *    calls the higher seller correctly with probability `a` on first sight,
 *    who remembers every revealed answer, and who applies transitivity — and
 *    report how deep their streaks run. Deterministic seeded LCG, no
 *    Math.random.
 *
 * 3. THE BRIEF'S FIX — winner-stays with a pAbove(streak) upward draw. For
 *    candidate curves, the per-round win rate of always-tapping-the-incumbent
 *    is 1 − pAbove while both pools hold challengers, so the streak
 *    distribution follows directly; the ⅔ target and the rung ceiling trade
 *    against each other and both are printed.
 */

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

// ── deterministic PRNG (analysis only — core stays pure) ────────────────────
function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

interface Analysis {
  venue: string
  basis: string
  items: number
  itemsWithSales: number
  salesSpread: string
  pairCount: number
  longestChain: number
  exploitDepths: Record<string, string>
  pAboveCurves: Record<string, string>
}

function longestGeometricChain(units: number[], ratio: number): number {
  // Longest x1 < x2 < … with each step ≥ ratio. Greedy on the sorted list is
  // not optimal; DP over sorted values is, and menus are tiny.
  const v = units.filter((u) => u > 0).sort((a, b) => a - b)
  const best = new Array<number>(v.length).fill(1)
  for (let i = 0; i < v.length; i++)
    for (let j = 0; j < i; j++)
      if (v[i]! / v[j]! >= ratio) best[i] = Math.max(best[i]!, best[j]! + 1)
  return best.length ? Math.max(...best) : 0
}

/** One simulated run under today's independent dealer. Returns the streak reached. */
function simulateRun(
  ranked: GameItem[],
  pool: Array<{ higherId: string; lowerId: string }>,
  accuracy: number,
  rand: () => number
): number {
  const seen = new Set<string>()
  // known[a] holds every item a is known to outsell (revealed or inferred).
  const beats = new Map<string, Set<string>>()
  const knows = (hi: string, lo: string) => beats.get(hi)?.has(lo) ?? false
  const learn = (hi: string, lo: string) => {
    if (!beats.has(hi)) beats.set(hi, new Set())
    beats.get(hi)!.add(lo)
    // one-step transitive closure is enough at menu scale, applied repeatedly
    for (const below of beats.get(lo) ?? []) beats.get(hi)!.add(below)
    for (const set of beats.values()) {
      if (set.has(hi)) for (const b of beats.get(hi)!) set.add(b)
    }
  }

  let streak = 0
  for (;;) {
    const fresh = pool.filter((p) => !seen.has(pairKey(p.higherId, p.lowerId)))
    if (fresh.length === 0) return streak
    const pair = fresh[Math.floor(rand() * fresh.length)]!
    seen.add(pairKey(pair.higherId, pair.lowerId))

    const correct = knows(pair.higherId, pair.lowerId)
      ? true
      : knows(pair.lowerId, pair.higherId)
        ? false // confidently wrong is impossible here; inference is sound — this branch never fires
        : rand() < accuracy
    learn(pair.higherId, pair.lowerId)
    if (!correct) return streak
    streak++
  }
}

async function analyse(slug: string, gapRatio: number, runs: number): Promise<Analysis | null> {
  const venue = await db.venue.findUnique({ where: { slug } })
  if (!venue) return null
  const rows = await db.menuItem.findMany({
    where: { venueId: venue.id, active: true },
    select: {
      id: true,
      name: true,
      photoUrl: true,
      trailingSales: true,
      chefRank: true,
      active: true,
    },
  })
  const items: GameItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    photoUrl: r.photoUrl,
    unitsSold: r.trailingSales,
    chefRank: r.chefRank,
    active: r.active,
  }))

  const { items: ranked, basis } = rankingFor(items)
  const pool = eligiblePairs(ranked, { gapRatio })
  const units = ranked.map((i) => i.unitsSold).filter((u) => u > 0)
  const chain = longestGeometricChain(units, gapRatio)

  const exploitDepths: Record<string, string> = {}
  for (const accuracy of [0.5, 0.7, 0.8, 0.9]) {
    const rand = lcg(0xa11ce + Math.round(accuracy * 100))
    const depths: number[] = []
    for (let r = 0; r < runs; r++) depths.push(simulateRun(ranked, pool, accuracy, rand))
    depths.sort((a, b) => a - b)
    const mean = depths.reduce((s, d) => s + d, 0) / depths.length
    const p50 = depths[Math.floor(depths.length * 0.5)]!
    const p90 = depths[Math.floor(depths.length * 0.9)]!
    const atLeast6 = depths.filter((d) => d >= 6).length / depths.length
    exploitDepths[`accuracy ${accuracy}`] =
      `mean streak ${mean.toFixed(1)}, median ${p50}, p90 ${p90}, reaches rung 6 in ${(atLeast6 * 100).toFixed(0)}% of runs`
  }

  // The brief's fix, analysed per curve: per-round exploit win rate is
  // 1 − pAbove(s); expected streak = sum over s of prod(1 − pAbove(k), k<s).
  const pAboveCurves: Record<string, string> = {}
  const curves: Record<string, (s: number) => number> = {
    'flat 1/3': () => 1 / 3,
    'rising 0.15 + 0.06·s (cap 0.5)': (s) => Math.min(0.5, 0.15 + 0.06 * s),
    'rising 0.10 + 0.10·s (cap 0.6)': (s) => Math.min(0.6, 0.1 + 0.1 * s),
  }
  for (const [name, f] of Object.entries(curves)) {
    let expected = 0
    let alive = 1
    for (let s = 0; s < 30; s++) {
      alive *= 1 - f(s)
      expected += alive
    }
    const winRateFirst6 = Array.from({ length: 6 }, (_, s) => (1 - f(s)).toFixed(2)).join(' ')
    pAboveCurves[name] =
      `exploit expected streak ${expected.toFixed(1)}; per-round win over rungs 1-6: ${winRateFirst6}`
  }

  const spread = units.length
    ? `${Math.min(...units)}–${Math.max(...units)} units (top/bottom ratio ${(Math.max(...units) / Math.min(...units)).toFixed(1)}×)`
    : 'no sales history'

  return {
    venue: slug,
    basis,
    items: items.length,
    itemsWithSales: units.length,
    salesSpread: spread,
    pairCount: pool.length,
    longestChain: chain,
    exploitDepths,
    pAboveCurves,
  }
}

const gapRatio = Number(process.argv[2] ?? 2.0)
const runs = 2000
for (const slug of ['pilot', 'copper']) {
  const a = await analyse(slug, gapRatio, runs)
  if (!a) {
    console.log(`\n— venue '${slug}' not found`)
    continue
  }
  console.log(`\n═══ ${a.venue} — gapRatio ${gapRatio}, ${runs} simulated runs ═══`)
  console.log(
    `basis ${a.basis} · ${a.items} active items, ${a.itemsWithSales} with sales · spread ${a.salesSpread}`
  )
  console.log(`defensible pairs: ${a.pairCount}`)
  console.log(
    `longest ≥${gapRatio}× chain (= winner-stays reachable rung ceiling): ${a.longestChain}`
  )
  console.log(`today's dealer — "tap the famous dish" with memory + transitivity:`)
  for (const [k, v] of Object.entries(a.exploitDepths)) console.log(`  ${k}: ${v}`)
  console.log(`the brief's winner-stays fix — candidate pAbove(streak) curves:`)
  for (const [k, v] of Object.entries(a.pAboveCurves)) console.log(`  ${k}: ${v}`)
}
await db.$disconnect()
