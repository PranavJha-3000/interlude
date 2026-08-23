import Anthropic from '@anthropic-ai/sdk'
import { MENU_DRAFT_SCHEMA, parseMenuDraft } from './parse'
import type { AiAdapter, AiUpload, ExtractResult } from './types'

/**
 * The Claude adapter.
 *
 * Extraction is transcription — the model is asked to read what is printed,
 * not to have an opinion — which is what makes a cheap model sufficient
 * (PLATFORM.md §6a). The model id is env config, not a constant, for the same
 * reason every venue number is: when it changes, code does not.
 *
 * The output is constrained to a JSON schema *and* re-validated with zod in
 * `parse.ts` — the schema stops malformed shapes, the parser stops plausible
 * nonsense (₹0 prices, blank names) from reaching the operator as fact.
 */

const DEFAULT_MODEL = 'claude-haiku-4-5'

const PROMPT = `Read this restaurant menu and transcribe every item you can see.

Rules:
- Transcribe only what is printed. Never invent an item or guess a price you cannot read.
- priceRupees is the printed price as a number, without the currency sign.
- category is the menu's own section heading, lowercased (e.g. "starters", "mains", "desserts", "beverages"). If there are no headings, use your best plain-language grouping.
- A dish printed with two portion sizes ("Half ₹220 / Full ₹380") becomes two items: "Paneer Tikka (Half)" and "Paneer Tikka (Full)".
- If part of the page is unreadable, say so in warnings rather than guessing.
- Do not include food costs, descriptions, or anything not asked for.`

export function claudeAdapter(apiKey: string): AiAdapter {
  const client = new Anthropic({ apiKey })
  const model = process.env.AI_MODEL || DEFAULT_MODEL

  return {
    name: 'claude',
    async extractMenu(upload: AiUpload): Promise<ExtractResult> {
      const source = { type: 'base64' as const, media_type: upload.mediaType, data: upload.base64 }
      const fileBlock =
        upload.mediaType === 'application/pdf'
          ? ({ type: 'document', source } as const)
          : ({ type: 'image', source } as const)

      let response: Anthropic.Message
      try {
        response = await client.messages.create({
          model,
          max_tokens: 16000,
          messages: [
            {
              role: 'user',
              content: [
                // The narrowing above can't convince TS of the media_type
                // unions; the shapes are the documented API shapes.
                fileBlock as Anthropic.ContentBlockParam,
                { type: 'text', text: PROMPT },
              ],
            },
          ],
          output_config: {
            format: { type: 'json_schema', schema: MENU_DRAFT_SCHEMA },
          },
        })
      } catch (error) {
        if (error instanceof Anthropic.APIError) {
          return { ok: false, reason: `The menu reader returned an error (${error.status}).` }
        }
        return { ok: false, reason: 'The menu reader could not be reached.' }
      }

      if (response.stop_reason === 'refusal') {
        return { ok: false, reason: 'The menu reader declined this file.' }
      }

      const text = response.content.find((b) => b.type === 'text')?.text ?? ''
      let raw: unknown
      try {
        raw = JSON.parse(text)
      } catch {
        return { ok: false, reason: 'The menu reader returned something unreadable.' }
      }

      const parsed = parseMenuDraft(raw)
      if (!parsed.ok) return { ok: false, reason: 'No menu items could be read from this file.' }
      return { ok: true, draft: parsed.draft }
    },
  }
}
