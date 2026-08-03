import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { readGuestSessionId } from '@/lib/session'
import { resolveScan } from '@/lib/service'
import { Body, Card, Heading, Screen } from '../ui'
import { submitPhone } from './actions'

export const dynamic = 'force-dynamic'

/**
 * Leave a number (§4.4, and the loyalty programme's only entry point).
 *
 * **Offered after the guest has already had their go, never before.** That is
 * the "no accounts before value" line: the game is played, the food is coming,
 * and only then is there any reason to say who you are. A number asked for at
 * the top of the funnel is an account wall wearing a different hat.
 *
 * Zero client components — a server render and one form, so this costs nothing
 * against the 15KB that is ours (PLATFORM.md §11).
 */

const ERRORS: Record<string, string> = {
  wrong_length: en.guest.phone.errWrongLength,
  not_a_mobile: en.guest.phone.errNotAMobile,
  not_numeric: en.guest.phone.errNotNumeric,
  not_indian: en.guest.phone.errNotIndian,
}

export default async function PhonePage({
  params,
  searchParams,
}: {
  params: Promise<{ qrToken: string }>
  searchParams: Promise<{ error?: string; done?: string; code?: string }>
}) {
  const { qrToken } = await params
  const { error, done, code } = await searchParams

  const scan = await resolveScan(qrToken)
  if (scan.kind === 'UNKNOWN_TABLE') notFound()
  if (scan.kind === 'NO_SERVICE' || scan.kind === 'BLOCKED') {
    // A control table is indistinguishable from a closed venue here too. If a
    // guest could tell them apart on any route, the experiment is contaminated.
    return (
      <Screen venueName={scan.venueName}>
        <Heading>{en.guest.closed.heading}</Heading>
        <Body>{en.guest.closed.body}</Body>
      </Screen>
    )
  }

  const deviceId = await readGuestSessionId()
  const device = deviceId
    ? await db.deviceSession.findUnique({ where: { id: deviceId }, include: { tableRun: true } })
    : null
  if (!device || device.tableRun.serviceId !== scan.serviceId) redirect(`/t/${qrToken}`)

  if (done) {
    return (
      <Screen venueName={scan.venueName}>
        <Heading>{en.guest.phone.done}</Heading>

        {code && (
          <>
            <Body>{en.guest.phone.rewardHeading}</Body>
            <Card>
              <p className="text-center font-mono text-4xl tracking-widest">{code}</p>
            </Card>
          </>
        )}

        <div className="mt-auto pt-8">
          <a href={`/t/${qrToken}`} className="block text-center text-base underline">
            {en.guest.back}
          </a>
        </div>
      </Screen>
    )
  }

  return (
    <Screen venueName={scan.venueName}>
      <Heading>{en.guest.phone.heading}</Heading>
      <Body>{en.guest.phone.body}</Body>

      {error && <p className="mt-4 text-sm text-bad">{ERRORS[error] ?? en.guest.phone.errNotNumeric}</p>}

      <form action={submitPhone} className="mt-6">
        <input type="hidden" name="qrToken" value={qrToken} />
        <label htmlFor="phone" className="block text-sm text-muted">
          {en.guest.phone.label}
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          required
          placeholder={en.guest.phone.placeholder}
          className="mt-2 min-h-14 w-full rounded-xl border border-line bg-paper px-4 font-mono text-lg"
        />

        {/* DPDP purpose limitation: what is stored, and what is not, before
            anything is stored. The guest is reading this to decide. */}
        <p className="mt-4 text-sm text-muted">{en.guest.phone.privacy}</p>

        <button
          type="submit"
          className="mt-6 min-h-14 w-full rounded-xl bg-ink text-lg font-semibold text-paper"
        >
          {en.guest.phone.submit}
        </button>
      </form>

      <div className="mt-auto pt-8 text-center">
        <a href={`/t/${qrToken}`} className="text-sm text-muted underline">
          {en.guest.phone.skip}
        </a>
        <a
          href={`/t/${qrToken}/phone/erase`}
          className="mt-3 block text-sm text-muted underline"
        >
          {en.guest.phone.erase}
        </a>
      </div>
    </Screen>
  )
}
