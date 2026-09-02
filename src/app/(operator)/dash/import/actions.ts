'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireOperator } from '@/lib/operator-session'
import { importBillExport, importHistoricalBaseline, mapPosRef } from '@/lib/bill-import-db'
import type { ColumnMap } from '@/core/measurement/bill-import'

/**
 * Bill-import writes. Venue from the session, never the form; the one id a
 * form does carry (a table, for mapping) is validated against the venue's own
 * tables inside `mapPosRef`.
 */

function columnsFrom(formData: FormData): ColumnMap {
  const get = (key: string, fallback: string) => {
    const value = String(formData.get(key) ?? '').trim()
    return value === '' ? fallback : value
  }
  const optional = (key: string) => {
    const value = String(formData.get(key) ?? '').trim()
    return value === '' ? undefined : value
  }
  return {
    externalRef: get('colExternalRef', 'bill no'),
    posRef: get('colPosRef', 'table'),
    closedAt: get('colClosedAt', 'time'),
    total: get('colTotal', 'total'),
    covers: optional('colCovers'),
    itemName: optional('colItemName'),
    itemQty: optional('colItemQty'),
    itemPrice: optional('colItemPrice'),
  }
}

export async function uploadBillExport(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const file = formData.get('billFile')
  if (!(file instanceof File) || file.size === 0) redirect('/dash/import?error=parse')

  const text = Buffer.from(await file.arrayBuffer()).toString('utf-8')
  const result = await importBillExport(operator.venueId, text, columnsFrom(formData))

  if (!result.ok) {
    redirect(`/dash/import?error=${result.reason === 'NO_SERVICE' ? 'no_service' : 'parse'}`)
  }

  revalidatePath('/dash/import')
  revalidatePath('/dash')
  const s = result.summary
  redirect(
    `/dash/import?imported=${s.imported}&duplicate=${s.duplicate}&rejected=${s.rejected}&unattributed=${s.unattributed}`
  )
}

export async function submitPosRefMapping(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const posRef = String(formData.get('posRef') ?? '')
  const tableId = String(formData.get('tableId') ?? '')
  await mapPosRef(operator.venueId, posRef, tableId)

  revalidatePath('/dash/import')
  redirect('/dash/import')
}

export async function uploadBaseline(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const file = formData.get('baselineFile')
  if (!(file instanceof File) || file.size === 0) redirect('/dash/import?error=history')

  const text = Buffer.from(await file.arrayBuffer()).toString('utf-8')
  const result = await importHistoricalBaseline(operator.venueId, text)
  if (!result.ok) redirect('/dash/import?error=history')

  revalidatePath('/dash/import')
  redirect(`/dash/import?history=${result.count}`)
}
