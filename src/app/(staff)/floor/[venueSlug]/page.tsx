import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { readStaffSession } from '@/lib/staff-session'
import { signIn } from '../actions'

export const dynamic = 'force-dynamic'

/**
 * Staff sign-in for one venue.
 *
 * Venue-addressed so the venue is known before any hash is checked — the PIN
 * is then only ever compared against that venue's own staff. The slug is not a
 * secret and does not need to be: guessing it still leaves an attacker needing
 * a valid PIN for that venue, which is exactly the bar the product already
 * sets. `Venue.qrToken` is deliberately not reused here — it is printed on
 * guest-facing material, which would put staff sign-in one scan away from
 * every guest in the room.
 */
export default async function FloorSignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ venueSlug: string }>
  searchParams: Promise<{ e?: string }>
}) {
  const { venueSlug } = await params
  const { e } = await searchParams

  // Resolved so an unknown slug is a 404 rather than a PIN pad that can never
  // succeed. It reveals only that a slug exists, which the guest QR already
  // does for anyone holding a menu.
  const venue = await db.venue.findUnique({ where: { slug: venueSlug }, select: { name: true } })
  if (!venue) notFound()

  // A staff member who is already signed in does not need to be here.
  const staff = await readStaffSession()
  if (staff) redirect(staff.role === 'KITCHEN' ? '/pass' : '/floor')

  return (
    <main className="surface-staff flex min-h-dvh items-center justify-center px-6">
      <form action={signIn.bind(null, venueSlug)} className="w-full max-w-xs">
        {/* The venue is named on screen so someone signing in on a shared
            tablet can see which floor they are about to open. */}
        <h1 className="text-2xl font-semibold">{en.floor.signIn.venueHeading(venue.name)}</h1>
        <label htmlFor="pin" className="mt-6 block text-sm text-white/50">
          {en.floor.signIn.pinLabel}
        </label>
        <input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          className="mt-2 min-h-14 w-full rounded-xl border border-white/20 bg-white/10 px-4 text-2xl tracking-widest"
        />
        {/* A wrong PIN and a PIN belonging to another venue say the same thing,
            or the message would tell someone probing which venue a PIN is for.
            Filled rather than coloured text: `bad` is a dark red that does not
            carry as type on this ground, and it is already the fill under the
            kitchen's RED switch. */}
        {e && (
          <p className="mt-3 rounded-lg bg-bad px-3 py-2 text-sm text-white">
            {en.floor.signIn.wrongPin}
          </p>
        )}
        <div className="mt-4">
          <button
            type="submit"
            className="min-h-14 w-full rounded-xl bg-white px-5 text-lg font-semibold text-black"
          >
            {en.floor.signIn.submit}
          </button>
        </div>
      </form>
    </main>
  )
}
