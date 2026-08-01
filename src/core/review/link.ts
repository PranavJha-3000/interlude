/**
 * The Google hand-off link (§7.2). Pure, and deliberately dumb: it carries the
 * venue's Place ID and nothing else — no text, no rating, no prefill. The
 * guest's words travel on the guest's clipboard, never through us.
 */
export function buildWriteReviewUrl(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`
}
