import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The magic-link path's anti-enumeration property (SECURITY.md §7).
 *
 * It lived in `e2e/operator-auth.spec.ts`, driving the `/signin` form, until
 * that form became a password form (§7a). The property belongs to
 * `requestMagicLink` rather than to any page, so it is asserted here and
 * survives the UI changing — which matters, because the link is dormant rather
 * than deleted and comes back to the front door once email works.
 */

const operatorUser = { upsert: vi.fn() }
const magicLinkToken = { count: vi.fn(), create: vi.fn() }
const sendMagicLink = vi.fn()

vi.mock('@/lib/db', () => ({ db: { operatorUser, magicLinkToken } }))
vi.mock('@/lib/email', () => ({ sendMagicLink }))

const { requestMagicLink } = await import('@/lib/operator-auth')

const NOW = 1_800_000_000_000
const BASE = 'https://example.test'

beforeEach(() => {
  vi.clearAllMocks()
  magicLinkToken.count.mockResolvedValue(0)
  magicLinkToken.create.mockResolvedValue({})
  sendMagicLink.mockResolvedValue(undefined)
})

describe('requestMagicLink', () => {
  it('answers identically for a known and an unknown address', async () => {
    operatorUser.upsert.mockResolvedValue({ id: 'op_known', email: 'owner@example.com' })
    const known = await requestMagicLink('owner@example.com', BASE, NOW, '203.0.113.7')

    operatorUser.upsert.mockResolvedValue({ id: 'op_new', email: 'nobody@example.com' })
    const unknown = await requestMagicLink('nobody@example.com', BASE, NOW, '203.0.113.7')

    expect(known, 'a different answer would be an enumeration oracle').toEqual(unknown)
    expect(known).toEqual({ ok: true })
  })

  it('signs up and signs in with the same request, so the two are indistinguishable', async () => {
    operatorUser.upsert.mockResolvedValue({ id: 'op_1', email: 'owner@example.com' })

    await requestMagicLink('owner@example.com', BASE, NOW)

    const call = operatorUser.upsert.mock.calls[0]?.[0]
    expect(call.where).toEqual({ email: 'owner@example.com' })
    expect(call.create).toEqual({ email: 'owner@example.com' })
  })

  it('emails a link built on the given origin, and stores only its hash', async () => {
    operatorUser.upsert.mockResolvedValue({ id: 'op_1', email: 'owner@example.com' })

    // Passed exactly as the action passes it: `publicBaseUrl()` is the one
    // place that strips a trailing slash, so this must not re-strip one.
    await requestMagicLink('owner@example.com', BASE, NOW)

    const [to, url] = sendMagicLink.mock.calls[0] ?? []
    expect(to).toBe('owner@example.com')
    expect(url).toMatch(new RegExp(`^${BASE}/signin/verify\\?token=`))

    const token = new URL(String(url)).searchParams.get('token')!
    const stored = magicLinkToken.create.mock.calls[0]?.[0].data.tokenHash
    expect(stored, 'a database dump must yield no working links').not.toContain(token)
    expect(stored).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refuses past the per-IP cap before creating an operator row', async () => {
    magicLinkToken.count.mockResolvedValue(999)

    const result = await requestMagicLink('owner@example.com', BASE, NOW, '203.0.113.7')

    expect(result).toEqual({ ok: false, reason: 'RATE_LIMITED' })
    expect(operatorUser.upsert, 'a junk operator row is half the damage').not.toHaveBeenCalled()
    expect(sendMagicLink).not.toHaveBeenCalled()
  })

  it('refuses a malformed address without touching the database', async () => {
    const result = await requestMagicLink('not-an-email', BASE, NOW)

    expect(result).toEqual({ ok: false, reason: 'INVALID_EMAIL' })
    expect(operatorUser.upsert).not.toHaveBeenCalled()
  })
})
