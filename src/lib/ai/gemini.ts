import { ApiError, GoogleGenAI, createPartFromBase64 } from '@google/genai'
import { formatPaise } from '@/lib/money'
import {
  GEMINI_DESCRIBE_ITEMS_SCHEMA,
  GEMINI_GAME_COPY_SCHEMA,
  GEMINI_MENU_SCHEMA,
  GEMINI_MYSTERY_CUSTOMER_SCHEMA,
  GEMINI_NARRATION_SCHEMA,
  GEMINI_SECRET_RECIPE_SCHEMA,
  jsonFromText,
  parseDescribeItems,
  parseGameCopy,
  parseMysteryCustomerCandidates,
  parseNarration,
  parseMenuDraft,
  parseSecretRecipeCandidates,
} from './parse'
import type {
  AiAdapter,
  AiUpload,
  DescribeItemsResult,
  ExtractResult,
  GameCopyInput,
  GameCopyResult,
  MenuItemForAI,
  MysteryCustomerGenResult,
  NarrationResult,
  SecretRecipeGenResult,
  WeeklyMetrics,
} from './types'

/**
 * The Gemini adapter.
 *
 * Extraction is transcription — the model is asked to read what is printed,
 * not to have an opinion — which is what makes the cheap flash tier sufficient
 * (PLATFORM.md §6a). The model id is env config, not a constant, for the same
 * reason every venue number is: when it changes, code does not.
 *
 * The output is constrained to a JSON schema *and* re-validated with zod in
 * `parse.ts` — the schema stops malformed shapes, the parser stops plausible
 * nonsense (₹0 prices, blank names) from reaching the operator as fact.
 *
 * Google's SDK (`@google/genai`) accepts both photos and PDFs inline, base64,
 * so a single path serves the file types the upload screen offers.
 */

const DEFAULT_MODEL = 'gemini-3.6-flash'

/** Finish reasons that mean the model stopped on content, not that it read the menu. */
const DECLINED_FINISH_REASONS = new Set(['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST'])

/**
 * Is this ApiError the key being wrong? 401/403 usually, but Google also
 * emits HTTP 400 with `API_KEY_INVALID` in the body for a bad or revoked
 * key — and without this check that lands in the generic `GEMINI_ERROR`
 * bucket, so the operator uploading a perfectly good menu is told to
 * "try a clearer photo" when the real fix is the API key. Exported for the
 * unit test; the typed shape is all the helper reads, so tests need no SDK
 * instance.
 */
export function isAuthError(error: { status?: number; message?: unknown }): boolean {
  if (error.status === 401 || error.status === 403) return true
  return /API_KEY_INVALID|API key not valid/i.test(String(error.message ?? ''))
}

const PROMPT = `Read this restaurant menu and transcribe every item you can see.

Rules:
- Transcribe only what is printed. Never invent an item or guess a price you cannot read.
- priceRupees is the printed price as a number, without the currency sign.
- category is the menu's own section heading, lowercased (e.g. "starters", "mains", "desserts", "beverages"). If there are no headings, use your best plain-language grouping.
- A dish printed with two portion sizes ("Half ₹220 / Full ₹380") becomes two items: "Paneer Tikka (Half)" and "Paneer Tikka (Full)".
- If a dish carries printed add-ons ("Extra cheese +₹50"), list each as a modifier with the printed price change as priceDeltaRupees. Never guess a modifier that is not printed.
- If the menu prints a one-line description under a dish, copy it into description exactly. Omit description when there is none.
- If part of the page is unreadable, say so in warnings rather than guessing.
- Do not include food costs, margins, or anything not printed on the page.`

/**
 * A more directive prompt for the second attempt, used only when the first
 * attempt returned no usable items. The first prompt is the rule book; this
 * one is a coaching call — read every line, even half-cut or partially
 * obscured, because a partial draft is more useful to the operator than a
 * blank one.
 */
const PROMPT_RETRY = `${PROMPT}

Additional rules for this attempt:
- If a price is partially obscured, transcribe the items anyway with the price you can read and put the unreadable price in warnings.
- If you can see at least one item, transcribe every item you can see, even if some look cut off.
- A 5-item draft is more useful to the operator than an empty one. Bias toward transcribing.`

/**
 * A short classification call: is the uploaded image even a menu? Used only
 * after a failed first attempt, so a non-menu upload (a page from a book, a
 * screenshot of a webpage, a photo of a person) gets a tailored error
 * message rather than the generic "could not read."
 */
const NON_MENU_PROMPT = `Look at the image. Is this a restaurant menu — printed prices, dish names, organised in sections?

Reply with JSON exactly: {"isMenu": true|false, "what": "one short sentence describing what is in the image"}`

/**
 * The extraction prompt above is transcription. Everything below is *draft
 * generation* — the model is told, in every prompt, that the operator confirms
 * each line and that costs, margins, prizes and outcomes are not its business.
 */

