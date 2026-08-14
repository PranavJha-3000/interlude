import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { en } from '@/strings/en'
import { readGuestSessionId } from '@/lib/session'
import { resolveScan } from '@/lib/service'
import { Body, Heading, Screen } from '../../ui'
import { erasePhone } from '../actions'

export const dynamic = 'force-dynamic'

/**
 * Erasure (DPDP).
 *
 * **The answer is identical whether or not the number was found**, in the same
 * words, on the same screen — for the same reason `/signin` gives one answer to
 * a wrong password and an unknown address. Two different endings would turn
 * this into a way to ask "does this person eat here", which is precisely the
 * question SECURITY.md §6 claims the data cannot answer.
 *
 * A guest surface only. There is deliberately no operator-side lookup: an owner
 * typing a number into `/dash` to find a guest is re-identification, and a
 * one-way hash plus a search box is an oracle.
 */
export default async function ErasePage({
  params,
  searchParams,
}: {
  params: Promise<{ qrToken: string }>
  searchParams: Promise<{ done?: string }>
}) {
  const { qrToken } = await params
  const { done } = await searchParams

  const scan = await resolveScan(qrToken)
  if (scan.kind === 'UNKNOWN_TABLE') notFound()
  if (scan.kind === 'NO_SERVICE' || scan.kind === 'BLOCKED') {
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
      <Screen venueName={scan.venueName} tableLabel={scan.tableLabel}>
        <Heading>{en.guest.erase.done}</Heading>
        <div className="mt-auto pt-8">
          <a href={`/t/${qrToken}`} className="block text-center text-base underline">
            {en.guest.back}
          </a>
        </div>
      </Screen>
    )
  }

  return (
    <Screen venueName={scan.venueName} tableLabel={scan.tableLabel}>
      <Heading>{en.guest.erase.heading}</Heading>
      <Body>{en.guest.erase.body}</Body>

      <form action={erasePhone} className="mt-6">
        <input type="hidden" name="qrToken" value={qrToken} />
        <label htmlFor="phone" className="block text-sm text-muted">
          {en.guest.erase.label}
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          required
          placeholder={en.guest.phone.placeholder}
          className="mt-2 min-h-14 w-full rounded-xl border border-line bg-paper px-4 font-mono text-lg"
        />
        <button
          type="submit"
          className="mt-6 min-h-14 w-full rounded-xl border-2 border-line text-lg font-semibold"
        >
          {en.guest.erase.submit}
        </button>
      </form>
    </Screen>
  )
}
