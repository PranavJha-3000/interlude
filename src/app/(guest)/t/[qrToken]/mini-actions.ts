'use server'

import 'server-only'

/**
 * Server actions for the two V1 mini-games.
 *
 * The rule that shapes this file: **the game layer answers "what did the
 * customer do?", the prize engine answers "what reward may be awarded?"** So
 * these actions validate the play, record it on the event log, and route any
 * reward through the *same* `decideAndWriteAward` spine Beat the Kitchen uses
 * — there is no second prize system to bypass.
 *
 * Everything here is deterministic: combinations and scoring come from venue
 * configuration (`VenueGame.data`), the mystery draw keys off the table-run id
 * through the same murmur-derived range hash as the pairing rule, and nothing
 * consults randomness or a model.
 */
import { db } from '@/lib/db'
import { resolveScan } from '@/lib/service'
import { decideAndWriteAward } from '@/lib/prize-award'
import { recordEvent } from '@/lib/events'
import { readGuestSessionId } from '@/lib/session'
import { formatPaise } from '@/lib/money'
import {
  parseSecretRecipeData,
  parseMysteryCustomerData,
  mysteryConfigFromData,
  type SecretRecipeData,
} from '@/lib/games-config'
import {
  DEFAULT_INITIAL_VISIBLE,
  DEFAULT_REVEAL_PER_DISCOVERY,
  evaluateSelection,
  visibleIngredients,
  type SecretRecipeConfig,
} from '@/core/games/secret-recipe'
import {
  generateMysteryProfile,
  menuForCourse,
  scoreMeal,
  validateMysteryCustomerConfig,
  type MealPick,
  type MysteryCustomerMenuItem,
  type ProfileKind,
} from '@/core/games/mystery-customer'
import { miniGames } from '@/strings/mini-games'

/** Thrown internally when the scan cannot support play right now. */
class PlayRefused extends Error {}

async function requireScan(qrToken: string) {
  const scan = await resolveScan(qrToken)
  if (scan.kind !== 'OK') throw new PlayRefused('NO_SERVICE')
  return scan
}

/** The consented, unspent device for this scan — mini-games never spend it. */
async function requireDevice(scan: Awaited<ReturnType<typeof requireScan>>) {
  const deviceId = await readGuestSessionId()
  const device = deviceId
    ? await db.deviceSession.findUnique({ where: { id: deviceId }, include: { tableRun: true } })
    : null
  if (!device || device.tableRun.serviceId !== scan.serviceId) throw new PlayRefused('NO_SESSION')
  return device
}

/** This venue's enabled game row for one mechanic, data parsed defensively. */
async function venueGameData<T>(
  venueId: string,
  mechanic: 'SECRET_RECIPE' | 'MYSTERY_CUSTOMER',
  parse: (raw: unknown) => T
) {
  const row = await db.venueGame.findFirst({ where: { venueId, mechanic, enabled: true } })
  return row ? parse(row.data) : null
}

// ── Secret Recipe ────────────────────────────────────────────────────────────

/**
 * The venue's combinations, expressed over real menu items.
 *
 * Stored data references `MenuItem` ids; card labels and reveal names come from
 * the live menu, so a renamed dish renames itself everywhere. Combinations
 * pointing at deleted or inactive items drop out rather than crash the shelf.
 */
async function buildSecretRecipeConfig(
  venueId: string,
  data: SecretRecipeData
): Promise<SecretRecipeConfig | null> {
  if (data.combos.length === 0) return null

  const referenced = [...new Set(data.combos.flatMap((c) => c.ingredients))]
  const menu = await db.menuItem.findMany({
    where: { venueId, active: true, id: { in: referenced } },
    select: { id: true, name: true },
  })
  const byId = new Map(menu.map((m) => [m.id, m.name]))

  const ingredients = referenced
    .flatMap((id) => (byId.has(id) ? [{ id, label: byId.get(id)! }] : []))
    .sort((a, b) => a.label.localeCompare(b.label))
  const usable = new Set(ingredients.map((i) => i.id))

  const combinations = data.combos.flatMap((c) => {
    if (!c.ingredients.every((i) => usable.has(i))) return []
    const reveal = byId.get(c.reveals)
    if (!reveal) return []
    return [{ id: c.id, ingredientIds: c.ingredients, resultName: reveal }]
  })
  if (combinations.length === 0) return null

  return {
    ingredients,
    combinations,
    initialVisible: DEFAULT_INITIAL_VISIBLE,
    revealPerDiscovery: DEFAULT_REVEAL_PER_DISCOVERY,
  }
}

