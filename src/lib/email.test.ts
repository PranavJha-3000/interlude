import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sendEmail } from '@/lib/email'

/**
 * The console fallback is a development convenience. These tests exist because
 * it was also reachable in a deployed build, where it turns a missing
 * `RESEND_API_KEY` into a sign-in page that says "check your email" and sends
 * nothing — the same class of silent outage `base-url.ts` refuses to allow.
 */

const MESSAGE = { to: 'owner@example.com', subject: 'Sign in', text: 'link' }

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('sendEmail transport selection', () => {
  it('prints to the console in development, so a laptop needs no credentials', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('RESEND_API_KEY', '')

    await expect(sendEmail(MESSAGE)).resolves.toBeUndefined()
    expect(console.log).toHaveBeenCalledOnce()
  })

  it('refuses to silently drop mail in a deployed build with no key', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('EMAIL_TRANSPORT', '')

    await expect(sendEmail(MESSAGE)).rejects.toThrow(/RESEND_API_KEY/)
    expect(console.log, 'silence is the bug; logging is not a send').not.toHaveBeenCalled()
  })

  it('still allows the console transport in production when it is asked for by name', async () => {
    // The E2E suite runs `next build && next start`, so it is a production
    // build that legitimately has no key. Opting in explicitly is what
    // separates that from a misconfigured deployment.
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('EMAIL_TRANSPORT', 'console')

    await expect(sendEmail(MESSAGE)).resolves.toBeUndefined()
    expect(console.log).toHaveBeenCalledOnce()
  })

  it('refuses a key with no sender address rather than letting Resend guess', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('EMAIL_FROM', '')

    await expect(sendEmail(MESSAGE)).rejects.toThrow(/EMAIL_FROM/)
  })

  it('posts to Resend when it is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('EMAIL_FROM', 'Interlude <signin@example.com>')
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }))

    await sendEmail(MESSAGE)

    expect(fetchMock).toHaveBeenCalledOnce()
    const call = fetchMock.mock.calls[0]
    expect(call).toBeDefined()
    const [url, init] = call!
    expect(url).toBe('https://api.resend.com/emails')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      from: 'Interlude <signin@example.com>',
      to: ['owner@example.com'],
    })
  })

  it('surfaces a Resend rejection instead of reporting success', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('EMAIL_FROM', 'Interlude <signin@example.com>')
    // 403 is what an unverified sending domain returns, which is the mistake a
    // first deployment is most likely to make after setting the key.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 403 }))

    await expect(sendEmail(MESSAGE)).rejects.toThrow(/403/)
  })
})
