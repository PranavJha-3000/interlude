import Link from 'next/link'
import { notFound } from 'next/navigation'
import { en } from '@/strings/en'
import { resolveVenueScan } from '@/lib/service'
import { Body, Heading, Screen } from '@/app/(guest)/t/[qrToken]/ui'

export const dynamic = 'force-dynamic'

/**
 * The venue QR — one code to print for the counter or the menu, instead of one
 * per table.
 *
 * It is a list of links and nothing else. **No session, no cookie, no row is
 * written here**, which is what lets it sit in front of the consent gate
 * without breaking DPDP purpose limitation: the guest has not yet agreed to
 * anything, and nothing about them has been recorded.
 *
 * Every active table is listed, control tables included. Omitting them would
 * tell a control guest something about their table, and the whole value of the
 * same-night control is that the guests in it behave normally.
 */
export default async function VenuePickerPage({
  params,
}: {
  params: Promise<{ venueToken: string }>
}) {
  const { venueToken } = await params
  const scan = await resolveVenueScan(venueToken)

  if (scan.kind === 'UNKNOWN_VENUE') notFound()

  if (scan.tables.length === 0) {
    return (
      <Screen venueName={scan.venueName}>
        <Heading>{en.guest.tablePicker.heading}</Heading>
        <Body>{en.guest.tablePicker.noTables}</Body>
      </Screen>
    )
  }

  return (
    <Screen venueName={scan.venueName}>
      <Heading>{en.guest.tablePicker.heading}</Heading>
      <Body>{en.guest.tablePicker.body}</Body>

      {/* Plain links, so this works with JS off and costs nothing to render.
          Four across at 390px, each target well over the 44px minimum. */}
      <nav className="mt-8 grid grid-cols-4 gap-3">
        {scan.tables.map((t) => (
          <Link
            key={t.qrToken}
            href={`/t/${t.qrToken}`}
            prefetch={false}
            aria-label={en.guest.tablePicker.tableLabel(t.label)}
            className="flex min-h-16 items-center justify-center rounded-xl border border-line bg-ground-cotton text-xl font-semibold tabular-nums active:bg-ink active:text-paper"
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </Screen>
  )
}
