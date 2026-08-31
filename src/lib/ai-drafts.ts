import 'server-only'

import { z } from 'zod'
import { getAiAdapter } from '@/lib/ai'
import type {
  GameKind,
  MenuItemForAI,
  MysteryCustomerCandidate,
  SecretRecipeCandidate,
  WeeklyMetrics,
} from '@/lib/ai/types'
import type { AiDraftKind, AiDraftStatus } from '@/generated/prisma/enums'
import {
  parseMysteryCustomerData,
  parseSecretRecipeData,
  type MysteryCustomerData,
  type SecretRecipeData,
} from '@/lib/games-config'
import { db } from '@/lib/db'
import { getDashboardData } from '@/lib/dashboard'
import { defaultVenueGames } from '@/lib/venue-setup'

/**
 * The database side of AI draft generation — the §6a workflow in code.
 *
 * Every function takes the venueId from the caller, which took it from the
 * session. Nothing here trusts a form's idea of whose data this is, and every
 * write that follows a `refId` is re-scoped by `venueId`, so a draft id or an
 * item id off another venue updates zero rows rather than the wrong venue's
 * dish.
 *
 * The one gateway to the model is `menuForAI`: the read-only, cost-free slice
 * of the menu (`MenuItemForAI` has no food cost, margin or kitchen fields), so
 * no prompt can leak a number the operator owns.
 */

export type AiOutcome =
  | { ok: true; count: number; warnings: string[] }
  | { ok: false; reason: string }

export type ApplyOutcome =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' | 'NOT_DRAFT' | 'ITEM_GONE' | 'MENU_CHANGED' | 'INVALID' }

/**
 * The only shape the model is ever handed. Built from explicit selects — the
 * production row's cost and kitchen fields are never in the query, let alone
 * the prompt.
 */
