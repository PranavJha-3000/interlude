import 'server-only'

import { geminiAdapter } from './gemini'
import { mockAdapter } from './mock'
import type { AiAdapter } from './types'

export type {
  AiAdapter,
  AiUpload,
  DescribeItemDraft,
  DescribeItemsResult,
  ExtractResult,
  GameCopyDraft,
  GameCopyInput,
  GameCopyResult,
  GameKind,
  MenuDraft,
  MenuDraftItem,
  MenuModifier,
  MenuItemForAI,
  MysteryCustomerCandidate,
  MysteryCustomerGenResult,
  MysteryCustomerGenerationInput,
  NarrationResult,
  SecretRecipeCandidate,
  SecretRecipeGenResult,
  SecretRecipeGenerationInput,
  WeeklyMetrics,
} from './types'

/**
 * Which adapter serves this process — the `email.ts` pattern, applied to AI.
 *
 * - `GEMINI_API_KEY` set → the real adapter.
 * - No key, not production → the mock. A developer never needs a key.
 * - No key in production → `null`, and the upload screen says extraction is
 *   unavailable while CSV and typing still work. Deliberately *not* a boot
 *   failure like email: sign-in without email locks every operator out, but a
 *   menu can still arrive three other ways, so this degrades instead.
 * - `AI_TRANSPORT=mock` forces the mock anywhere — the E2E suite runs a
 *   production build and needs the deterministic fixture by name.
 */
export function getAiAdapter(): AiAdapter | null {
  if (process.env.AI_TRANSPORT === 'mock') return mockAdapter
  const key = process.env.GEMINI_API_KEY
  if (key) return geminiAdapter(key)
  if (process.env.NODE_ENV !== 'production') return mockAdapter
  return null
}
