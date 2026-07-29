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
 * Parse what an operator typed into paise.
 *
 * They type rupees — "249.50", "₹1,299", "80" — because that is what is on
 * their menu. Everything downstream is integer paise. Returns null rather than
 * NaN so a caller cannot accidentally write a broken price to the database.
 */
export function parseRupeesToPaise(raw: string): Paise | null {
  const cleaned = raw.replace(/[₹,\s]/g, '')
  if (cleaned === '' || !/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const [whole, fraction = ''] = cleaned.split('.')
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(paise) ? paise : null
}

/** `24950` -> `"249.50"`. For pre-filling an edit field, without the ₹. */
export function paiseToRupeeInput(paise: Paise): string {
  const abs = Math.abs(Math.round(paise))
  return `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/**
 * What the guest actually pays, given the award.
 *
 * The single source of this arithmetic. `PERCENT_OFF` carries the venue's own
 * percentage rather than a hardcoded half (PLATFORM.md §10 — `HALF_PRICE` was
 * exactly that, and is gone).
 */
export function guestPaysPaise(
  kind: 'FREE' | 'PERCENT_OFF' | 'FIXED_PRICE',
  pricePaise: Paise,
  percentOff?: number,
  fixedPricePaise?: Paise
): Paise {
  switch (kind) {
    case 'FREE':
      return 0
    case 'PERCENT_OFF':
      return Math.max(0, pricePaise - Math.round((pricePaise * (percentOff ?? 0)) / 100))
    case 'FIXED_PRICE':
      return Math.min(pricePaise, Math.max(0, fixedPricePaise ?? 0))
  }
}

/**
 * What a conceded prize actually costs the venue.
 *
 * A free item costs its food cost — the venue forgoes the margin it never would
 * have earned, but it genuinely spends the ingredients. A discounted item still
 * collects something, so the cost is food cost minus what was collected,
 * floored at zero (a shallow discount on a high-margin item is
 * contribution-positive, and we do not let that read as a negative cost).
 */
export function prizeCostPaise(
  kind: 'FREE' | 'PERCENT_OFF' | 'FIXED_PRICE',
  pricePaise: Paise,
  foodCostPaise: Paise,
  percentOff?: number,
  fixedPricePaise?: Paise
): Paise {
  const collected = guestPaysPaise(kind, pricePaise, percentOff, fixedPricePaise)
  return Math.max(0, foodCostPaise - collected)
}
