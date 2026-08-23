import 'server-only'

import { db } from '@/lib/db'

/**
 * The stamp card, per venue.
 *
 * Cross-venue identity is on the never-build list, and `Venue.phoneSalt` makes
 * it unavailable rather than merely disallowed: the same number hashes
 * differently at every venue, so two venues' guest lists cannot be joined. A
 * guest who eats at two restaurants on this platform has two unrelated stamp
 * cards, and that is the design rather than a limitation to work around.
 */

export interface StampResult {
  guestVisitId: string
  visitNumber: number
  /** Visits since the last one that paid out. What `loyaltyRewardDue` takes. */
  visitsSinceLastReward: number
  /** True when this service already had a stamp for this guest. */
  alreadyStamped: boolean
}

/**
 * Record one stamp, idempotently.
 *
 * **The idempotency is the `@@unique([guestIdentityId, serviceId])` constraint,
 * not a check.** A read-then-write guard would be a race under the polling this
 * product does, and the row it guards is the one a free dessert is derived from.
 * So the insert is attempted and the conflict is caught — the same shape
 * `openOrResumeTableRun` uses.
 *
 * Keyed on the service rather than the table run on purpose: a `TableRun` is
 * unique per (service, table), so a guest who moved tables — or walked to an
 * empty one and typed their number again — would otherwise earn two stamps for
 * one night.
 */
export async function recordStamp(args: {
  venueId: string
  serviceId: string
  tableRunId: string
  phoneHmac: string
  nowMs: number
}): Promise<StampResult> {
  const { venueId, serviceId, tableRunId, phoneHmac, nowMs } = args
  const now = new Date(nowMs)

  return db.$transaction(async (tx) => {
    const identity = await tx.guestIdentity.upsert({
      where: { venueId_phoneHmac: { venueId, phoneHmac } },
      update: { lastSeenAt: now },
      create: { venueId, phoneHmac, firstSeenAt: now, lastSeenAt: now, visitCount: 0 },
      select: { id: true },
    })

    const existing = await tx.guestVisit.findUnique({
      where: { guestIdentityId_serviceId: { guestIdentityId: identity.id, serviceId } },
      select: { id: true, visitNumber: true },
    })

    if (existing) {
      return {
        guestVisitId: existing.id,
        visitNumber: existing.visitNumber,
        visitsSinceLastReward: await countSinceLastReward(tx, identity.id),
        alreadyStamped: true,
      }
    }

    const visitNumber = (await tx.guestVisit.count({ where: { guestIdentityId: identity.id } })) + 1

    const visit = await tx.guestVisit.create({
      data: { guestIdentityId: identity.id, venueId, serviceId, tableRunId, visitNumber },
      select: { id: true },
    })

    // A cache of count(visits), written in the same transaction — the rows stay
    // the evidence, exactly as `Service.arm` caches its assignment rows.
    await tx.guestIdentity.update({
      where: { id: identity.id },
      data: { visitCount: visitNumber },
    })

    return {
      guestVisitId: visit.id,
      visitNumber,
      visitsSinceLastReward: await countSinceLastReward(tx, identity.id),
      alreadyStamped: false,
    }
  })
}

/**
 * Visits since the last one that paid out — **not** the lifetime total.
 *
 * This is what makes an operator's config edit safe. `loyaltyRewardDue` takes
 * this rather than `visitNumber`, so lowering the threshold from 8 to 3 affects
 * only the next reward instead of retroactively making every long-standing
 * regular due tonight.
 */
async function countSinceLastReward(
  tx: Pick<typeof db, 'guestVisit'>,
  guestIdentityId: string
): Promise<number> {
  const lastRewarded = await tx.guestVisit.findFirst({
    where: { guestIdentityId, awardId: { not: null } },
    orderBy: { visitNumber: 'desc' },
    select: { visitNumber: true },
  })

  return tx.guestVisit.count({
    where: {
      guestIdentityId,
      ...(lastRewarded ? { visitNumber: { gt: lastRewarded.visitNumber } } : {}),
    },
  })
}

/**
 * Delete identities nobody has used in `loyaltyIdentityExpiryDays`.
 *
 * DPDP storage limitation: there is no purpose in holding the hash of a number
 * nobody has used in a year, and holding it is the only harm still available
 * once it is hashed. Run from the Monday cron, which is already per-venue and
 * already guarded by `CRON_SECRET`.
 *
 * Without this the config field would be a promise the product does not keep,
 * which is worse than not offering it.
 */
export async function pruneExpiredIdentities(venueId: string, nowMs: number): Promise<number> {
  const config = await db.venueConfig.findUnique({
    where: { venueId },
    select: { loyaltyIdentityExpiryDays: true },
  })
  if (!config) return 0

  const cutoff = new Date(nowMs - config.loyaltyIdentityExpiryDays * 24 * 60 * 60 * 1000)
  const { count } = await db.guestIdentity.deleteMany({
    where: { venueId, lastSeenAt: { lt: cutoff } },
  })
  return count
}

/** Link the award this stamp paid for, so the next threshold counts from here. */
export async function linkStampAward(guestVisitId: string, awardId: string): Promise<void> {
  await db.guestVisit.update({ where: { id: guestVisitId }, data: { awardId } })
}

/**
 * Delete a guest's identity at one venue, and everything hanging off it.
 *
 * `Award` rows survive deliberately: they hang off `TableRun`, carry no
 * identity, and are the money record the venue's P&L is built from. Erasing a
 * person must not erase a sale.
 *
 * Returns the number of visits removed, for the event log. Returns 0 for an
 * unknown number, and the caller must render that identically — otherwise the
 * screen is an oracle for "does this person eat here".
 */
export async function eraseIdentity(venueId: string, phoneHmac: string): Promise<number> {
  const identity = await db.guestIdentity.findUnique({
    where: { venueId_phoneHmac: { venueId, phoneHmac } },
    select: { id: true, _count: { select: { visits: true } } },
  })
  if (!identity) return 0

  // The visits cascade.
  await db.guestIdentity.delete({ where: { id: identity.id } })
  return identity._count.visits
}