const DESCRIPTION_RULES = `Rules:
- Playful and food-focused, the way a good menu card talks. One line, at most 160 characters, plain text.
- Never mention a price, a cost, a margin, calories or allergens.
- Return one entry for every item you were given, keyed by its exact itemId. Never invent an itemId.`

function describeItemsPrompt(menu: readonly MenuItemForAI[]): string {
  const list = menu.map((m) => `- ${m.id}: ${m.name} (${m.category})`).join('\n')
  return `Write a one-line menu description for each of these dishes.\n\n${list}\n\n${DESCRIPTION_RULES}`
}

function secretRecipesPrompt(venueName: string, menu: readonly MenuItemForAI[]): string {
  const list = menu.map((m) => `- ${m.id}: ${m.name} (${m.category})`).join('\n')
  return `${venueName} runs a Secret Recipe game: guests tap a few dishes they think belong together and discover a real combination off this menu.

Menu (id — name, category):
${list}

Propose up to 5 candidate combinations.

Rules:
- Every id in itemIds and the revealItemId must be copied exactly from the list above. Never invent an id.
- Each combination uses 2 to 4 distinct items.
- The reveal must be one of the combination's own items — the dish the discovery points guests at.
- discoveryName is what the reveal screen calls the find (short, no prices).
- revealCopy is one line the reveal screen can show, at most 160 characters.
- Combinations must be distinct — never propose the same set of items twice.
- Do not invent dishes, costs, margins or kitchen constraints.`
}

function mysteryCustomersPrompt(
  venueName: string,
  menu: readonly MenuItemForAI[],
  courseOrder: readonly string[]
): string {
  const prices = menu.map((m) => m.pricePaise ?? 0).filter((p) => p > 0)
  const low = prices.length > 0 ? Math.min(...prices) : 0
  const high = prices.length > 0 ? Math.max(...prices) : 0
  return `${venueName} runs a Mystery Customer game: a guest is dealt a customer brief — a budget, a craving, a preference — and builds a meal from the real menu to fit it.

Menu price band, in paise: cheapest item ${low}, most expensive ${high}. Course slots the guest fills: ${courseOrder.join(', ') || 'main'}.

Propose up to 5 candidate personas.

Rules:
- budgetPaise is what this customer can spend, in whole paise, between ${low} and ${high}.
- cravings and preferences are short lowercase tags matched against the menu's own tags (e.g. "spicy", "veg", "sweet", "shareable").
- appetiteDishes is how many dishes the customer expects, between 1 and 6.
- scenarioCopy is one line selling this persona to the restaurant owner, at most 200 characters.
- Describe the brief only. Never score a meal and never decide an outcome.`
}

function gameCopyPrompt(input: GameCopyInput): string {
  const gameName = input.game === 'SECRET_RECIPE' ? 'Secret Recipe' : 'Mystery Customer'
  return `Write short, mobile-friendly, food-focused copy for the ${gameName} game at ${input.venueName}.

introCopy — one line that introduces the game on its own screen.
promptCopy — one line that tells the guest what to do.
discoveryCopy — one line shown when a guest succeeds.

Rules:
- At most 140 characters each, plain text, no emoji.
- Food-first. Never mention prizes, money, discounts, chances or luck.
- Never promise anything the product does not do.`
}

function narrateReportRequest(metrics: WeeklyMetrics): {
  prompt: string
  figures: string[]
  counts: string[]
} {
  const net = formatPaise(metrics.netContributionPaise)
  const prizes = formatPaise(metrics.prizeCostPaise)
  const figures = [net, prizes]
  const counts = [
    String(metrics.serviceCount),
    String(metrics.controlCount),
    String(metrics.runsOpened),
    String(metrics.tablesTented),
    // The venue's own name may legitimately carry digits.
    ...(metrics.venueName.match(/\d+/g) ?? []),
  ]

  const scan = metrics.scanRatePct === null ? '' : `\n- Scan rate: ${metrics.scanRatePct}%`
  if (metrics.scanRatePct !== null) figures.push(`${metrics.scanRatePct}%`)
  const caveat = metrics.estimateOnly
    ? 'app-side estimate (blind to cash tips and to what these tables would have ordered anyway)'
    : "measured from the venue's own bill export against the same-weekday baseline"

  const prompt = `Write exactly three sentences narrating this week at ${metrics.venueName} for the restaurant owner.

The figures, already computed and final:
- Net contribution across the live services: ${net}
- Prize cost: ${prizes}
- Tables played: ${metrics.runsOpened} of ${metrics.tablesTented} tented
- Services: ${metrics.serviceCount} live, ${metrics.controlCount} control${scan}
- Data quality: ${caveat}

Rules:
- Narrate only the figures above. Never calculate, round, compare or infer a number that is not listed.
- Any rupee or percent figure you write must match the provided text exactly, character for character.
- Every other number you write must be one of the counts listed above.
- Plain sentences. No headings, no bullet points, no emoji.`

  return { prompt, figures, counts }
}

