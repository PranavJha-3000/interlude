import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildWriteReviewUrl } from './link'

/**
 * §7.2's structural guarantees, asserted rather than intended.
 */

describe('buildWriteReviewUrl', () => {
  it('carries the Place ID and nothing else', () => {
    const url = buildWriteReviewUrl('ChIJtest123')
    expect(url).toBe('https://search.google.com/local/writereview?placeid=ChIJtest123')
  })

  it('escapes an id it does not trust', () => {
    expect(buildWriteReviewUrl('a&b=c')).toContain('placeid=a%26b%3Dc')
  })
})

describe('the ReviewPrompt schema', () => {
  const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf-8')
  const model = /model ReviewPrompt \{[\s\S]*?\n\}/.exec(schema)?.[0] ?? ''

  it('exists and is the funnel', () => {
    expect(model).toContain('shownAt')
    expect(model).toContain('handedOffAt')
  })

  it('has no rating column, ever', () => {
    // Storing sentiment would create the ability to gate a public review on
    // it. The absence of the column is the enforcement.
    expect(model.toLowerCase()).not.toContain('rating')
    expect(model.toLowerCase()).not.toContain('sentiment')
    expect(model.toLowerCase()).not.toContain('stars')
  })

  it('never references awards or prizes', () => {
    expect(model).not.toContain('Award')
    expect(model).not.toContain('Prize')
  })
})

describe('the review screen source', () => {
  const dir = join(process.cwd(), 'src', 'app', '(guest)', 't', '[qrToken]', 'review')

  it('stores no draft text — the guest’s words never touch the database', () => {
    const action = readFileSync(join(dir, 'actions.ts'), 'utf-8')
    // The one write on the hand-off path touches timestamps only.
    expect(action).toContain('handedOffAt')
    expect(action).not.toMatch(/body\s*:/)
    expect(action).not.toMatch(/text\s*:/)
    expect(action).not.toMatch(/draft\s*:/)
  })
})
