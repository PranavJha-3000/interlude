import 'server-only'

import { db } from '@/lib/db'
import { hashToRange } from '@/core/mechanics/hash'
import { chooseLoyaltyReward, decidePrizePool } from '@/core/prize-engine'
import type { PrizePoolResult } from '@/core/prize-engine'
import { parseRankingWeights } from '@/lib/prize-config'
import {
  getActiveVetoes,
  getConcededSoFarPaise,
  getKitchenLoad,
  getMenuForEngine,
  getPrizeRules,
  getVenueConfig,
  serviceClockMinute,
} from '@/lib/service'
import { newRedemptionCode } from '@/lib/table-run'

/**
 * The one place an `Award` is decided and written.
 *
 * Lifted out of `game-actions.ts` when loyalty arrived, deliberately as an
 * extraction rather than a second implementation. Two engine calls is how one of
 * them ends up missing `chefVetoes` or `concededSoFarPaise` — and the one that
 * forgets a fence is the one nobody reads until a venue gives away its menu.
 *
 * Everything above the rule lookup — the hero rule, the chef's vetoes, kitchen
 * load, the per-item and per-service depth caps, the peak window — applies to a
 * loyalty reward for free, because it is the same call.
 */

export type AwardPurpose =
  | { kind: 'GAME'; rung: number }
  | { kind: 'LOYALTY'; visitNumber: number; maxValuePaise: number }

export interface DecideAndWriteAwardArgs {
  venueId: string
  serviceId: string
  tableRunId: string
  nowMs: number
  purpose: AwardPurpose
}

/**
 * Run the engine, snapshot the pool, write the award.
 *
 * The whole pool is snapshotted to `PrizePool` — entries *and* exclusions with
 * their reasons — and it is written even when the pool is empty, because "the
 * engine refused everything, and here is why" is exactly the night an operator
 * most wants explained.
 */
async function runEngine(venueId: string, serviceId: string, nowMs: number) {
  const [venue, config, menuData, prizeRules, load, vetoes, conceded] = await Promise.all([
    db.venue.findUniqueOrThrow({ where: { id: venueId }, select: { timezone: true } }),
    getVenueConfig(venueId),
    getMenuForEngine(venueId),
    getPrizeRules(venueId),
    getKitchenLoad(venueId),
    getActiveVetoes(venueId),
    getConcededSoFarPaise(serviceId),
  ])

  const pool = decidePrizePool({
    menu: menuData.engineMenu,
    velocity: menuData.velocity,
    kitchenLoad: load,
    chefVetoes: vetoes,
    depthCaps: {
      perItemPct: config.depthCapPerItemPct,
      perServicePaise: config.depthCapPerServicePaise,
    },
    mechanic: 'BEAT_THE_KITCHEN',
    outcome: 'WIN',
    prizeRules,
    rankingWeights: parseRankingWeights(config.rankingWeights),
    concededSoFarPaise: conceded,
    serviceClockMinute: serviceClockMinute(nowMs, venue.timezone),
    peakStartMinute: config.peakStartMinute,
    peakEndMinute: config.peakEndMinute,
  })

  return { pool, config, menuData, load }
}

/**
 * What the rung screen may promise (§9.1's rung-reached moment).
 *
 * The same pure engine call the claim will make, read-only — no snapshot, no
 * award. The preview and the decision are seconds apart, so they almost always
 * agree; when they don't (a cap crossed, the kill switch), the claim's answer
 * is the truth and the preview promised "tonight only", not a contract.
 */
export async function previewTopPrize(venueId: string, serviceId: string, nowMs: number) {
  const { pool, menuData } = await runEngine(venueId, serviceId, nowMs)
  const top = pool.entries[0]
  if (!top) return null

  const item = menuData.rows.find((m) => m.id === top.itemId)
  if (!item) return null

  return {
    itemName: item.name,
    pricePaise: item.pricePaise,
    kind: top.kind,
    percentOff: top.percentOff ?? null,
    fixedPricePaise: top.fixedPricePaise ?? null,
  }
}

