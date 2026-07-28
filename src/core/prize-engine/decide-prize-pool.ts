import type {
  AwardKind,
  MenuItemInput,
  PrizeEngineInput,
  PrizeEntry,
  PrizeExclusion,
  PrizePoolResult,
  VelocityInput,
} from './types'

/**
 * The prize engine (PLATFORM.md §5).
 *
 * One pure, deterministic function: which menu item, at what depth, through
 * which mechanic. Same input, same output, always — no clock, no randomness,
 * no I/O. That purity is what makes the compliance invariants testable, and
 * the `reason` on every decision is what makes the result auditable by the
 * operator whose menu it is.
 *
 * The rule of thumb from §5: the biryani never enters, the tiramisu sitting
 * since Tuesday always does.
 */
export function decidePrizePool(input: PrizeEngineInput): PrizePoolResult {
  const {
    menu,
    velocity,
    kitchenLoad,
    chefVetoes,
    depthCaps,
    mechanic,
    concededSoFarPaise,
    serviceClockMinute,
    peakStartMinute,
    peakEndMinute,
    mysteryPlatePricePaise,
  } = input

  const entries: PrizeEntry[] = []
  const excluded: PrizeExclusion[] = []

  const vetoed = new Set(chefVetoes)
  const velocityById = new Map<string, VelocityInput>(velocity.map((v) => [v.itemId, v]))

  const serviceBudgetLeft = depthCaps.perServicePaise - concededSoFarPaise
  const isPeak = serviceClockMinute >= peakStartMinute && serviceClockMinute < peakEndMinute

  for (const item of menu) {
    // --- Absolute exclusions, in the order the operator would expect ------

    if (!item.active) {
      excluded.push({ itemId: item.id, reason: 'Off the menu' })
      continue
    }

    if (vetoed.has(item.id)) {
      excluded.push({ itemId: item.id, reason: 'Chef vetoed' })
      continue
    }

    // §12: never discount a hero item. Discounting what already sells is how
    // you lose money on the customers you were always going to get.
    if (item.isHero) {
      excluded.push({ itemId: item.id, reason: 'Hero item — never discounted' })
      continue
    }

    if (item.pricePaise <= 0) {
      excluded.push({ itemId: item.id, reason: 'No price set' })
      continue
    }

    // §7: no kitchen-work prize while the pass is RED. AMBER allows only what
    // is cheap to produce.
    if (kitchenLoad === 'RED' && item.requiresKitchenWork) {
      excluded.push({ itemId: item.id, reason: 'Kitchen is slammed (RED)' })
      continue
    }
    if (kitchenLoad === 'AMBER' && item.requiresKitchenWork && item.prepBurden === 'HIGH') {
      excluded.push({ itemId: item.id, reason: 'Kitchen busy (AMBER) — too much prep' })
      continue
    }

    // Never promote something we lose money making.
    if (item.foodCostPaise >= item.pricePaise) {
      excluded.push({ itemId: item.id, reason: 'Food cost meets or exceeds price' })
      continue
    }

    // --- Depth: how much may be conceded on this item --------------------

    const kind = chooseKind(mechanic, item, isPeak)
    const valuePaise = concededValue(kind, item, mysteryPlatePricePaise)
    const depthPct = Math.round((valuePaise / item.pricePaise) * 100)

    if (depthPct > depthCaps.perItemPct) {
      excluded.push({
        itemId: item.id,
        reason: `Over the per-item depth cap (${depthPct}% > ${depthCaps.perItemPct}%)`,
      })
      continue
    }

    if (valuePaise > serviceBudgetLeft) {
      excluded.push({
        itemId: item.id,
        reason: 'Service prize budget spent',
      })
      continue
    }

    if (mechanic === 'MYSTERY_PLATE' && mysteryPlatePricePaise >= item.pricePaise) {
      excluded.push({
        itemId: item.id,
        reason: 'Mystery-plate price is not below the menu price',
      })
      continue
    }

    // --- Scoring: margin first, then what is not moving -------------------

    const v = velocityById.get(item.id)
    const { score, reason } = scoreItem(item, v, kind)

    entries.push({
      itemId: item.id,
      mechanic,
      kind,
      valuePaise,
      costPaise: costOf(kind, item, mysteryPlatePricePaise),
      depthPct,
      reason,
      score,
    })
  }

  // Deterministic ordering: score desc, then margin desc, then id asc so the
  // result never depends on the order rows came out of the database.
  entries.sort(
    (a, b) => b.score - a.score || b.depthPct - a.depthPct || (a.itemId < b.itemId ? -1 : 1)
  )
  excluded.sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0))

  return { entries, excluded }
}

