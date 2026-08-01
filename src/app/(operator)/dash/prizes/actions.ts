'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { requireOperator } from '@/lib/operator-session'
import { parseRupeesToPaise } from '@/lib/money'

/**
 * The fences, written by the venue (PLATFORM.md §10).
 *
 * Every action writes `VenueConfig` and nothing else — if a number the engine
 * reads is not behind one of these forms, that is a bug in the screen, not a
 * reason to hardcode it. Parsing is per field: one unreadable number refuses
 * the whole section and changes nothing, because a half-applied fence is worse
 * than a stale one.
 */

function intIn(formData: FormData, key: string, min: number, max: number): number | null {
  const raw = String(formData.get(key) ?? '').trim()
  if (raw === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n >= min && n <= max ? n : null
}

function floatIn(formData: FormData, key: string, min: number, max: number): number | null {
  const raw = String(formData.get(key) ?? '').trim()
  if (raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

/** "HH:MM" from a time input → minutes from midnight. */
function timeIn(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? '').trim()
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw)
  if (!match) return null
  const minutes = Number(match[1]) * 60 + Number(match[2])
  return minutes >= 0 && minutes < 1440 ? minutes : null
}

function fail(): never {
  redirect('/dash/prizes?error=invalid')
}

function done(): never {
  revalidatePath('/dash/prizes')
  redirect('/dash/prizes?saved=1')
}

export async function updateRoundShape(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const ladderRungs = intIn(formData, 'ladderRungs', 1, 20)
  const startingLives = intIn(formData, 'startingLives', 1, 10)
  const gamblePenaltyRungs = intIn(formData, 'gamblePenaltyRungs', 0, 10)
  const pairGapRatio = floatIn(formData, 'pairGapRatio', 1, 100)
  const velocityWindowDays = intIn(formData, 'velocityWindowDays', 1, 365)
  const countdownBufferSec = intIn(formData, 'countdownBufferSec', 0, 3600)
  const untimedAfterSec = intIn(formData, 'untimedAfterSec', 0, 7200)

  if (
    ladderRungs === null ||
    startingLives === null ||
    gamblePenaltyRungs === null ||
    pairGapRatio === null ||
    velocityWindowDays === null ||
    countdownBufferSec === null ||
    untimedAfterSec === null
  ) {
    fail()
  }

  await db.venueConfig.update({
    where: { venueId: operator.venueId },
    data: {
      ladderRungs,
      startingLives,
      gamblePenaltyRungs,
      pairGapRatio,
      velocityWindowDays,
      countdownBufferSec,
      untimedAfterSec,
      lifeForAddOn: formData.get('lifeForAddOn') === 'on',
      lifeForPhone: formData.get('lifeForPhone') === 'on',
      lifeForFeedback: formData.get('lifeForFeedback') === 'on',
    },
  })
  done()
}

export async function updateFences(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const depthCapPerItemPct = intIn(formData, 'depthCapPerItemPct', 0, 100)
  const perServicePaise = parseRupeesToPaise(String(formData.get('depthCapPerServiceRupees') ?? ''))
  const mysteryPaise = parseRupeesToPaise(String(formData.get('mysteryPlateRupees') ?? ''))
  if (depthCapPerItemPct === null || perServicePaise === null || mysteryPaise === null) fail()

  // The fallback prize is the one client-supplied id here, so it is verified
  // against this venue's own active menu before it is written.
  const rawFallback = String(formData.get('fallbackMenuItemId') ?? '')
  let fallbackMenuItemId: string | null = null
  if (rawFallback !== '') {
    const item = await db.menuItem.findFirst({
      where: { id: rawFallback, venueId: operator.venueId, active: true },
      select: { id: true },
    })
    if (!item) fail()
    fallbackMenuItemId = item.id
  }

  await db.venueConfig.update({
    where: { venueId: operator.venueId },
    data: {
      depthCapPerItemPct,
      depthCapPerServicePaise: perServicePaise,
      mysteryPlatePricePaise: mysteryPaise,
      fallbackMenuItemId,
    },
  })
  done()
}

export async function updatePrep(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const defaultPrepMinutes = intIn(formData, 'defaultPrepMinutes', 1, 180)
  if (defaultPrepMinutes === null) fail()

  const prepMinutesByCategory: Record<string, number> = {}
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('prep:')) continue
    const category = key.slice('prep:'.length)
    if (String(value).trim() === '') continue
    const minutes = Number(String(value))
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) fail()
    prepMinutesByCategory[category] = minutes
  }

  await db.venueConfig.update({
    where: { venueId: operator.venueId },
    data: { defaultPrepMinutes, prepMinutesByCategory },
  })
  done()
}

export async function updatePeak(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const peakStartMinute = timeIn(formData, 'peakStart')
  const peakEndMinute = timeIn(formData, 'peakEnd')
  if (peakStartMinute === null || peakEndMinute === null) fail()

  await db.venueConfig.update({
    where: { venueId: operator.venueId },
    data: { peakStartMinute, peakEndMinute },
  })
  done()
}

export async function updateGates(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const attachDeltaGatePp = floatIn(formData, 'attachDeltaGatePp', 0, 100)
  const ticketDeltaKillPct = floatIn(formData, 'ticketDeltaKillPct', 0, 100)
  const ticketDeltaProceedPct = floatIn(formData, 'ticketDeltaProceedPct', 0, 100)
  const scanRateKillPct = floatIn(formData, 'scanRateKillPct', 0, 100)
  const scanRateGoodPct = floatIn(formData, 'scanRateGoodPct', 0, 100)
  const completionRateGatePct = floatIn(formData, 'completionRateGatePct', 0, 100)
  const reviewVelocityGateX = floatIn(formData, 'reviewVelocityGateX', 0, 100)

  if (
    attachDeltaGatePp === null ||
    ticketDeltaKillPct === null ||
    ticketDeltaProceedPct === null ||
    scanRateKillPct === null ||
    scanRateGoodPct === null ||
    completionRateGatePct === null ||
    reviewVelocityGateX === null
  ) {
    fail()
  }

  await db.venueConfig.update({
    where: { venueId: operator.venueId },
    data: {
      attachDeltaGatePp,
      ticketDeltaKillPct,
      ticketDeltaProceedPct,
      scanRateKillPct,
      scanRateGoodPct,
      completionRateGatePct,
      reviewVelocityGateX,
    },
  })
  done()
}

const WEIGHT_FIELDS = [
  'notSelling',
  'slowMover',
  'fastMoverPenalty',
  'stale',
  'lowPrepBonus',
  'highPrepPenalty',
  'slowMoverMaxUnits',
  'fastMoverMinUnits',
  'staleMinDays',
] as const

export async function updateWeights(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const rankingWeights: Record<string, number> = {}
  for (const field of WEIGHT_FIELDS) {
    const value = floatIn(formData, field, -1000, 1000)
    if (value === null) fail()
    rankingWeights[field] = value
  }

  await db.venueConfig.update({
    where: { venueId: operator.venueId },
    data: { rankingWeights },
  })
  done()
}

export async function clearVetoFromDash(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const menuItemId = String(formData.get('menuItemId') ?? '')
  // Scoped by venue as well as item — the id is client input.
  await db.chefVeto.updateMany({
    where: { menuItemId, venueId: operator.venueId, active: true },
    data: { active: false, clearedAt: new Date() },
  })
  revalidatePath('/dash/prizes')
  redirect('/dash/prizes')
}