export async function menuForAI(venueId: string): Promise<MenuItemForAI[]> {
  const rows = await db.menuItem.findMany({
    where: { venueId, active: true },
    select: { id: true, name: true, category: true, pricePaise: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })
  return rows
}

async function venueNameFor(venueId: string): Promise<string> {
  const venue = await db.venue.findUnique({ where: { id: venueId }, select: { name: true } })
  return venue?.name ?? 'This venue'
}

/** A fresh generation replaces this venue's un-decided drafts, whole. */
async function clearDrafts(
  venueId: string,
  kind: 'ITEM_DESCRIPTION' | 'SECRET_RECIPE' | 'MYSTERY_CUSTOMER' | 'GAME_COPY' | 'WEEKLY_NARRATION'
): Promise<void> {
  await db.aiContentDraft.deleteMany({ where: { venueId, kind, status: 'DRAFT' } })
}

async function upsertVenueGameData(
  venueId: string,
  mechanic: 'SECRET_RECIPE' | 'MYSTERY_CUSTOMER',
  data: SecretRecipeData | MysteryCustomerData
): Promise<void> {
  const existing = await db.venueGame.findFirst({
    where: { venueId, mechanic },
    select: { id: true },
  })
  if (existing) {
    await db.venueGame.update({ where: { id: existing.id }, data: { data: data as object } })
  } else {
    // Same birth-order rule as `setVenueGameEnabled`: a row written here sorts
    // where it would have if it had been born with the venue.
    const displayOrder = defaultVenueGames().find((g) => g.mechanic === mechanic)?.displayOrder ?? 0
    await db.venueGame.create({
      data: { venueId, mechanic, enabled: true, displayOrder, data: data as object },
    })
  }
}
// ── Generation ───────────────────────────────────────────────────────────────

export async function generateItemDescriptionDrafts(venueId: string): Promise<AiOutcome> {
  const adapter = getAiAdapter()
  if (!adapter) return { ok: false, reason: 'AI_UNAVAILABLE' }

  const menu = await menuForAI(venueId)
  const result = await adapter.describeItems(menu)
  if (!result.ok) return { ok: false, reason: result.reason }

  await clearDrafts(venueId, 'ITEM_DESCRIPTION')
  await db.aiContentDraft.createMany({
    data: result.drafts.map((d) => ({
      venueId,
      kind: 'ITEM_DESCRIPTION' as const,
      refId: d.itemId,
      data: { description: d.description } as object,
    })),
  })
  return { ok: true, count: result.drafts.length, warnings: result.warnings }
}

export async function generateSecretRecipeDrafts(venueId: string): Promise<AiOutcome> {
  const adapter = getAiAdapter()
  if (!adapter) return { ok: false, reason: 'AI_UNAVAILABLE' }

  const [menu, name] = await Promise.all([menuForAI(venueId), venueNameFor(venueId)])
  const result = await adapter.generateSecretRecipes({ venueName: name, menu })
  if (!result.ok) return { ok: false, reason: result.reason }

  await clearDrafts(venueId, 'SECRET_RECIPE')
  await db.aiContentDraft.createMany({
    data: result.candidates.map((c) => ({
      venueId,
      kind: 'SECRET_RECIPE' as const,
      refId: null,
      data: c as unknown as object,
    })),
  })
  return { ok: true, count: result.candidates.length, warnings: result.warnings }
}

export async function generateMysteryCustomerDrafts(venueId: string): Promise<AiOutcome> {
  const adapter = getAiAdapter()
  if (!adapter) return { ok: false, reason: 'AI_UNAVAILABLE' }

  const row = await db.venueGame.findFirst({
    where: { venueId, mechanic: 'MYSTERY_CUSTOMER' },
    select: { data: true },
  })
  // Personas target the course slots the venue already runs — never ones the
  // model invents. An unconfigured venue gets personas and no new slots.
  const courseOrder = parseMysteryCustomerData(row?.data).courseOrder

  const [menu, name] = await Promise.all([menuForAI(venueId), venueNameFor(venueId)])
  const result = await adapter.generateMysteryCustomers({ venueName: name, menu, courseOrder })
  if (!result.ok) return { ok: false, reason: result.reason }

  await clearDrafts(venueId, 'MYSTERY_CUSTOMER')
  await db.aiContentDraft.createMany({
    data: result.candidates.map((c) => ({
      venueId,
      kind: 'MYSTERY_CUSTOMER' as const,
      refId: null,
      data: c as unknown as object,
    })),
  })
  return { ok: true, count: result.candidates.length, warnings: result.warnings }
}

export async function generateGameCopyDraft(venueId: string, game: GameKind): Promise<AiOutcome> {
  const adapter = getAiAdapter()
  if (!adapter) return { ok: false, reason: 'AI_UNAVAILABLE' }

  const name = await venueNameFor(venueId)
  const result = await adapter.generateGameCopy({ game, venueName: name })
  if (!result.ok) return { ok: false, reason: result.reason }

  await clearDrafts(venueId, 'GAME_COPY')
  await db.aiContentDraft.create({
    data: {
      venueId,
      kind: 'GAME_COPY',
      refId: null,
      data: { ...result.draft, game } as object,
    },
  })
  return { ok: true, count: 1, warnings: [] }
}
// ── Weekly narration ─────────────────────────────────────────────────────────

/** The same rounding the metrics module uses, so figures match the screen. */
function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.round((numerator / denominator) * 1000) / 10
}

/**
 * The week's figures, exactly as the Monday email computes them — through the
 * same `getDashboardData` reader, so narration and email can never disagree.
 *
 * The aggregation here is deterministic server arithmetic, done *before* the
 * model is involved: the narration never computes anything because there is
 * nothing left to compute once these numbers are formatted.
 */