/**
 * What kind of award this item carries.
 *
 * The mystery plate is a FIXED_PRICE product — the guest wins the right to buy
 * it. It is never a draw and never a wheel (PLATFORM.md §7); that framing is a
 * gambling-law line, not a design preference.
 */
function chooseKind(
  mechanic: PrizeEngineInput['mechanic'],
  item: MenuItemInput,
  isPeak: boolean
): AwardKind {
  if (mechanic === 'MYSTERY_PLATE') return 'FIXED_PRICE'
  // At peak, concede less: the table was coming anyway.
  if (isPeak && item.marginTier === 'LOW') return 'HALF_PRICE'
  return 'FREE'
}

/** Value conceded to the guest, in paise. */
function concededValue(
  kind: AwardKind,
  item: MenuItemInput,
  mysteryPlatePricePaise: number
): number {
  switch (kind) {
    case 'FREE':
      return item.pricePaise
    case 'HALF_PRICE':
      return Math.round(item.pricePaise / 2)
    case 'FIXED_PRICE':
      return Math.max(0, item.pricePaise - mysteryPlatePricePaise)
  }
}

/** What the concession actually costs the venue, in paise. */
function costOf(kind: AwardKind, item: MenuItemInput, mysteryPlatePricePaise: number): number {
  switch (kind) {
    case 'FREE':
      return item.foodCostPaise
    case 'HALF_PRICE':
      return Math.max(0, item.foodCostPaise - Math.round(item.pricePaise / 2))
    case 'FIXED_PRICE':
      return Math.max(0, item.foodCostPaise - mysteryPlatePricePaise)
  }
}

/**
 * Deterministic score. Margin is the primary driver; slow movers get a lift
 * because shifting them is the whole point. No randomness, by law and by
 * lint rule.
 */
function scoreItem(
  item: MenuItemInput,
  v: VelocityInput | undefined,
  kind: AwardKind
): { score: number; reason: string } {
  const marginPct = Math.round(((item.pricePaise - item.foodCostPaise) / item.pricePaise) * 100)

  let score = marginPct
  const parts: string[] = [`${marginTierLabel(item.marginTier)} margin (${marginPct}%)`]

  if (v === undefined || v.unitsSold === 0) {
    score += 40
    parts.push('not selling')
  } else if (v.unitsSold <= 3) {
    score += 25
    parts.push(`only ${v.unitsSold} sold recently`)
  } else if (v.unitsSold >= 20) {
    score -= 20
    parts.push('already sells well')
  }

  if (v?.daysSinceLastSale !== undefined && v.daysSinceLastSale >= 2) {
    score += 15
    parts.push(`${v.daysSinceLastSale} days since the last one`)
  }

  if (item.prepBurden === 'LOW') {
    score += 10
    parts.push('quick to plate')
  } else if (item.prepBurden === 'HIGH') {
    score -= 10
  }

  if (kind === 'HALF_PRICE') parts.push('half price at peak')
  if (kind === 'FIXED_PRICE') parts.push('mystery plate')

  return { score, reason: capitalise(parts.join(', ')) }
}

function marginTierLabel(t: MenuItemInput['marginTier']): string {
  return t === 'HIGH' ? 'High' : t === 'MID' ? 'Mid' : 'Low'
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1)
}
