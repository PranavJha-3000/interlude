'use client'

import { useState } from 'react'
import { en } from '@/strings/en'

/**
 * Share the venue link — the phone's own share sheet where there is one, the
 * clipboard where there is not.
 *
 * Both are behind a feature check rather than a user-agent guess, and the
 * fallback is a plain copy so the button always does something. The URL is
 * already rendered as text above it, so even with neither API the operator can
 * select it by hand.
 */
export function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ url })
        return
      } catch {
        // A dismissed share sheet rejects. That is a choice, not a failure, so
        // fall through to the clipboard rather than showing an error.
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // No clipboard permission. The URL is on screen as selectable text.
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="min-h-14 flex-1 rounded-xl border border-line px-5 text-lg font-semibold"
    >
      {copied ? en.onboarding.qr.shared : en.onboarding.qr.share}
    </button>
  )
}