export function geminiAdapter(apiKey: string): AiAdapter {
  const client = new GoogleGenAI({ apiKey })
  const model = process.env.AI_MODEL || DEFAULT_MODEL

  /**
   * One text-only structured request, shared by every draft-generating call.
   * Errors keep the extraction's voice — the operator never sees a stack
   * trace, only a sentence they can act on.
   */
  async function request(
    prompt: string,
    schema: object
  ): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
    try {
      const response = await client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: 'application/json', responseSchema: schema },
      })

      const candidate = response.candidates?.[0]
      if (!candidate || DECLINED_FINISH_REASONS.has(candidate.finishReason ?? '')) {
        return { ok: false, reason: 'The AI reader declined this request.' }
      }
      return { ok: true, text: response.text ?? '' }
    } catch (error) {
      if (error instanceof ApiError) {
        const status = error.status ?? 0
        if (isAuthError(error)) {
          return { ok: false, reason: `GEMINI_AUTH The AI reader rejected the API key (HTTP 401/403).` }
        }
        if (status === 429) {
          return { ok: false, reason: `GEMINI_QUOTA The AI reader is rate-limited right now (HTTP 429).` }
        }
        return { ok: false, reason: `GEMINI_ERROR The AI reader returned an error (HTTP ${status}).` }
      }
      return { ok: false, reason: 'The AI reader could not be reached.' }
    }
  }

  /** The response text to raw JSON, or the failure to show instead. */
  function dataFrom(
    result: { ok: true; text: string } | { ok: false; reason: string }
  ): { ok: true; data: unknown } | { ok: false; reason: string } {
    if (!result.ok) return result
    return jsonFromText(result.text)
  }

  return {
    name: 'gemini',
    async extractMenu(upload: AiUpload): Promise<ExtractResult> {
      // Two attempts: the first with the normal prompt, the second with a
      // more directive prompt that tells the model to be liberal about
      // partial reads. The first call is the one that usually works; the
      // second is the safety net for blurry photos where the model gave up
      // too quickly.
      const first = await callGeminiForMenu(upload, PROMPT, client, model)
      if (first.ok) return first
      if (!first.retryable) return first

      const second = await callGeminiForMenu(upload, PROMPT_RETRY, client, model)
      return second
    },

    async describeItems(menu): Promise<DescribeItemsResult> {
      if (menu.length === 0) {
        return { ok: false, reason: 'There are no active menu items to describe yet.' }
      }
      const data = dataFrom(await request(describeItemsPrompt(menu), GEMINI_DESCRIBE_ITEMS_SCHEMA))
      if (!data.ok) return data
      return parseDescribeItems(data.data, new Set(menu.map((m) => m.id)))
    },

    async generateSecretRecipes({ venueName, menu }): Promise<SecretRecipeGenResult> {
      if (menu.length < 2) {
        return { ok: false, reason: 'Add at least two active menu items first.' }
      }
      const data = dataFrom(
        await request(secretRecipesPrompt(venueName, menu), GEMINI_SECRET_RECIPE_SCHEMA)
      )
      if (!data.ok) return data
      return parseSecretRecipeCandidates(data.data, new Set(menu.map((m) => m.id)))
    },

    async generateMysteryCustomers({
      venueName,
      menu,
      courseOrder,
    }): Promise<MysteryCustomerGenResult> {
      const prices = menu.map((m) => m.pricePaise ?? 0).filter((p) => p > 0)
      if (prices.length === 0) {
        return { ok: false, reason: 'Add menu items with prices first.' }
      }
      const data = dataFrom(
        await request(
          mysteryCustomersPrompt(venueName, menu, courseOrder),
          GEMINI_MYSTERY_CUSTOMER_SCHEMA
        )
      )
      if (!data.ok) return data
      return parseMysteryCustomerCandidates(data.data)
    },

    async generateGameCopy(input): Promise<GameCopyResult> {
      const data = dataFrom(await request(gameCopyPrompt(input), GEMINI_GAME_COPY_SCHEMA))
      if (!data.ok) return data
      return parseGameCopy(data.data)
    },

    async narrateReport(metrics): Promise<NarrationResult> {
      const { prompt, figures, counts } = narrateReportRequest(metrics)
      const data = dataFrom(await request(prompt, GEMINI_NARRATION_SCHEMA))
      if (!data.ok) return data
      return parseNarration(data.data, figures, counts)
    },
  }
}

