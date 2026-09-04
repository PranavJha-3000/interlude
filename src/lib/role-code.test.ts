import { describe, expect, it } from 'vitest'

import { hashPin } from '@/lib/pin'
import { matchRoleCode } from '@/lib/role-code'

const ADMIN = '1234'
const STAFF = '5678'

describe('matchRoleCode', () => {
  it('returns ADMIN when no admin code is configured (fallback)', () => {
    expect(matchRoleCode('anything', { adminPinHash: null, staffPinHash: null })).toBe('ADMIN')
  })

  it('matches an admin code when only the admin code is set', () => {
    expect(matchRoleCode(ADMIN, { adminPinHash: hashPin(ADMIN), staffPinHash: null })).toBe('ADMIN')
  })

  it('matches a staff code when only the staff code is set', () => {
    expect(matchRoleCode(STAFF, { adminPinHash: null, staffPinHash: hashPin(STAFF) })).toBe('STAFF')
  })

  it('matches the admin code even when a staff code is also set', () => {
    expect(
      matchRoleCode(ADMIN, { adminPinHash: hashPin(ADMIN), staffPinHash: hashPin(STAFF) })
    ).toBe('ADMIN')
  })

  it('matches the staff code even when an admin code is also set', () => {
    expect(
      matchRoleCode(STAFF, { adminPinHash: hashPin(ADMIN), staffPinHash: hashPin(STAFF) })
    ).toBe('STAFF')
  })

  it('never lets the staff code fall through to admin', () => {
    // The staff code must open the floor, not the dashboard, even though a
    // staff-code entry with no admin code set would otherwise be the fallback.
    expect(
      matchRoleCode(STAFF, { adminPinHash: null, staffPinHash: hashPin(STAFF) })
    ).toBe('STAFF')
  })

  it('returns null for a wrong code when both codes are set', () => {
    expect(
      matchRoleCode('0000', { adminPinHash: hashPin(ADMIN), staffPinHash: hashPin(STAFF) })
    ).toBeNull()
  })

  it('returns null for a wrong code when only the admin code is set', () => {
    expect(matchRoleCode('0000', { adminPinHash: hashPin(ADMIN), staffPinHash: null })).toBeNull()
  })

  it('returns null for empty or whitespace input', () => {
    expect(matchRoleCode('', { adminPinHash: null, staffPinHash: null })).toBeNull()
    expect(matchRoleCode('   ', { adminPinHash: hashPin(ADMIN), staffPinHash: hashPin(STAFF) })).toBeNull()
  })
})