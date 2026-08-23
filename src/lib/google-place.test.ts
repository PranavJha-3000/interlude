import { describe, expect, it } from 'vitest'

import { normaliseGooglePlaceId } from '@/lib/google-place'

/**
 * `Venue.googlePlaceId` is what turns the review screen's button into a working
 * hand-off — `buildWriteReviewUrl` needs it and nothing else. Until now it was
 * read in one place and written in none, so on a real deployment it was always
 * null: the screen rendered "this venue hasn't linked its Google profile",
 * every table, forever, and the review funnel would have reported 100% shown
 * and 0% handed off as if that were a finding about guests.
 *
 * This is the parser behind the one field that fixes it. It is strict on
 * purpose. A wrong Place ID does not fail loudly — it sends a guest who was
 * willing to leave a review to somebody else's restaurant.
 */

function idOf(raw: string): string | null {
  const result = normaliseGooglePlaceId(raw)
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
  return result.placeId
}

function reasonOf(raw: string): string {
  const result = normaliseGooglePlaceId(raw)
  if (result.ok) throw new Error(`expected a refusal, got ${String(result.placeId)}`)
  return result.reason
}

describe('normaliseGooglePlaceId', () => {
  it('accepts a bare Place ID', () => {
    expect(idOf('ChIJN1t_tDeuEmsRUsoyG83frY4')).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4')
  })

  it('trims surrounding whitespace, which a paste always brings', () => {
    expect(idOf('  ChIJN1t_tDeuEmsRUsoyG83frY4 \n')).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4')
  })

  it('treats an empty field as unlinking, not as an error', () => {
    // Clearing it is a legitimate thing to want: it puts the screen back to its
    // graceful "tell them in person" copy.
    expect(idOf('')).toBeNull()
    expect(idOf('   ')).toBeNull()
  })

  it('extracts the id from a pasted writereview URL', () => {
    // This is the URL our own review screen sends guests to, so an operator who
    // is checking their setup will have exactly this on their clipboard.
    expect(
      idOf('https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4')
    ).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4')
  })

  it('accepts a place_id query parameter as well', () => {
    expect(idOf('https://www.google.com/maps/place/?q=place_id:ChIJN1t_tDeuEmsRUsoyG83frY4')).toBe(
      'ChIJN1t_tDeuEmsRUsoyG83frY4'
    )
  })

  it('does not accept ids that are not Place IDs but do not look like links', () => {
    // A Place ID is opaque and URL-safe. Anything with a space or a slash in it
    // is something else that was pasted by mistake.
    expect(reasonOf('my restaurant')).toBe('not_a_place_id')
    expect(reasonOf('ChIJ/N1t')).toBe('not_a_place_id')
  })

  it('names the short-link mistake specifically, because it is the likely one', () => {
    // Google Business Profile hands owners a g.page short link, not a Place ID.
    // "Invalid" would leave them stuck; naming it points them at the finder.
    expect(reasonOf('https://g.page/r/CQVpaBpTHPvzEAI/review')).toBe('short_link')
    expect(reasonOf('https://maps.app.goo.gl/abcdef')).toBe('short_link')
  })

  it('refuses a maps URL with no id in it rather than storing the URL', () => {
    expect(reasonOf('https://www.google.com/maps/place/Some+Restaurant/@28.6,77.2,17z')).toBe(
      'short_link'
    )
  })

  it('refuses something implausibly long', () => {
    expect(reasonOf('C'.repeat(400))).toBe('not_a_place_id')
  })
})