/**
 * One extraction call. Returns the result, the underlying reason when it
 * failed, and whether the failure is *retryable* (a partial draft) or
 * terminal (auth, quota, the model declined — retrying cannot help).
 *
 * A retry is only worth doing when the model returned something parseable
 * but the draft was empty or every item was dropped — that is the partial-
 * read case where the second prompt's "bias toward transcribing" rule wins.
 * Network errors and auth/quota errors are terminal and short-circuit.
 */
async function callGeminiForMenu(
  upload: AiUpload,
  prompt: string,
  client: GoogleGenAI,
  model: string
): Promise<ExtractResult & { retryable?: boolean }> {
  let text: string | null = null
  try {
    const response = await client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [createPartFromBase64(upload.base64, upload.mediaType), { text: prompt }],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: GEMINI_MENU_SCHEMA,
      },
    })

    const candidate = response.candidates?.[0]
    if (!candidate || DECLINED_FINISH_REASONS.has(candidate.finishReason ?? '')) {
      return { ok: false, reason: 'The menu reader declined this file.' }
    }
    text = response.text ?? null
  } catch (error) {
    if (error instanceof ApiError) {
      // 401/403 (and 400 API_KEY_INVALID) mean the key is wrong; 429 means
      // quota; 5xx is Google's side. None of these improve with a retry —
      // propagate with the token the classifier can route on.
      const status = error.status ?? 0
      if (isAuthError(error)) {
        return {
          ok: false,
          reason: 'GEMINI_AUTH The menu reader rejected the API key (HTTP 401/403).',
        }
      }
      if (status === 429) {
        return {
          ok: false,
          reason: 'GEMINI_QUOTA The menu reader is rate-limited right now (HTTP 429).',
        }
      }
      return {
        ok: false,
        reason: `GEMINI_ERROR The menu reader returned an error (HTTP ${status}).`,
      }
    }
    return { ok: false, reason: 'The menu reader could not be reached.' }
  }

  let raw: unknown
  try {
    raw = JSON.parse(text ?? '')
  } catch {
    return { ok: false, reason: 'The menu reader returned something unreadable.' }
  }

  const parsed = parseMenuDraft(raw)
  if (parsed.ok) return { ok: true, draft: parsed.draft }

  // The two parser reasons worth retrying: no items at all, or every item
  // dropped (e.g. every price read as 0 or as an implausible number). Both
  // are signals the model gave up too soon.
  if (parsed.reason === 'NO_ITEMS' || parsed.reason === 'ALL_ITEMS_DROPPED') {
    return {
      ok: false,
      reason: `The menu reader did not find any menu items in this file.${
        parsed.warnings && parsed.warnings.length > 0
          ? ' ' + parsed.warnings.slice(0, 2).join(' ')
          : ''
      }`,
      retryable: true,
    }
  }

  // INVALID_SHAPE / NOT_AN_OBJECT — the model returned something that
  // doesn't even look like a menu draft. Retrying with the same prompt
  // produces the same shape, so we go further and ask: is this even a menu?
  if (parsed.reason === 'INVALID_SHAPE' || parsed.reason === 'NOT_AN_OBJECT') {
    const isMenu = await classifyAsMenu(upload, client, model)
    if (isMenu && !isMenu.isMenu && isMenu.what) {
      return {
        ok: false,
        reason: `NOT_A_MENU The image does not look like a menu — ${isMenu.what}.`,
      }
    }
    return {
      ok: false,
      reason: `The menu reader could not make sense of this file. ${
        parsed.zodIssues && parsed.zodIssues.length > 0
          ? `(${parsed.zodIssues[0]})`
          : ''
      }`.trim(),
    }
  }

  return { ok: false, reason: 'No menu items could be read from this file.' }
}

const NON_MENU_SCHEMA = {
  type: 'OBJECT',
  properties: {
    isMenu: { type: 'BOOLEAN' },
    what: { type: 'STRING' },
  },
  required: ['isMenu', 'what'],
} as const

/**
 * A second, very small call: "is this image a menu at all?" Used only when
 * the main extraction returned nothing parseable. Returns null on any
 * failure — the operator gets the generic "could not read" message rather
 * than a hard error from this call.
 */
async function classifyAsMenu(
  upload: AiUpload,
  client: GoogleGenAI,
  model: string
): Promise<{ isMenu: boolean; what: string } | null> {
  try {
    const response = await client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [createPartFromBase64(upload.base64, upload.mediaType), { text: NON_MENU_PROMPT }],
        },
      ],
      config: { responseMimeType: 'application/json', responseSchema: NON_MENU_SCHEMA },
    })
    const text = response.text
    if (!text) return null
    const parsed = jsonFromText(text)
    if (!parsed.ok) return null
    const data = parsed.data as { isMenu?: boolean; what?: string }
    return { isMenu: Boolean(data.isMenu), what: String(data.what ?? '').slice(0, 200) }
  } catch {
    return null
  }
}
