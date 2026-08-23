/**
 * The venue's Google Place ID — the one field that makes the review hand-off
 * work (§7.2).
 *
 * `core/review/link.ts` builds `writereview?placeid=<id>` and nothing else, so
 * this value is the whole difference between a working button and the screen's
 * "tell them in person" fallback. It is parsed strictly because a *wrong* Place
 * ID does not fail loudly anywhere: it silently sends a guest who was willing
 * to leave a review to some other restaurant's page.
 *
 * Pure, so the whole matrix is testable without a form.
 */

export type PlaceIdRefusal = 'not_a_place_id' | 'short_link'

export type PlaceIdResult =
  { ok: true; placeId: string | null } | { ok: false; reason: PlaceIdRefusal }

/**
 * Google documents the Place ID as opaque and URL-safe, and explicitly warns
 * against assuming a prefix — so this checks the character set and a length
 * bound rather than pattern-matching `ChIJ`, which would reject valid ids.
 */
const PLACE_ID = /^[A-Za-z0-9_-]{10,255}$/

/** Query keys Google itself uses for the id, in the URLs an operator may paste. */
const ID_PARAMS = ['placeid', 'place_id']

function fromUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  for (const key of ID_PARAMS) {
    const value = url.searchParams.get(key)
    if (value && PLACE_ID.test(value)) return value
  }

  // `?q=place_id:ChIJ...` — the form the Maps place endpoint takes.
  const q = url.searchParams.get('q') ?? ''
  const embedded = /place_id:([A-Za-z0-9_-]{10,255})/.exec(q)
  if (embedded) return embedded[1]!

  return null
}

function looksLikeAUrl(raw: string): boolean {
  return /^https?:\/\//i.test(raw)
}

export function normaliseGooglePlaceId(raw: string): PlaceIdResult {
  const trimmed = raw.trim()

  // Clearing the field is a legitimate thing to want — it puts the review
  // screen back to its graceful fallback rather than being an error.
  if (trimmed === '') return { ok: true, placeId: null }

  if (looksLikeAUrl(trimmed)) {
    const extracted = fromUrl(trimmed)
    if (extracted) return { ok: true, placeId: extracted }

    // A URL we could not read an id out of. Almost always the g.page or
    // maps.app.goo.gl short link that Google Business Profile hands owners
    // under "ask for reviews" — which is genuinely the most likely thing to be
    // on their clipboard, and which contains no Place ID to extract. Refusing
    // it as merely "invalid" would leave them stuck with the right instinct.
    return { ok: false, reason: 'short_link' }
  }

  if (!PLACE_ID.test(trimmed)) return { ok: false, reason: 'not_a_place_id' }

  return { ok: true, placeId: trimmed }
}
