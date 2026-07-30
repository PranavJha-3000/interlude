import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The database is stubbed rather than reached. What these tests are about is
 * the *decisions* — which failures are distinguishable, what order the throttle
 * runs in, whether a refusal leaves a row behind — and none of that needs
 * Postgres to be true. The e2e suite covers the wiring.
 */

const operatorUser = {
  create: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
}
const operatorLoginAttempt = {
  count: vi.fn(),
  create: vi.fn(),
}

vi.mock('@/lib/db', () => ({ db: { operatorUser, operatorLoginAttempt } }))

const { Prisma } = await import('@/generated/prisma/client')
const { hashPassword } = await import('@/lib/password')
const { PASSWORD_MAX_ATTEMPTS_PER_IP_PER_WINDOW, signInWithPassword, signUpWithPassword } =
  await import('@/lib/operator-password-auth')

const NOW = 1_800_000_000_000
const IP = '203.0.113.7'
const GOOD_PASSWORD = 'a-long-enough-password'

beforeEach(() => {
  vi.clearAllMocks()
  operatorLoginAttempt.count.mockResolvedValue(0)
  operatorLoginAttempt.create.mockResolvedValue({})
})

function takenError() {
  return new Prisma.PrismaClientKnownRequestError('unique constraint', {
    code: 'P2002',
    clientVersion: 'test',
  })
}

describe('signUpWithPassword', () => {
  it('creates an operator with a hash, never the password itself', async () => {
    operatorUser.create.mockResolvedValue({ id: 'op_1' })

    const result = await signUpWithPassword('Owner@Example.COM ', GOOD_PASSWORD, NOW, IP)

    expect(result).toEqual({ ok: true, operatorId: 'op_1' })
    const data = operatorUser.create.mock.calls[0]?.[0].data
    expect(data.email, 'addresses are matched case-insensitively').toBe('owner@example.com')
    expect(data.passwordHash).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{64}$/)
    expect(JSON.stringify(data)).not.toContain(GOOD_PASSWORD)
  })

  it('starts an operator with no venue, so onboarding can be abandoned halfway', async () => {
    operatorUser.create.mockResolvedValue({ id: 'op_1' })
    await signUpWithPassword('owner@example.com', GOOD_PASSWORD, NOW, IP)
    expect(operatorUser.create.mock.calls[0]?.[0].data.venueId).toBeUndefined()
  })

  it('lets the unique index arbitrate a duplicate rather than pre-checking', async () => {
    operatorUser.create.mockRejectedValue(takenError())

    const result = await signUpWithPassword('owner@example.com', GOOD_PASSWORD, NOW, IP)

    expect(result).toEqual({ ok: false, reason: 'EMAIL_TAKEN' })
    expect(operatorUser.findUnique, 'a pre-check would be a race').not.toHaveBeenCalled()
  })

  it('rethrows a database failure that is not a duplicate address', async () => {
    operatorUser.create.mockRejectedValue(new Error('connection lost'))
    await expect(signUpWithPassword('owner@example.com', GOOD_PASSWORD, NOW, IP)).rejects.toThrow(
      'connection lost'
    )
  })

  it('refuses a malformed address and a short password without writing anything', async () => {
    expect(await signUpWithPassword('not-an-email', GOOD_PASSWORD, NOW, IP)).toEqual({
      ok: false,
      reason: 'INVALID_EMAIL',
    })
    expect(await signUpWithPassword('owner@example.com', 'short', NOW, IP)).toEqual({
      ok: false,
      reason: 'WEAK_PASSWORD',
    })
    expect(operatorUser.create).not.toHaveBeenCalled()
  })

  it('refuses past the per-IP cap and leaves no operator row behind', async () => {
    operatorLoginAttempt.count.mockResolvedValue(PASSWORD_MAX_ATTEMPTS_PER_IP_PER_WINDOW)

    const result = await signUpWithPassword('owner@example.com', GOOD_PASSWORD, NOW, IP)

    expect(result).toEqual({ ok: false, reason: 'RATE_LIMITED' })
    expect(operatorUser.create, 'refusing after creating is half the damage').not.toHaveBeenCalled()
  })
})

