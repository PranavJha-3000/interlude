/**
 * The AI port (PLATFORM.md §6a).
 *
 * AI reads and drafts; a person confirms; it never decides. This module is the
 * only place a model is called, it lives in `lib/` because it does I/O, and it
 * is import-banned from `core/` by ESLint — an LLM is nondeterministic, and
 * `core/` is where the no-pure-chance guarantee is proved.
 *
 * The port is deliberately narrow. Menu extraction is *transcription* — names,
 * categories, prices, portion options, exactly what is printed on the page. The
 * new capabilities below are *draft generation*: playful descriptions, game
 * copy, candidate combos and personas, and weekly narration. Every one of them
 * comes back as a draft an operator reviews; none of them can write a cost, a
 * margin, a prize rule, an outcome or a business rule, because none of those
 * fields exist in this module's types. The model is never on the guest's
 * critical path and never sent customer identity.
 */

/** A file the operator uploaded, ready to hand to a model. */
export interface AiUpload {
  /** `image/jpeg`, `image/png`, `image/webp`, `image/gif` or `application/pdf`. */
  mediaType: string
  /** Base64 without newlines. */
  base64: string
}

/**
 * A printed add-on a dish carries, e.g. "Extra cheese +₹50". Transcribed from
 * the page like the price is; never a guess. Stored on the draft for operator
 * review, and deliberately not promoted to production `MenuItem` rows — the
 * production model has no modifier slot, and inventing one would be inventing
 * a cost the kitchen did not print.
 */
export interface MenuModifier {
  name: string
  /** As printed, positive or negative. Rupees, like `priceRupees`. */
  priceDeltaRupees: number
}

/**
 * One row the extractor read off the page. Rupees as printed — conversion to
 * paise happens exactly once, at confirm, through the same path typed input
 * takes.
 */
export interface MenuDraftItem {
  name: string
  category: string
  priceRupees: number
  /** The menu's own printed line, when it has one. Optional, rarely populated. */
  description?: string
  /** Printed add-ons on this dish, when the page lists them. */
  modifiers?: MenuModifier[]
}

export interface MenuDraft {
  items: MenuDraftItem[]
  /** Things the extractor was unsure about, shown above the draft grid. */
  warnings: string[]
}

export type ExtractResult = { ok: true; draft: MenuDraft } | { ok: false; reason: string }

/**
 * The read-only slice of a `MenuItem` the model may see.
 *
 * This is defence in depth, not just style: `foodCostPaise`, `marginTier`,
 * `prepBurden` and `isHero` do not exist on this type, so no prompt string ever
 * contains them and no model can be nudged into having an opinion about a
 * number the operator owns. The one gateway to the model constructs this from
 * the database row and nothing else.
 */
export interface MenuItemForAI {
  id: string
  name: string
  category: string
  pricePaise: number | null
}

// ── Item descriptions ────────────────────────────────────────────────────────

export interface DescribeItemDraft {
  /** One playful, mobile-friendly line. Never a price, cost or recipe. */
  description: string
}

export type DescribeItemsResult =
  | {
      ok: true
      drafts: Array<{ itemId: string; description: string }>
      /** Rows the validator dropped — shown above the review grid. */
      warnings: string[]
    }
  | { ok: false; reason: string }

// ── Secret Recipe candidates ─────────────────────────────────────────────────

export interface SecretRecipeGenerationInput {
  venueName: string
  /** Real, currently active menu items. The only ids a candidate may use. */
  menu: readonly MenuItemForAI[]
}

export interface SecretRecipeCandidate {
  combinationId: string
  /** The tap-set that unlocks this. Every id must be a real menu item id. */
  itemIds: string[]
  /**
   * The real menu item this discovery reveals. Required to be playable: the
   * guest game resolves the reveal to a dish the venue actually sells, so an
   * invented reveal name would silently drop out.
   */
  revealItemId: string
  /** What the reveal screen names the discovery. */
  discoveryName: string
  /** One line the reveal screen can show. */
  revealCopy: string
}

export type SecretRecipeGenResult =
  | { ok: true; candidates: SecretRecipeCandidate[]; warnings: string[] }
  | { ok: false; reason: string }
// ── Mystery Customer scenarios ───────────────────────────────────────────────

export interface MysteryCustomerGenerationInput {
  venueName: string
  menu: readonly MenuItemForAI[]
  /** The venue's course slots ('main', 'side', …). Personas target these. */
  courseOrder: string[]
}

export interface MysteryCustomerCandidate {
  profileId: string
  /** What this persona can spend, in paise. Determined, never scored by AI. */
  budgetPaise: number
  cravings: string[]
  preferences: string[]
  appetiteDishes: number
  /** A one-line narrative used to sell the persona to the operator. */
  scenarioCopy: string
}

export type MysteryCustomerGenResult =
  | { ok: true; candidates: MysteryCustomerCandidate[]; warnings: string[] }
  | { ok: false; reason: string }

// ── Game copy ───────────────────────────────────────────────────────────────

export type GameKind = 'SECRET_RECIPE' | 'MYSTERY_CUSTOMER'

export interface GameCopyInput {
  game: GameKind
  venueName: string
}

export interface GameCopyDraft {
  /** What introduces the game on its own screen. */
  introCopy: string
  /** What prompts the guest to play. */
  promptCopy: string
  /** What a successful discovery says. */
  discoveryCopy: string
}

export type GameCopyResult = { ok: true; draft: GameCopyDraft } | { ok: false; reason: string }

// ── Weekly performance narration ─────────────────────────────────────────────

/**
 * The only numbers a narration may mention, pre-computed by `core/`.
 *
 * The strict §6a rule: AI narrates these, never calculates them. The numbers
 * are formatted server-side before the call, the prompt says they are final,
 * and `parse.ts` rejects narration that carries a figure which was not handed
 * over — so a model that "improves" the week gets a refusal, not an email.
 */
export interface WeeklyMetrics {
  venueName: string
  netContributionPaise: number
  prizeCostPaise: number
  runsOpened: number
  tablesTented: number
  scanRatePct: number | null
  completionRatePct: number | null
  serviceCount: number
  controlCount: number
  /** App-side estimate vs bill-backed — the caveat travels regardless. */
  estimateOnly: boolean
}

export type NarrationResult = { ok: true; sentences: string[] } | { ok: false; reason: string }

export interface AiAdapter {
  /** Which adapter this is — surfaced in errors, never in guest copy. */
  readonly name: 'gemini' | 'mock'
  extractMenu(upload: AiUpload): Promise<ExtractResult>
  /** Playful one-line descriptions for a whole menu, in one call. */
  describeItems(menu: readonly MenuItemForAI[]): Promise<DescribeItemsResult>
  /** Candidate food combinations built only from the items provided. */
  generateSecretRecipes(input: SecretRecipeGenerationInput): Promise<SecretRecipeGenResult>
  /** Candidate mystery-customer personas built from the menu's attributes. */
  generateMysteryCustomers(input: MysteryCustomerGenerationInput): Promise<MysteryCustomerGenResult>
  /** Short, mobile-friendly, food-focused game copy. */
  generateGameCopy(input: GameCopyInput): Promise<GameCopyResult>
  /** ~3 sentences narrating the exact figures handed over, never new ones. */
  narrateReport(metrics: WeeklyMetrics): Promise<NarrationResult>
}
