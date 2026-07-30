import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  OPERATOR_SESSION_TTL_MS,
  decodeOperatorSession,
  encodeOperatorSession,
} from './operator-session-token'

const SECRET = 'placeholder-value-for-tests-only'
const T0 = 1_800_000_000_000

function signWith(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

describe('operator session cookie', () => {
  it('verifies a fresh session', () => {
    const raw = encodeOperatorSession({ operatorId: 'op_1', venueId: 'v_1' }, SECRET, T0)
    expect(decodeOperatorSession(raw, SECRET, T0 + 60_000)).toEqual({
      operatorId: 'op_1',
      venueId: 'v_1',
    })
  })

  it('carries a venue-less session, which is a legitimate state', () => {
    const raw = encodeOperatorSession({ operatorId: 'op_1', venueId: null }, SECRET, T0)
    expect(decodeOperatorSession(raw, SECRET, T0)).toEqual({ operatorId: 'op_1', venueId: null })
  })

  it('still verifies one second inside the window', () => {
    const raw = encodeOperatorSession({ operatorId: 'op_1', venueId: 'v_1' }, SECRET, T0)
    expect(decodeOperatorSession(raw, SECRET, T0 + OPERATOR_SESSION_TTL_MS - 1000)).not.toBeNull()
  })

  it('rejects an expired session even though the signature is good', () => {
    const raw = encodeOperatorSession({ operatorId: 'op_1', venueId: 'v_1' }, SECRET, T0)
    expect(decodeOperatorSession(raw, SECRET, T0 + OPERATOR_SESSION_TTL_MS + 1)).toBeNull()
  })

  it('rejects a tampered payload', () => {
    const raw = encodeOperatorSession({ operatorId: 'op_1', venueId: 'v_1' }, SECRET, T0)
    const signature = raw.slice(raw.lastIndexOf('.') + 1)
    const forged = Buffer.from(
      JSON.stringify({ operatorId: 'op_2', venueId: 'v_2', iat: T0 })
    ).toString('base64url')

    expect(decodeOperatorSession(`${forged}.${signature}`, SECRET, T0)).toBeNull()
  })

  it('rejects a session signed with a different secret', () => {
    const raw = encodeOperatorSession(
      { operatorId: 'op_1', venueId: 'v_1' },
      'placeholder-a-different-value',
      T0
    )
    expect(decodeOperatorSession(raw, SECRET, T0)).toBeNull()
  })

  it('rejects a correctly-signed payload with no issued-at', () => {
    const payload = Buffer.from(JSON.stringify({ operatorId: 'op_1', venueId: 'v_1' })).toString(
      'base64url'
    )
    expect(decodeOperatorSession(`${payload}.${signWith(payload, SECRET)}`, SECRET, T0)).toBeNull()
  })

  it('rejects garbage', () => {
    expect(decodeOperatorSession('', SECRET, T0)).toBeNull()
    expect(decodeOperatorSession('nodot', SECRET, T0)).toBeNull()
    expect(decodeOperatorSession('.sig', SECRET, T0)).toBeNull()
  })
})
