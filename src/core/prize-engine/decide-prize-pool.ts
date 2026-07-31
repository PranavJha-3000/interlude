import type {
  MenuItemInput,
  PrizeEngineInput,
  PrizeEntry,
  PrizeExclusion,
  PrizePoolResult,
  PrizeRuleInput,
  RankingWeights,
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
 *
 * **The depth is the venue's decision, not ours.** Which items are given away,
 * which are discounted and by how much, and what a losing guest still gets,
 * all come in as `prizeRules`. The engine's job is to apply that policy inside
 * the fences — vetoes, kitchen load, depth caps — and to explain every call it
 * makes.
 */
export function decidePrizePool(input: PrizeEngineInput): PrizePoolResult {
  const {
    menu,
    velocity,
    kitchenLoad,
    chefVetoes,
    depthCaps,
    mechanic,
    outcome,
    prizeRules,
    rankingWeights,
    concededSoFarPaise,
    serviceClockMinute,
    peakStartMinute,
    peakEndMinute,
  } = input

  const entries: PrizeEntry[] = []
  const excluded: PrizeExclusion[] = []

  const vetoed = new Set(chefVetoes)
  const velocityById = new Map<string, VelocityInput>(velocity.map((v) => [v.itemId, v]))

  const serviceBudgetLeft = depthCaps.perServicePaise - concededSoFarPaise
  const isPeak = serviceClockMinute >= peakStartMinute && serviceClockMinute < peakEndMinute

  // Sorted once, deterministically. Ties break on id so two rules at the same
  // priority cannot swap places between two runs and change what a guest wins.
  const rules = [...prizeRules]
    .filter((r) => r.mechanic === mechanic && r.outcome === outcome)
    .sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

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
    // you lose money on the customers you were always going to get. This sits
    // above the rule lookup deliberately — no rule an operator can write is
    // allowed to reach a hero item.
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

    // --- The venue's own policy decides the depth ------------------------

    const rule = rules.find((r) => ruleMatches(r, item, isPeak))
    if (!rule) {
      excluded.push({ itemId: item.id, reason: 'No prize rule covers this item' })
      continue
    }

    const invalid = ruleProblem(rule)
    if (invalid) {
      excluded.push({ itemId: item.id, reason: `Prize rule "${rule.label}" ${invalid}` })
      continue
    }

    const valuePaise = concededValue(rule, item)
    const depthPct = Math.round((valuePaise / item.pricePaise) * 100)

    if (valuePaise <= 0) {
      excluded.push({
        itemId: item.id,
        reason:
          rule.kind === 'FIXED_PRICE'
            ? 'Fixed price is not below the menu price'
            : `Prize rule "${rule.label}" concedes nothing on this item`,
      })
      continue
    }

    // Deliberately an exclusion rather than a silent clamp. A rule that wants
    // to give away more than the cap allows is a contradiction the operator
    // wrote, and they should see it on the pool screen rather than have us
    // quietly resolve it in their favour or against it.
    if (depthPct > depthCaps.perItemPct) {
      excluded.push({
        itemId: item.id,
        reason: `Over the per-item depth cap (${depthPct}% > ${depthCaps.perItemPct}%)`,
      })
      continue
    }

    if (valuePaise > serviceBudgetLeft) {
      excluded.push({ itemId: item.id, reason: 'Service prize budget spent' })
      continue
    }

    // --- Scoring: margin first, then what is not moving -------------------

    const v = velocityById.get(item.id)
    const { score, reason } = scoreItem(item, v, rule, rankingWeights)

    entries.push({
      itemId: item.id,
      mechanic,
      kind: rule.kind,
      ...(rule.kind === 'PERCENT_OFF' ? { percentOff: rule.percentOff } : {}),
      ...(rule.kind === 'FIXED_PRICE' ? { fixedPricePaise: rule.fixedPricePaise } : {}),
      valuePaise,
      costPaise: costOf(item, valuePaise),
      depthPct,
      ruleId: rule.id,
      reason,
      score,
    })
  }

  // Deterministic ordering: score desc, then depth desc, then id asc so the
  // result never depends on the order rows came out of the database.
  entries.sort(
    (a, b) => b.score - a.score || b.depthPct - a.depthPct || (a.itemId < b.itemId ? -1 : 1)
  )
  excluded.sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0))

  return { entries, excluded }
}

