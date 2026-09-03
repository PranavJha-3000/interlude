import { describe, expect, it } from 'vitest'
import { isAuthError } from './gemini'

/**
 * The bad-key case that motivated the helper: Google returns HTTP 400 with
 * `API_KEY_INVALID` in the body, not 401/403. Without the check the failure
 * lands in the generic GEMINI_ERROR bucket and the menu upload screen tells
 * the operator to "try a clearer photo" for a file that was never the problem.
 */
const INVALID_KEY_BODY =
  '{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT","details":[{"@type":"type.googleapis.com/google.rpc.ErrorInfo","reason":"API_KEY_INVALID"}]}}'

describe('isAuthError', () => {
  it('recognises the HTTP 400 API_KEY_INVALID body as an auth failure', () => {
    expect(isAuthError({ status: 400, message: INVALID_KEY_BODY })).toBe(true)
  })

  it('recognises the classic 401/403 auth failures', () => {
    expect(isAuthError({ status: 401, message: '' })).toBe(true)
    expect(isAuthError({ status: 403, message: '' })).toBe(true)
  })

  it('leaves genuine 400s and other statuses alone', () => {
    expect(isAuthError({ status: 400, message: 'Invalid JSON payload received.' })).toBe(false)
    expect(isAuthError({ status: 429, message: 'Resource exhausted.' })).toBe(false)
    expect(isAuthError({ status: 500, message: 'Internal error.' })).toBe(false)
    expect(isAuthError({ status: 0, message: undefined })).toBe(false)
  })
})