/** A card on the Secret Recipe shelf. */
export interface RecipeItemView {
  id: string
  label: string
}

const SECRET_PICKS_ALLOWED = 3

/** Open the shelf: the first few cards, nothing discovered yet. */
export async function loadSecretRecipe(
  qrToken: string
): Promise<
  | { ok: false; reason: 'NOT_CONFIGURED' | 'NO_SESSION' }
  | { ok: true; items: Array<{ id: string; label: string }>; picksAllowed: number }
> {
  try {
    const scan = await requireScan(qrToken)
    await requireDevice(scan)
    const data = await venueGameData(scan.venueId, 'SECRET_RECIPE', parseSecretRecipeData)
    const config = data ? await buildSecretRecipeConfig(scan.venueId, data) : null
    if (!config) return { ok: false, reason: 'NOT_CONFIGURED' }
    return {
      ok: true,
      items: visibleIngredients(config, []).map((i) => ({ id: i.id, label: i.label })),
      picksAllowed: Math.min(SECRET_PICKS_ALLOWED, config.ingredients.length),
    }
  } catch (e) {
    if (e instanceof PlayRefused) return { ok: false, reason: 'NO_SESSION' }
    throw e
  }
}

export type RecipeAttemptResult =
  | { status: 'MORE'; needAtLeast: number }
  | { status: 'MISS'; warm: boolean }
  | { status: 'SOLVED'; name: string; blurb: string }

/**
 * One hand of taps, judged server-side. The card list reaching the phone is
 * presentation; the answer never is — the same discipline that keeps Beat the
 * Kitchen unsolvable in devtools (§4).
 */
export async function attemptRecipe(
  qrToken: string,
  picked: string[]
): Promise<RecipeAttemptResult> {
  const scan = await requireScan(qrToken)
  const device = await requireDevice(scan)

  const data = await venueGameData(scan.venueId, 'SECRET_RECIPE', parseSecretRecipeData)
  const config = data ? await buildSecretRecipeConfig(scan.venueId, data) : null
  if (!config) return { status: 'MISS', warm: false }

  const verdict = evaluateSelection(config, picked ?? [])
  if (verdict.kind === 'INCOMPLETE') return { status: 'MORE', needAtLeast: 2 }

  const ctx = {
    serviceId: scan.serviceId,
    arm: scan.arm,
    tableRunId: device.tableRunId,
    deviceSessionId: device.id,
  }
  if (verdict.kind === 'INVALID') {
    await recordEvent('SECRET_RECIPE_ATTEMPT', ctx)
    return { status: 'MISS', warm: verdict.warmCombinationId !== null }
  }

  await recordEvent('SECRET_RECIPE_FOUND', ctx, {
    combinationId: verdict.combination.id,
    resultName: verdict.combination.resultName,
  })
  return {
    status: 'SOLVED',
    name: verdict.combination.resultName,
    blurb: verdict.combination.blurb ?? '',
  }
}

// ── Mystery Customer ─────────────────────────────────────────────────────────

/** One option the guest may draw for a profile axis. */
export interface MysteryOptionView {
  id: string
  label: string
}

/** One course the guest builds, with only its eligible dishes. */
export interface MysteryCourseView {
  slot: string
  label: string
  options: Array<{ id: string; name: string; priceLabel: string }>
}