export async function weeklyMetricsFor(venueId: string): Promise<WeeklyMetrics | null> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const services = await db.service.findMany({
    where: { venueId, startedAt: { gte: weekAgo } },
    orderBy: { startedAt: 'asc' },
    select: { id: true, arm: true },
  })
  if (services.length === 0) return null

  const name = await venueNameFor(venueId)
  let netContributionPaise = 0
  let prizeCostPaise = 0
  let runsOpened = 0
  let tablesTented = 0
  let runsStarted = 0
  let runsReachingARung = 0
  let serviceCount = 0
  let controlCount = 0
  let estimateOnly = true

  for (const service of services) {
    const data = await getDashboardData(venueId, service.id)
    if (service.arm === 'LIVE') {
      serviceCount += 1
      netContributionPaise += data.contribution.netContributionPaise
      prizeCostPaise += data.contribution.prizeCostPaise
      runsOpened += data.metrics.runsOpened
      tablesTented += data.metrics.tablesTented
      runsStarted += data.metrics.runsStarted
      runsReachingARung += data.metrics.runsReachingARung
    } else {
      controlCount += 1
    }
    if (data.tier === 'POS_BACKED') estimateOnly = false
  }

  return {
    venueName: name,
    netContributionPaise,
    prizeCostPaise,
    runsOpened,
    tablesTented,
    scanRatePct: pct(runsOpened, tablesTented),
    completionRatePct: pct(runsReachingARung, runsStarted),
    serviceCount,
    controlCount,
    estimateOnly,
  }
}

export async function generateNarrationDraft(venueId: string): Promise<AiOutcome> {
  const adapter = getAiAdapter()
  if (!adapter) return { ok: false, reason: 'AI_UNAVAILABLE' }

  const metrics = await weeklyMetricsFor(venueId)
  if (!metrics) return { ok: false, reason: 'NO_SERVICES' }

  const result = await adapter.narrateReport(metrics)
  if (!result.ok) return { ok: false, reason: result.reason }

  await clearDrafts(venueId, 'WEEKLY_NARRATION')
  await db.aiContentDraft.create({
    data: {
      venueId,
      kind: 'WEEKLY_NARRATION',
      refId: null,
      data: { sentences: result.sentences } as object,
    },
  })
  return { ok: true, count: 1, warnings: [] }
}
// ── Reading drafts back for the review grids ─────────────────────────────────
//
// `data` was validated before it was written, but reading back is still
// defensive: a hand-edited row renders as nothing rather than crashing the
// dash. These are the shapes every review grid consumes.

export interface ItemDescriptionDraftView {
  id: string
  itemId: string
  description: string
}

export interface SecretRecipeDraftView extends SecretRecipeCandidate {
  id: string
}

export interface MysteryCustomerDraftView extends MysteryCustomerCandidate {
  id: string
}

export interface GameCopyDraftView extends Record<string, unknown> {
  id: string
  game: GameKind | null
  introCopy: string
  promptCopy: string
  discoveryCopy: string
}

export interface NarrationDraftView {
  id: string
  sentences: string[]
}

const draftRows = (venueId: string, kind: AiDraftKind, statuses: AiDraftStatus[]) =>
  db.aiContentDraft.findMany({
    where: { venueId, kind, status: { in: statuses } },
    orderBy: { createdAt: 'desc' },
  })

export async function itemDescriptionDraftViews(
  venueId: string,
  statuses: AiDraftStatus[] = ['DRAFT']
): Promise<ItemDescriptionDraftView[]> {
  const rows = await draftRows(venueId, 'ITEM_DESCRIPTION', statuses)
  return rows.flatMap((r) => {
    const data = r.data as { description?: unknown }
    if (typeof data.description !== 'string' || data.description.trim() === '' || r.refId === null) {
      return []
    }
    return [{ id: r.id, itemId: r.refId, description: data.description }]
  })
}

export async function secretRecipeDraftViews(
  venueId: string,
  statuses: AiDraftStatus[] = ['DRAFT']
): Promise<SecretRecipeDraftView[]> {
  const rows = await draftRows(venueId, 'SECRET_RECIPE', statuses)
  return rows.flatMap((r) => {
    const d = r.data as Record<string, unknown>
    const itemIds = Array.isArray(d.itemIds)
      ? d.itemIds.filter((i): i is string => typeof i === 'string')
      : []
    if (
      typeof d.combinationId !== 'string' ||
      itemIds.length < 2 ||
      typeof d.revealItemId !== 'string' ||
      typeof d.discoveryName !== 'string' ||
      typeof d.revealCopy !== 'string'
    ) {
      return []
    }
    return [
      {
        id: r.id,
        combinationId: d.combinationId,
        itemIds,
        revealItemId: d.revealItemId,
        discoveryName: d.discoveryName,
        revealCopy: d.revealCopy,
      },
    ]
  })
}