export async function decideAndWriteAward(args: DecideAndWriteAwardArgs) {
  const { venueId, serviceId, tableRunId, nowMs, purpose } = args

  const { pool, config, menuData, load } = await runEngine(venueId, serviceId, nowMs)

  const nameOf = new Map(menuData.rows.map((m) => [m.id, m.name]))
  const snapshot = await db.prizePool.create({
    data: {
      serviceId,
      mechanic: 'BEAT_THE_KITCHEN',
      kitchenLoad: load,
      entries: pool.entries.map((e) => ({ ...e, itemName: nameOf.get(e.itemId) ?? e.itemId })),
      excluded: pool.excluded.map((e) => ({ ...e, itemName: nameOf.get(e.itemId) ?? e.itemId })),
    },
  })

  const decided = decide(pool, purpose, config, menuData.rows)
  if (!decided) return null

  // Deterministic per (seed, attempt, position); the attempt counter only
  // advances on a genuine unique-collision, so the audit trail stays
  // reproducible: the same run and rung always yield the same first-choice
  // code, and a retried one is visibly a retry in the derivation.
  for (let attempt = 0; ; attempt++) {
    const code = newRedemptionCode((max, position) =>
      hashToRange(`${seedFor(tableRunId, purpose)}:${attempt}:${position}`, max)
    )
    try {
      return await db.award.create({
        data: {
          tableRunId,
          rung: purpose.kind === 'GAME' ? purpose.rung : null,
          origin: purpose.kind === 'GAME' ? 'GAME' : 'LOYALTY',
          menuItemId: decided.itemId,
          kind: decided.kind,
          percentOff: decided.percentOff ?? null,
          fixedPricePaise: decided.fixedPricePaise ?? null,
          ruleId: decided.ruleId ?? null,
          valuePaise: decided.valuePaise,
          foodCostPaise: decided.costPaise,
          reason: decided.reason,
          // Linking the snapshot that decided it. This was created and discarded
          // before the extraction, leaving the audit trail one join short of
          // "which pool decided this award".
          prizePoolId: snapshot.id,
          code,
        },
      })
    } catch (e) {
      const uniqueCollision = (e as { code?: string }).code === 'P2002'
      if (!uniqueCollision || attempt >= 4) throw e
    }
  }
}

/**
 * The redemption code's seed.
 *
 * **The two purposes must not share a seed.** `code` is `@unique`, so a table
 * that wins a rung prize and takes a loyalty reward on the same run would
 * otherwise generate the identical five-character code twice and fail the
 * insert — at the table, at 9pm, with a guest waiting.
 */
function seedFor(tableRunId: string, purpose: AwardPurpose): string {
  return purpose.kind === 'GAME'
    ? `${tableRunId}:${purpose.rung}`
    : `${tableRunId}:loyalty:${purpose.visitNumber}`
}

type Decided = {
  itemId: string
  kind: 'FREE' | 'PERCENT_OFF' | 'FIXED_PRICE'
  percentOff?: number
  fixedPricePaise?: number
  ruleId?: string | null
  valuePaise: number
  costPaise: number
  reason: string
}

function decide(
  pool: PrizePoolResult,
  purpose: AwardPurpose,
  config: { fallbackMenuItemId: string | null },
  menu: Array<{ id: string; pricePaise: number; foodCostPaise: number }>
): Decided | null {
  if (purpose.kind === 'LOYALTY') {
    // A loyalty reward the venue cannot afford is a legible refusal on
    // /dash/prizes, not a consolation. The fallback below exists for a guest
    // who *earned a rung* — §5 forbids telling them there is nothing — and a
    // returning guest has not earned anything tonight.
    const chosen = chooseLoyaltyReward({
      entries: pool.entries,
      visitNumber: purpose.visitNumber,
      maxValuePaise: purpose.maxValuePaise,
    })
    return chosen.chosen ? { ...chosen.chosen, reason: chosen.reason } : null
  }

  return pool.entries[0] ?? fallbackEntry(config, menu)
}

/**
 * The zero-kitchen fallback (§5).
 *
 * Configured per venue — something the bar pours or the counter hands over. A
 * pool of nothing must never reach a guest screen, and the alternative to this
 * is a table that earned a prize and is told there isn't one.
 */
function fallbackEntry(
  config: { fallbackMenuItemId: string | null },
  menu: Array<{ id: string; pricePaise: number; foodCostPaise: number }>
): Decided | null {
  if (!config.fallbackMenuItemId) return null
  const item = menu.find((m) => m.id === config.fallbackMenuItemId)
  if (!item) return null

  return {
    itemId: item.id,
    kind: 'FREE',
    ruleId: null,
    valuePaise: item.pricePaise,
    costPaise: item.foodCostPaise,
    reason: 'Fallback item — the pool was empty, and a guest is never told there is nothing.',
  }
}
