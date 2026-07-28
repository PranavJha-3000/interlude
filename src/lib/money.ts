/**
 * Money is paise, always, as an integer. No floats anywhere near a rupee
 * value — the dashboard's net-contribution number is shown to an operator who
 * can check it against his own till.
 */

export type Paise = number

/** `12345` -> `"₹123.45"`. Two decimals only when there are paise. */
export function formatPaise(paise: Paise): string {
  const negative = paise < 0
  const abs = Math.abs(Math.round(paise))
  const rupees = Math.floor(abs / 100)
  const remainder = abs % 100
  const grouped = groupIndian(rupees)
  const body = remainder === 0 ? grouped : `${grouped}.${String(remainder).padStart(2, '0')}`
  return `${negative ? '-' : ''}₹${body}`
}

/** Indian digit grouping: 12,34,567 rather than 12,345,67. */
function groupIndian(n: number): string {
  const s = String(n)
  if (s.length <= 3) return s
  const head = s.slice(0, -3)
  const tail = s.slice(-3)
  return `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${tail}`
}

/**
 * Contribution margin of a single unit, in paise.
 * This is the number the owner actually cares about — revenue minus what the
 * plate cost to make, not revenue.
 */
export function contributionPaise(pricePaise: Paise, foodCostPaise: Paise): Paise {
  return pricePaise - foodCostPaise
}

/** Margin as a fraction of price, 0–1. Returns 0 for a free or invalid price. */
export function marginFraction(pricePaise: Paise, foodCostPaise: Paise): number {
  if (pricePaise <= 0) return 0
  return (pricePaise - foodCostPaise) / pricePaise
}

/**
 * What a conceded prize actually costs the venue.
 *
 * A free item costs its food cost — the venue forgoes the margin it never
 * would have earned, but it genuinely spends the ingredients. A half-price
 * item still collects half the menu price, so the cost is food cost minus what
 * was collected, floored at zero (a half-price high-margin item can be
 * contribution-positive, and we do not let that read as a negative cost).
 */
export function prizeCostPaise(
  kind: 'FREE' | 'HALF_PRICE' | 'FIXED_PRICE',
  pricePaise: Paise,
  foodCostPaise: Paise,
  fixedPricePaise?: Paise
): Paise {
  switch (kind) {
    case 'FREE':
      return foodCostPaise
    case 'HALF_PRICE':
      return Math.max(0, foodCostPaise - Math.round(pricePaise / 2))
    case 'FIXED_PRICE':
      return Math.max(0, foodCostPaise - (fixedPricePaise ?? 0))
  }
}