export async function mysteryCustomerDraftViews(
  venueId: string,
  statuses: AiDraftStatus[] = ['DRAFT']
): Promise<MysteryCustomerDraftView[]> {
  const rows = await draftRows(venueId, 'MYSTERY_CUSTOMER', statuses)
  return rows.flatMap((r) => {
    const d = r.data as Record<string, unknown>
    const cravings = Array.isArray(d.cravings)
      ? d.cravings.filter((c): c is string => typeof c === 'string')
      : []
    const preferences = Array.isArray(d.preferences)
      ? d.preferences.filter((p): p is string => typeof p === 'string')
      : []
    if (
      typeof d.profileId !== 'string' ||
      typeof d.budgetPaise !== 'number' ||
      cravings.length === 0 ||
      typeof d.appetiteDishes !== 'number' ||
      typeof d.scenarioCopy !== 'string'
    ) {
      return []
    }
    return [
      {
        id: r.id,
        profileId: d.profileId,
        budgetPaise: d.budgetPaise,
        cravings,
        preferences,
        appetiteDishes: d.appetiteDishes,
        scenarioCopy: d.scenarioCopy,
      },
    ]
  })
}

export async function gameCopyDraftViews(
  venueId: string,
  statuses: AiDraftStatus[] = ['DRAFT']
): Promise<GameCopyDraftView[]> {
  const rows = await draftRows(venueId, 'GAME_COPY', statuses)
  return rows.flatMap((r) => {
    const d = r.data as Record<string, unknown>
    if (
      typeof d.introCopy !== 'string' ||
      typeof d.promptCopy !== 'string' ||
      typeof d.discoveryCopy !== 'string'
    ) {
      return []
    }
    const game = d.game === 'SECRET_RECIPE' || d.game === 'MYSTERY_CUSTOMER' ? d.game : null
    return [{ id: r.id, game, introCopy: d.introCopy, promptCopy: d.promptCopy, discoveryCopy: d.discoveryCopy }]
  })
}

export async function narrationDraftViews(
  venueId: string,
  statuses: AiDraftStatus[] = ['DRAFT']
): Promise<NarrationDraftView[]> {
  const rows = await draftRows(venueId, 'WEEKLY_NARRATION', statuses)
  return rows.flatMap((r) => {
    const d = r.data as { sentences?: unknown }
    if (!Array.isArray(d.sentences)) return []
    const sentences = d.sentences.filter((s): s is string => typeof s === 'string' && s.trim() !== '')
    if (sentences.length === 0) return []
    return [{ id: r.id, sentences }]
  })
}

/** One draft per item, for the menu screen's per-row draft cards. */
export async function itemDescriptionDraftsByItem(
  venueId: string
): Promise<Map<string, ItemDescriptionDraftView>> {
  const drafts = await itemDescriptionDraftViews(venueId, ['DRAFT'])
  return new Map(drafts.map((d) => [d.itemId, d]))
}
// ── The operator's decision ──────────────────────────────────────────────────
//
// Approve is the only door from a draft to production data, and it is opened
// by a person on an operator screen. Every branch re-scopes by venueId, so a
// draft id (or the item id it references) from another venue cannot act.