/** Every undefined condition means "any" — a rule with none matches everything. */
function ruleMatches(rule: PrizeRuleInput, item: MenuItemInput, isPeak: boolean): boolean {
  if (rule.menuItemId !== undefined && rule.menuItemId !== item.id) return false
  if (rule.category !== undefined && rule.category !== item.category) return false
  if (rule.marginTier !== undefined && rule.marginTier !== item.marginTier) return false
  if (rule.window === 'PEAK' && !isPeak) return false
  if (rule.window === 'OFF_PEAK' && isPeak) return false
  return true
}

/**
 * Why a rule cannot be applied, or null if it is fine.
 *
 * A malformed rule excludes the item with an explanation rather than throwing.
 * An operator mistyping a discount at 9pm on Saturday should cost them one
 * prize and produce a legible line on the pool screen — not a 500 on a guest's
 * phone.
 */
function ruleProblem(rule: PrizeRuleInput): string | null {
  if (rule.kind === 'PERCENT_OFF') {
    const p = rule.percentOff
    if (p === undefined) return 'has no discount percentage set'
    if (!Number.isInteger(p) || p <= 0 || p > 100) return 'has an invalid discount percentage'
  }
  if (rule.kind === 'FIXED_PRICE') {
    const f = rule.fixedPricePaise
    if (f === undefined) return 'has no fixed price set'
    if (!Number.isInteger(f) || f < 0) return 'has an invalid fixed price'
  }
  return null
}

/** Value conceded to the guest, in paise. */
function concededValue(rule: PrizeRuleInput, item: MenuItemInput): number {
  switch (rule.kind) {
    case 'FREE':
      return item.pricePaise
    case 'PERCENT_OFF':
      return Math.round((item.pricePaise * (rule.percentOff ?? 0)) / 100)
    case 'FIXED_PRICE':
      return Math.max(0, item.pricePaise - (rule.fixedPricePaise ?? 0))
  }
}

/**
 * What the concession actually costs the venue, in paise.
 *
 * One formula for all three kinds: the venue still collects whatever the guest
 * pays, so the cost is the ingredients minus that. Floored at zero — a shallow
 * discount on a high-margin item is contribution-positive, and we do not let
 * that read as a negative cost on the dashboard.
 */
function costOf(item: MenuItemInput, valuePaise: number): number {
  const collected = item.pricePaise - valuePaise
  return Math.max(0, item.foodCostPaise - collected)
}

/**
 * Deterministic score. Margin is the primary driver; slow movers get a lift
 * because shifting them is the whole point. No randomness, by law and by
 * lint rule.
 */
function scoreItem(
  item: MenuItemInput,
  v: VelocityInput | undefined,
  rule: PrizeRuleInput,
  weights: RankingWeights
): { score: number; reason: string } {
  const marginPct = Math.round(((item.pricePaise - item.foodCostPaise) / item.pricePaise) * 100)

  let score = marginPct
  const parts: string[] = [`${marginTierLabel(item.marginTier)} margin (${marginPct}%)`]

  if (v === undefined || v.unitsSold === 0) {
    score += weights.notSelling
    parts.push('not selling')
  } else if (v.unitsSold <= weights.slowMoverMaxUnits) {
    score += weights.slowMover
    parts.push(`only ${v.unitsSold} sold recently`)
  } else if (v.unitsSold >= weights.fastMoverMinUnits) {
    score += weights.fastMoverPenalty
    parts.push('already sells well')
  }

  if (v?.daysSinceLastSale !== undefined && v.daysSinceLastSale >= weights.staleMinDays) {
    score += weights.stale
    parts.push(`${v.daysSinceLastSale} days since the last one`)
  }

  if (item.prepBurden === 'LOW') {
    score += weights.lowPrepBonus
    parts.push('quick to plate')
  } else if (item.prepBurden === 'HIGH') {
    score += weights.highPrepPenalty
  }

  // The operator's own words for their own rule, so the audit trail reads back
  // in the language they wrote it in.
  parts.push(rule.label.toLowerCase())

  return { score, reason: capitalise(parts.join(', ')) }
}

function marginTierLabel(t: MenuItemInput['marginTier']): string {
  return t === 'HIGH' ? 'High' : t === 'MID' ? 'Mid' : 'Low'
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1)
}