describe('signInWithPassword', () => {
  it('signs in an operator whose password matches, and stamps lastLoginAt', async () => {
    operatorUser.findUnique.mockResolvedValue({
      id: 'op_1',
      venueId: 'venue_1',
      passwordHash: hashPassword(GOOD_PASSWORD),
    })
    operatorUser.update.mockResolvedValue({})

    const result = await signInWithPassword('owner@example.com', GOOD_PASSWORD, NOW, IP)

    expect(result).toEqual({ ok: true, operatorId: 'op_1', venueId: 'venue_1' })
    expect(operatorUser.update.mock.calls[0]?.[0].data.lastLoginAt).toEqual(new Date(NOW))
  })

  it('carries a venue-less operator through, since signup precedes onboarding', async () => {
    operatorUser.findUnique.mockResolvedValue({
      id: 'op_1',
      venueId: null,
      passwordHash: hashPassword(GOOD_PASSWORD),
    })
    operatorUser.update.mockResolvedValue({})

    const result = await signInWithPassword('owner@example.com', GOOD_PASSWORD, NOW, IP)

    expect(result).toEqual({ ok: true, operatorId: 'op_1', venueId: null })
  })

  it('gives one identical answer to a wrong password, an unknown address, and a link-only operator', async () => {
    const wrongPassword = async () => {
      operatorUser.findUnique.mockResolvedValue({
        id: 'op_1',
        venueId: 'venue_1',
        passwordHash: hashPassword(GOOD_PASSWORD),
      })
      return signInWithPassword('owner@example.com', 'the-wrong-password', NOW, IP)
    }
    const unknownAddress = async () => {
      operatorUser.findUnique.mockResolvedValue(null)
      return signInWithPassword('nobody@example.com', GOOD_PASSWORD, NOW, IP)
    }
    // An operator created by a magic link has never chosen a password. Null
    // must read as "cannot sign in this way", never as "any password will do".
    const linkOnlyOperator = async () => {
      operatorUser.findUnique.mockResolvedValue({
        id: 'op_1',
        venueId: 'venue_1',
        passwordHash: null,
      })
      return signInWithPassword('owner@example.com', GOOD_PASSWORD, NOW, IP)
    }

    const expected = { ok: false, reason: 'INVALID_CREDENTIALS' }
    expect(await wrongPassword()).toEqual(expected)
    expect(await unknownAddress()).toEqual(expected)
    expect(await linkOnlyOperator()).toEqual(expected)
    expect(operatorUser.update, 'a failed sign-in must not stamp a login').not.toHaveBeenCalled()
  })

  it('cannot be answered by an empty password against a null hash', async () => {
    operatorUser.findUnique.mockResolvedValue({ id: 'op_1', venueId: 'v', passwordHash: null })
    expect(await signInWithPassword('owner@example.com', '', NOW, IP)).toEqual({
      ok: false,
      reason: 'INVALID_CREDENTIALS',
    })
  })

  it('refuses a malformed address the same way, without querying for it', async () => {
    const result = await signInWithPassword('not-an-email', GOOD_PASSWORD, NOW, IP)

    expect(result, 'a distinct reason here would be a free hint').toEqual({
      ok: false,
      reason: 'INVALID_CREDENTIALS',
    })
    expect(operatorUser.findUnique).not.toHaveBeenCalled()
  })

  it('throttles per IP before checking the credential', async () => {
    operatorLoginAttempt.count.mockResolvedValue(PASSWORD_MAX_ATTEMPTS_PER_IP_PER_WINDOW)

    const result = await signInWithPassword('owner@example.com', GOOD_PASSWORD, NOW, IP)

    expect(result).toEqual({ ok: false, reason: 'RATE_LIMITED' })
    expect(operatorUser.findUnique, 'the cheap refusal comes first').not.toHaveBeenCalled()
  })

  it('records each attempt inside the window it is counted against', async () => {
    operatorUser.findUnique.mockResolvedValue(null)

    await signInWithPassword('owner@example.com', GOOD_PASSWORD, NOW, IP)

    expect(operatorLoginAttempt.create).toHaveBeenCalledWith({ data: { ip: IP } })
    const since = operatorLoginAttempt.count.mock.calls[0]?.[0].where.createdAt.gte
    expect(since.getTime()).toBeLessThan(NOW)
  })

  it('stores nothing about which address was aimed at', async () => {
    operatorUser.findUnique.mockResolvedValue(null)

    await signInWithPassword('target@example.com', GOOD_PASSWORD, NOW, IP)

    // Recording the address would assemble exactly the list of operator
    // addresses SECURITY.md §7 refuses to hand out.
    const written = JSON.stringify(operatorLoginAttempt.create.mock.calls[0]?.[0])
    expect(written).not.toContain('target@example.com')
  })

  it('still works with no client IP, when the throttle simply cannot apply', async () => {
    operatorUser.findUnique.mockResolvedValue({
      id: 'op_1',
      venueId: 'venue_1',
      passwordHash: hashPassword(GOOD_PASSWORD),
    })
    operatorUser.update.mockResolvedValue({})

    const result = await signInWithPassword('owner@example.com', GOOD_PASSWORD, NOW, undefined)

    expect(result).toEqual({ ok: true, operatorId: 'op_1', venueId: 'venue_1' })
    expect(operatorLoginAttempt.count).not.toHaveBeenCalled()
  })
})