export async function approveAiDraft(draftId: string, venueId: string): Promise<ApplyOutcome> {
  const draft = await db.aiContentDraft.findFirst({ where: { id: draftId, venueId } })
  if (!draft) return { ok: false, reason: 'NOT_FOUND' }
  if (draft.status !== 'DRAFT') return { ok: false, reason: 'NOT_DRAFT' }

  switch (draft.kind) {
    case 'ITEM_DESCRIPTION': {
      const data = draft.data as { description?: unknown }
      if (typeof data.description !== 'string' || data.description.trim() === '' || draft.refId === null) {
        return { ok: false, reason: 'NOT_FOUND' }
      }
      // Scoped by venue as well as id — an item id off another venue (or one
      // deactivated since the draft was written) updates zero rows.
      const updated = await db.menuItem.updateMany({
        where: { id: draft.refId, venueId },
        data: { aiDescription: data.description },
      })
      if (updated.count === 0) return { ok: false, reason: 'ITEM_GONE' }
      break
    }

    case 'SECRET_RECIPE': {
      const candidate = draft.data as Record<string, unknown>
      const combinationId =
        typeof candidate.combinationId === 'string' ? candidate.combinationId : null
      const itemIds = Array.isArray(candidate.itemIds)
        ? candidate.itemIds.filter((i): i is string => typeof i === 'string')
        : []
      const revealItemId =
        typeof candidate.revealItemId === 'string' ? candidate.revealItemId : null
      if (!combinationId || itemIds.length < 2 || !revealItemId || !itemIds.includes(revealItemId)) {
        return { ok: false, reason: 'MENU_CHANGED' }
      }
      // The menu may have changed since the draft was written. Re-verify every
      // id still resolves to an item of this venue before anything is merged —
      // the guest game drops broken combos, but a config that silently loses
      // them is worse than an honest refusal here.
      const items = await db.menuItem.findMany({
        where: { venueId, id: { in: [...itemIds, revealItemId] } },
        select: { id: true },
      })
      const present = new Set(items.map((i) => i.id))
      if (!itemIds.every((id) => present.has(id)) || !present.has(revealItemId)) {
        return { ok: false, reason: 'MENU_CHANGED' }
      }
      const row = await db.venueGame.findFirst({
        where: { venueId, mechanic: 'SECRET_RECIPE' },
        select: { data: true },
      })
      const existing = parseSecretRecipeData(row?.data)
      const combos = existing.combos.some((c) => c.id === combinationId)
        ? existing.combos
        : [...existing.combos, { id: combinationId, ingredients: itemIds, reveals: revealItemId }]
      const data: SecretRecipeData = { combos }
      await upsertVenueGameData(venueId, 'SECRET_RECIPE', data)
      break
    }

    case 'MYSTERY_CUSTOMER': {
      const candidate = draft.data as Record<string, unknown>
      const budgetPaise =
        typeof candidate.budgetPaise === 'number' &&
        Number.isInteger(candidate.budgetPaise) &&
        candidate.budgetPaise > 0
          ? candidate.budgetPaise
          : null
      const cravings = Array.isArray(candidate.cravings)
        ? candidate.cravings
            .filter((c): c is string => typeof c === 'string' && c.trim() !== '')
            .map((c) => c.trim())
        : []
      if (budgetPaise === null || cravings.length === 0) {
        return { ok: false, reason: 'MENU_CHANGED' }
      }
      const row = await db.venueGame.findFirst({
        where: { venueId, mechanic: 'MYSTERY_CUSTOMER' },
        select: { data: true },
      })
      const existing = parseMysteryCustomerData(row?.data)
      // Budgets and cravings merge into what the operator already wrote; the
      // course order is theirs alone and is never added to here.
      const data: MysteryCustomerData = {
        budgetOptionsPaise: [...new Set([...existing.budgetOptionsPaise, budgetPaise])].sort(
          (a, b) => a - b
        ),
        cravings: [...new Set([...existing.cravings, ...cravings])],
        courseOrder: existing.courseOrder,
      }
      await upsertVenueGameData(venueId, 'MYSTERY_CUSTOMER', data)
      break
    }

    // Game copy and narration have no production row behind them — approving
    // keeps them as the venue's saved copy, readable on their screens.
    case 'GAME_COPY':
    case 'WEEKLY_NARRATION':
      break
  }

  await db.aiContentDraft.update({ where: { id: draft.id }, data: { status: 'APPROVED' } })
  return { ok: true }
}

export async function rejectAiDraft(draftId: string, venueId: string): Promise<ApplyOutcome> {
  // The compound where is the tenancy check: a draft id from another venue
  // matches nothing and reports NOT_FOUND rather than rejecting someone
  // else's row.
  const updated = await db.aiContentDraft.updateMany({
    where: { id: draftId, venueId, status: 'DRAFT' },
    data: { status: 'REJECTED' },
  })
  if (updated.count === 0) return { ok: false, reason: 'NOT_FOUND' }
  return { ok: true }
}
// ── The operator's edit ──────────────────────────────────────────────────────
//
// An edit fixes the operator's own copy onto the draft. It never changes what
// a draft points at (item ids, budgets beyond the persona's own, course
// slots): those were validated against the real menu at generation time, and
// re-validating a hand-typed id list would be a second source of truth. The
// draft stays DRAFT — approving is still a separate, explicit act.

