'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { db } from '@/lib/db'
import { clientIpFrom } from '@/lib/magic-link'
import {
  fillTimingLooksHuman,
  parseReferral,
  referralRateAllows,
  referralSubmitterKey,
  verifyReferralFormToken,
  REFERRAL_RATE_WINDOW_MS,
} from '@/lib/referral'

/**
 * The one write behind "Refer a Restaurant". Order matters and every branch is
 * a redirect, never an exception surfacing to a stranger:
 *
 *  1. Honeypot filled → silent discard, shown success. No row, no signal.
 *  2. Invalid human input → back to the form with the first offending field's
 *     code in the URL, which the strings file answers in copy. Before the time
 *     trap deliberately: a real visitor who honestly mistypes must get the
 *     field-specific answer even if they were quick; the trap exists to stop
 *     volume spam, not to disguise itself as a typo.
 *  3. Form token bad, or POST too fast/stale → silent discard, shown success.
 *     Same screen as a win, so a bot that survives steps 1–2 learns nothing.
 *  4. Network over its hourly cap → honest rate-limit refusal.
 *  5. Otherwise: insert and show success.
 */
export async function submitReferral(formData: FormData): Promise<void> {
  // A public form is exactly where an absent SESSION_SECRET must stop the
  // world rather than sign anything. check-env keeps this from being possible
  // anywhere the app runs; the throw is the floor beneath that.
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length === 0) {
    throw new Error('SESSION_SECRET is required before the referral form can run')
  }

  // ── 1. Honeypot ──────────────────────────────────────────────────────────
  const honeypot = String(formData.get('company') ?? '')
  if (honeypot.trim() !== '') {
    redirect('/refer?submitted=1')
  }

  // ── 2. Human-shaped validation ───────────────────────────────────────────
  const pick = (name: string) => String(formData.get(name) ?? '')
  const parsed = parseReferral({
    restaurantName: pick('restaurantName'),
    location: pick('location'),
    pocName: pick('pocName'),
    pocPhone: pick('pocPhone'),
    pocRoleTitle: pick('pocRoleTitle'),
    referrerName: pick('referrerName'),
    referrerContact: pick('referrerContact'),
  })
  if (!parsed.ok) {
    redirect(`/refer?error=${parsed.code}`)
  }

  // ── 3. Signed time trap ──────────────────────────────────────────────────
  const verdict = verifyReferralFormToken(secret, formData.get('ft'))
  const timingOk = verdict.valid && fillTimingLooksHuman(verdict.issuedAtMs, Date.now())
  if (!timingOk) {
    redirect('/refer?submitted=1')
  }

  // ── 4. Rate limit per hashed network ─────────────────────────────────────
  const forwardedFor = (await headers()).get('x-forwarded-for')
  const submitterKey = referralSubmitterKey(secret, clientIpFrom(forwardedFor))
  const windowStart = new Date(Date.now() - REFERRAL_RATE_WINDOW_MS)
  const recent = await db.referral.count({
    where: { submitterKey, createdAt: { gt: windowStart } },
  })
  if (!referralRateAllows(recent)) {
    redirect('/refer?error=RATE_LIMITED')
  }

  // ── 5. Store ─────────────────────────────────────────────────────────────
  await db.referral.create({ data: { ...parsed.value, submitterKey } })

  redirect('/refer?submitted=1')
}
