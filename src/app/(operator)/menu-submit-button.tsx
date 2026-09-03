'use client'

import { useFormStatus } from 'react-dom'
import { en } from '@/strings/en'

/**
 * The submit button for the menu upload form.
 *
 * Extraction is a long-running server action - verification against a real
 * 21-page PDF measured about 2.5 minutes before the draft grid appears. A
 * plain submit button leaves that whole window silent, which reads as a dead
 * click (and invites a second submission stacking a second paid extraction).
 *
 * useFormStatus reports the pending state of the surrounding form and must
 * be called from a component inside the <form> element, which is why the
 * button is its own client component while the form itself stays
 * server-rendered with zero other client JS.
 */
export function MenuSubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="mt-4 min-h-11 w-full rounded-xl border border-line px-5 text-base font-semibold disabled:opacity-60"
    >
      {pending ? en.onboarding.menu.upload.submitLoading : en.onboarding.menu.upload.submit}
    </button>
  )
}