const EDIT_TEXT = z.string().trim().min(1).max(240)

export async function editAiDraft(
  draftId: string,
  venueId: string,
  patch: Record<string, unknown>
): Promise<ApplyOutcome> {
  const draft = await db.aiContentDraft.findFirst({ where: { id: draftId, venueId } })
  if (!draft) return { ok: false, reason: 'NOT_FOUND' }
  if (draft.status !== 'DRAFT') return { ok: false, reason: 'NOT_DRAFT' }

  switch (draft.kind) {
    case 'ITEM_DESCRIPTION': {
      const parsed = EDIT_TEXT.max(240).safeParse(patch.description)
      if (!parsed.success) return { ok: false, reason: 'INVALID' }
      await db.aiContentDraft.update({
        where: { id: draft.id },
        data: { data: { description: parsed.data } as object },
      })
      break
    }

    case 'SECRET_RECIPE': {
      const name = z.string().trim().min(1).max(120).safeParse(patch.discoveryName)
      const copy = EDIT_TEXT.safeParse(patch.revealCopy)
      if (!name.success || !copy.success) return { ok: false, reason: 'INVALID' }
      const current = draft.data as Record<string, unknown>
      await db.aiContentDraft.update({
        where: { id: draft.id },
        data: {
          data: { ...current, discoveryName: name.data, revealCopy: copy.data } as object,
        },
      })
      break
    }

    case 'MYSTERY_CUSTOMER': {
      const current = draft.data as Record<string, unknown>
      const copy = z.string().trim().min(1).max(360).safeParse(patch.scenarioCopy)
      if (!copy.success) return { ok: false, reason: 'INVALID' }
      const next: Record<string, unknown> = { ...current, scenarioCopy: copy.data }
      // Budget edits come in rupees and convert once, here — the same
      // boundary every money field crosses.
      if (patch.budgetRupees !== undefined) {
        const rupees = Number(patch.budgetRupees)
        if (!Number.isFinite(rupees) || rupees <= 0) return { ok: false, reason: 'INVALID' }
        const paise = Math.round(rupees * 100)
        if (!Number.isSafeInteger(paise) || paise <= 0) return { ok: false, reason: 'INVALID' }
        next.budgetPaise = paise
      }
      if (patch.cravings !== undefined) {
        const list = z.array(z.string().trim().min(1).max(40)).min(1).max(6).safeParse(patch.cravings)
        if (!list.success) return { ok: false, reason: 'INVALID' }
        next.cravings = list.data
      }
      await db.aiContentDraft.update({
        where: { id: draft.id },
        data: { data: next as object },
      })
      break
    }

    case 'GAME_COPY': {
      const intro = EDIT_TEXT.safeParse(patch.introCopy)
      const prompt = EDIT_TEXT.safeParse(patch.promptCopy)
      const discovery = EDIT_TEXT.safeParse(patch.discoveryCopy)
      if (!intro.success || !prompt.success || !discovery.success) {
        return { ok: false, reason: 'INVALID' }
      }
      const current = draft.data as Record<string, unknown>
      await db.aiContentDraft.update({
        where: { id: draft.id },
        data: {
          data: {
            ...current,
            introCopy: intro.data,
            promptCopy: prompt.data,
            discoveryCopy: discovery.data,
          } as object,
        },
      })
      break
    }

    case 'WEEKLY_NARRATION': {
      const parsed = z
        .array(z.string().trim().min(1).max(400))
        .min(1)
        .max(3)
        .safeParse(patch.sentences)
      if (!parsed.success) return { ok: false, reason: 'INVALID' }
      await db.aiContentDraft.update({
        where: { id: draft.id },
        data: { data: { sentences: parsed.data } as object },
      })
      break
    }
  }

  return { ok: true }
}