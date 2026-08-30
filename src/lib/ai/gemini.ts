import { ApiError, GoogleGenAI, createPartFromBase64 } from '@google/genai'
import { GEMINI_MENU_SCHEMA, parseMenuDraft } from './parse'
import type { AiAdapter, AiUpload, ExtractResult } from './types'

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

const DEFAULT_MODEL = 'gemini-2.5-flash'

/** Finish reasons that mean the model stopped on content, not that it read the menu. */
const DECLINED_FINISH_REASONS = new Set(['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST'])

const PROMPT = `Read this restaurant menu and transcribe every item you can see.

Rules:
- Transcribe only what is printed. Never invent an item or guess a price you cannot read.
- priceRupees is the printed price as a number, without the currency sign.
- category is the menu's own section heading, lowercased (e.g. "starters", "mains", "desserts", "beverages"). If there are no headings, use your best plain-language grouping.
- A dish printed with two portion sizes ("Half ₹220 / Full ₹380") becomes two items: "Paneer Tikka (Half)" and "Paneer Tikka (Full)".
- If part of the page is unreadable, say so in warnings rather than guessing.
- Do not include food costs, descriptions, or anything not asked for.`

export function geminiAdapter(apiKey: string): AiAdapter {
  const client = new GoogleGenAI({ apiKey })
  const model = process.env.AI_MODEL || DEFAULT_MODEL

  return {
    name: 'gemini',
    async extractMenu(upload: AiUpload): Promise<ExtractResult> {
      let text: string | null = null
      try {
        const response = await client.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [createPartFromBase64(upload.base64, upload.mediaType), { text: PROMPT }],
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
          return { ok: false, reason: `The menu reader returned an error (${error.status}).` }
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
      if (!parsed.ok) return { ok: false, reason: 'No menu items could be read from this file.' }
      return { ok: true, draft: parsed.draft }
    },
  }
}