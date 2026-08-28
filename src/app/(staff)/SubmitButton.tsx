'use client'

import { useFormStatus } from 'react-dom'
import { en } from '@/strings/en'

/**
 * A submit button that reflects its enclosing form's in-flight state.
 *
 * The staff surfaces are server-action forms on a mounted tablet or a phone
 * held mid-service; a bare `<button type="submit">` neither disables nor says
 * anything while the server round-trips, and a double-tap could fire a table's
 * order twice. `useFormStatus` reads the pending state of the form this button
 * sits in, so it stays fast, non-blocking and needs no shared state.
 */
export function SubmitButton({
  children,
  pending,
  className,
  disabled,
  ...props
}: React.ComponentProps<'button'> & { pending?: string }) {
  const { pending: formPending } = useFormStatus()
  const busy = formPending || disabled
  return (
    <button {...props} className={className} disabled={busy} aria-busy={busy}>
      {busy ? (pending ?? en.common.loading) : children}
    </button>
  )
}
