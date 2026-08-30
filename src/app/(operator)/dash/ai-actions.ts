'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireOperator } from '@/lib/operator-session'
import {
  approveAiDraft,
  editAiDraft,
  generateNarrationDraft,
  rejectAiDraft,
} from '@/lib/ai-drafts'

/**
 * AI narration actions for the command center (PLATFORM.md §6a).
 *
 * The narration is drafted from the week's already-computed figures — the same
 * reader the Monday email uses — and is never written anywhere until the
 * operator approves it. Venue from the session; every draft action re-checks
 * the draft id against the venue inside `lib/ai-drafts`.
 */

function aiErrorKey(reason: string): string {
  switch (reason) {
    case 'AI_UNAVAILABLE':
      return 'ai_unavailable'
    case 'NO_SERVICES':
      return 'ai_no_services'
    case 'NOT_FOUND':
    case 'NOT_DRAFT':
      return 'ai_not_found'
    case 'INVALID':
      return 'ai_invalid'
    default:
      return 'ai_failed'
  }
}

export async function generateNarration(): Promise<void> {
  const operator = await requireOperator()

  const result = await generateNarrationDraft(operator.venueId)
  revalidatePath('/dash')
  if (!result.ok) redirect(`/dash?error=${aiErrorKey(result.reason)}`)
  redirect('/dash')
}

export async function approveNarrationDraft(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const result = await approveAiDraft(String(formData.get('draftId') ?? ''), operator.venueId)
  revalidatePath('/dash')
  if (!result.ok) redirect(`/dash?error=${aiErrorKey(result.reason)}`)
  redirect('/dash')
}

export async function rejectNarrationDraft(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  await rejectAiDraft(String(formData.get('draftId') ?? ''), operator.venueId)
  revalidatePath('/dash')
  redirect('/dash')
}

export async function editNarrationDraft(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const result = await editAiDraft(String(formData.get('draftId') ?? ''), operator.venueId, {
    sentences: String(formData.get('sentences') ?? '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
  })
  revalidatePath('/dash')
  if (!result.ok) redirect(`/dash?error=${aiErrorKey(result.reason)}`)
  redirect('/dash')
}