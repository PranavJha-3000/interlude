import { afterEach, describe, expect, it } from 'vitest'

import { publicBaseUrl } from '@/lib/base-url'

/**
 * The one guarantee this module exists for: a misconfigured deployment complains
 * loudly at the point of use, never silently. And the guard that previously knew
 * a real operator's domain would break it — `myinterlude.vercel.app` was refused
 * as if it had a "preview" shape. These tests pin down which shapes are allowed
 * and which are refused: the plain `<project>.vercel.app` production alias must
 * print tents, an ephemeral preview or per-deployment URL must not.
 */

const ORIGINAL = process.env.APP_BASE_URL

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.APP_BASE_URL
  else process.env.APP_BASE_URL = ORIGINAL
})

describe('publicBaseUrl', () => {
  it('throws loudly when APP_BASE_URL is missing', () => {
    delete process.env.APP_BASE_URL
    expect(() => publicBaseUrl()).toThrow(/APP_BASE_URL is not set/)
  })

  it('accepts a custom domain', () => {
    process.env.APP_BASE_URL = 'https://app.interlude.fit'
    expect(publicBaseUrl()).toBe('https://app.interlude.fit')
  })

  it('accepts the canonical Vercel project domain (the production alias)', () => {
    // This is the regression this file exists for: a real production deployment
    // on a `*.vercel.app` domain was refused, turning every tent into a 500.
    process.env.APP_BASE_URL = 'https://myinterlude.vercel.app'
    expect(publicBaseUrl()).toBe('https://myinterlude.vercel.app')
  })

  it('accepts a canonical Vercel domain with a dashed project name', () => {
    process.env.APP_BASE_URL = 'https://my-interlude.vercel.app'
    expect(publicBaseUrl()).toBe('https://my-interlude.vercel.app')
  })

  it('refuses a git-branch preview URL', () => {
    process.env.APP_BASE_URL = 'https://myinterlude-git-fix-labels-4f83c9a1b2d3e4f5.vercel.app'
    expect(() => publicBaseUrl()).toThrow(/preview or per-deployment/)
  })

  it('refuses a per-deployment URL (16-hex-hash)', () => {
    process.env.APP_BASE_URL = 'https://myinterlude-4f83c9a1b2d3e4f5.vercel.app'
    expect(() => publicBaseUrl()).toThrow(/preview or per-deployment/)
  })

  it('refuses the username-suffixed shared preview form', () => {
    process.env.APP_BASE_URL = 'https://myinterlude-4f83c9a1b2d3e4f5-pranavjha.vercel.app'
    expect(() => publicBaseUrl()).toThrow(/preview or per-deployment/)
  })

  it('strips a trailing slash', () => {
    process.env.APP_BASE_URL = 'https://myinterlude.vercel.app/'
    expect(publicBaseUrl()).toBe('https://myinterlude.vercel.app')
  })
})