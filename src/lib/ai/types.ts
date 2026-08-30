/**
 * The AI port (PLATFORM.md §6a).
 *
 * AI reads and drafts; a person confirms; it never decides. This module is the
 * only place a model is called, it lives in `lib/` because it does I/O, and it
 * is import-banned from `core/` by ESLint — an LLM is nondeterministic, and
 * `core/` is where the no-pure-chance guarantee is proved.
 *
 * The port is deliberately narrow. Menu extraction is *transcription* — names,
 * categories, prices, portion options, exactly what is printed on the page. It
 * is never asked for a food cost (the operator gives one percentage per
 * category and we compute), never asked to grade a margin, and never on the
 * guest's critical path.
 */

/** A file the operator uploaded, ready to hand to a model. */
export interface AiUpload {
  /** `image/jpeg`, `image/png`, `image/webp`, `image/gif` or `application/pdf`. */
  mediaType: string
  /** Base64 without newlines. */
  base64: string
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
}

export interface MenuDraft {
  items: MenuDraftItem[]
  /** Things the extractor was unsure about, shown above the draft grid. */
  warnings: string[]
}

export type ExtractResult = { ok: true; draft: MenuDraft } | { ok: false; reason: string }

export interface AiAdapter {
  /** Which adapter this is — surfaced in errors, never in guest copy. */
  readonly name: 'gemini' | 'mock'
  extractMenu(upload: AiUpload): Promise<ExtractResult>
}