/** The drawn brief plus the buildable menu — flat, exactly what the phone renders. */
export interface MysteryBriefView {
  rows: Array<{ label: string; value: string }>
  budgetLine: string
  courses: MysteryCourseView[]
}

const PROFILE_LABEL: Record<ProfileKind, string> = {
  BUDGET: 'Budget',
  CRAVING: 'Craving',
  PREFERENCE: 'Preference',
  APPETITE: 'Appetite',
  DIET: 'Diet',
}

/**
 * Draw this table's mystery customer.
 *
 * Deterministic per table run: the same table redraws the identical brief all
 * service, so two phones at one table see one customer, not two. The draw is a
 * hash over the run id — the same mechanism that deals Beat the Kitchen's
 * pairs — never randomness.
 */
export async function loadMysteryBrief(
  qrToken: string
): Promise<
  { ok: false; reason: 'NOT_CONFIGURED' | 'NO_SESSION' } | ({ ok: true } & MysteryBriefView)
> {
  try {
    const scan = await requireScan(qrToken)
    const device = await requireDevice(scan)
    const data = await venueGameData(scan.venueId, 'MYSTERY_CUSTOMER', parseMysteryCustomerData)
    if (!data) return { ok: false, reason: 'NOT_CONFIGURED' }
    const config = mysteryConfigFromData(data)
    if (validateMysteryCustomerConfig(config).length > 0)
      return { ok: false, reason: 'NOT_CONFIGURED' }

    const menuRows = await db.menuItem.findMany({
      where: { venueId: scan.venueId, active: true },
      select: { id: true, name: true, category: true, pricePaise: true },
    })
    const menu: MysteryCustomerMenuItem[] = menuRows.map((m) => ({
      id: m.id,
      name: m.name,
      category: m.category,
      pricePaise: m.pricePaise,
      available: true,
    }))

    const profile = generateMysteryProfile(config, device.tableRunId)
    const courses: MysteryCourseView[] = config.courses.map((course) => ({
      slot: course.slot,
      label: course.label,
      options: menuForCourse(config, menu, course.slot).map((m) => ({
        id: m.id,
        name: m.name,
        priceLabel: formatPaise(m.pricePaise),
      })),
    }))
    // The brief is the drawn choices in draw order — renderable as-is.
    const rows = profile.choices.map((c) => ({ label: PROFILE_LABEL[c.kind], value: c.label }))

    return { ok: true, rows, budgetLine: formatPaise(profile.budgetPaise), courses }
  } catch (e) {
    if (e instanceof PlayRefused) return { ok: false, reason: 'NO_SESSION' }
    throw e
  }
}

export type MysteryResultView =
  | { ok: false; reason: 'INCOMPLETE' }
  | {
      ok: true
      win: boolean
      headline: string
      scoreLine: string
      explanation: string
      highlights: string[]
      meal: Array<{ name: string; slotLabel: string; priceLabel: string }>
    }

/**
 * Score the built meal. One item id per course, in course order — the phone
 * sends what its slots hold and the server zips them against the venue's own
 * course list. Pure `scoreMeal` underneath; no server opinion.
 */
