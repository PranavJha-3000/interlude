/**
 * The product name lives here and nowhere else (PLATFORM.md §13).
 *
 * It is still a placeholder. Never hardcode it into a UI string, a route, a
 * page title, or copy — import from here so renaming stays a one-line change.
 */
export const BRAND = {
  /** Shown to guests, staff and operators. */
  name: 'Interlude',
  /** Used where a shorter form reads better, e.g. a narrow header. */
  shortName: 'Interlude',
  /** Appended to page titles. */
  tagline: 'while you wait',
  /**
   * The beta badge, rendered wherever the wordmark appears. Set to null when
   * the beta period ends and the badge disappears from every surface at once —
   * there is no second place to hunt for a stale "beta".
   */
  beta: 'beta',
} as const

export type Brand = typeof BRAND