export async function submitMystery(
  qrToken: string,
  ...courseItemIds: Array<string | undefined>
): Promise<MysteryResultView> {
  try {
    const scan = await requireScan(qrToken)
    const device = await requireDevice(scan)

    const data = await venueGameData(scan.venueId, 'MYSTERY_CUSTOMER', parseMysteryCustomerData)
    if (!data) return { ok: false, reason: 'INCOMPLETE' }
    const config = mysteryConfigFromData(data)

    const menuRows = await db.menuItem.findMany({
      where: { venueId: scan.venueId, active: true },
      select: { id: true, name: true, category: true, pricePaise: true },
    })
    const menu: MysteryCustomerMenuItem[] = menuRows.map((m) => ({
      id: m.id,
      name: m.name,
      category: m.category,
      pricePaise: m.pricePaise,
      available: true,
    }))

    const profile = generateMysteryProfile(config, device.tableRunId)
    const picks: MealPick[] = config.courses
      .map((course, i) => ({ slot: course.slot, itemId: courseItemIds[i] }))
      .filter((p): p is MealPick => typeof p.itemId === 'string' && p.itemId.length > 0)
    const scored = scoreMeal(config, profile, menu, picks)
    if (scored.meal.length < config.courses.length) return { ok: false, reason: 'INCOMPLETE' }

    await recordEvent(
      'MYSTERY_MEAL_SCORED',
      {
        serviceId: scan.serviceId,
        arm: scan.arm,
        tableRunId: device.tableRunId,
        deviceSessionId: device.id,
      },
      { outcome: scored.outcome, scorePct: scored.scorePct, totalPaise: scored.totalPaise }
    )

    return {
      ok: true,
      win: scored.outcome === 'WIN',
      headline:
        scored.outcome === 'WIN'
          ? miniGames.mysteryCustomer.winHeadline
          : miniGames.mysteryCustomer.loseHeadline,
      scoreLine: miniGames.mysteryCustomer.scoreLine(
        scored.scorePct,
        formatPaise(scored.totalPaise)
      ),
      explanation: scored.problems.join(' ') || miniGames.mysteryCustomer.noProblems,
      highlights: scored.highlights,
      meal: scored.meal.map((m) => ({
        name: m.name,
        slotLabel: config.courses.find((c) => c.slot === m.slot)?.label ?? m.slot,
        priceLabel: formatPaise(m.pricePaise),
      })),
    }
  } catch (e) {
    if (e instanceof PlayRefused) return { ok: false, reason: 'INCOMPLETE' }
    throw e
  }
}

// ── Claim ────────────────────────────────────────────────────────────────────

/**
 * Claim a mini-game reward.
 *
 * The same door Beat the Kitchen uses — `decideAndWriteAward` with a GAME
 * purpose and the playing mechanic — so kitchen constraints, depth caps, chef
 * vetoes and the venue's own rules bind identically. There is no path from a
 * game straight to an award that skips the engine.
 */
export async function claimMiniGamePrize(
  qrToken: string,
  mechanic: 'SECRET_RECIPE' | 'MYSTERY_CUSTOMER'
): Promise<{ ok: boolean }> {
  if (mechanic !== 'SECRET_RECIPE' && mechanic !== 'MYSTERY_CUSTOMER') return { ok: false }
  const now = Date.now()
  try {
    const scan = await requireScan(qrToken)
    const device = await requireDevice(scan)

    // Only a recorded success may claim: a Secret Recipe discovery event or a
    // scored Mystery Customer meal for this device. Claims are evidence-bound;
    // the engine's rule list still decides what a WIN or a LOSE concedes.
    const won = await db.event.findFirst({
      where: {
        deviceSessionId: device.id,
        serviceId: scan.serviceId,
        ...(mechanic === 'SECRET_RECIPE'
          ? { type: 'SECRET_RECIPE_FOUND' as const }
          : { type: 'MYSTERY_MEAL_SCORED' as const }),
      },
    })
    if (!won) return { ok: false }

    let claimed = false
    try {
      const award = await decideAndWriteAward({
        venueId: scan.venueId,
        serviceId: scan.serviceId,
        tableRunId: device.tableRunId,
        nowMs: now,
        purpose: { kind: 'GAME', mechanic, rung: 0 },
      })
      claimed = award !== null
      // The same fence Beat the Kitchen's claim uses: the device is spent the
      // moment a prize exists, so the table screen renders the won card and
      // this phone is done playing.
      if (claimed) {
        await db.deviceSession.update({
          where: { id: device.id },
          data: { spentAt: new Date(now) },
        })
      }
    } catch {
      claimed = false
    }
    if (!claimed) return { ok: false }
  } catch {
    return { ok: false }
  }
  // Return, don't `redirect`: redirect throws internally, and the component's
  // network-failure catch swallows that throw — the guest sat on "Loading…"
  // while the award already existed in the ledger. The caller navigates.
  return { ok: true }
}
