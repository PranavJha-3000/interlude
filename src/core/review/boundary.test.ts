import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ESLint } from 'eslint'
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

/**
 * The boundaries are live, not merely present.
 *
 * This exists because of a real and quiet failure. `interlude/review-screen-isolation`
 * was written with `files: ['src/app/(guest)/t/[qrToken]/review/**']`, and it had
 * never matched a single file — square brackets are a glob character class, so
 * `[qrToken]` matches one character from {q,r,T,o,k,e,n}, never the literal
 * directory name Next.js gives a dynamic route. The block was present, its
 * message read "enforced here, not by discipline", and nothing was enforced.
 *
 * Asserting the config's *shape* would not have caught it; only asking ESLint
 * what it actually does to a file at that path does. So these lint a probe
 * through the ESLint API rather than reading the config.
 */
describe('the review boundaries actually fire', () => {
  async function messagesFor(filePath: string, source: string): Promise<string[]> {
    const eslint = new ESLint({ cwd: process.cwd() })
    const [result] = await eslint.lintText(source, { filePath })
    return (result?.messages ?? []).map((m) => m.message)
  }

  it('stops the review screen importing game state', async () => {
    const messages = await messagesFor(
      join(process.cwd(), 'src', 'app', '(guest)', 't', '[qrToken]', 'review', '__probe.ts'),
      `import { runStateOf } from '@/lib/table-run'\nexport const probe = runStateOf\n`
    )
    expect(messages.join('\n')).toMatch(/review screen is given no prize/i)
  }, 30_000)

  it('stops the review screen importing loyalty or identity state', async () => {
    const messages = await messagesFor(
      join(process.cwd(), 'src', 'app', '(guest)', 't', '[qrToken]', 'review', '__probe.ts'),
      `import { recordStamp } from '@/lib/loyalty'\nexport const probe = recordStamp\n`
    )
    expect(messages.join('\n')).toMatch(/review screen is given no prize/i)
  }, 30_000)

  it('stops the phone route reading the Google prompt, and stops it logging', async () => {
    const messages = await messagesFor(
      join(process.cwd(), 'src', 'app', '(guest)', 't', '[qrToken]', 'phone', '__probe.ts'),
      `import { buildWriteReviewUrl } from '@/core/review/link'\n` +
        `export const probe = () => { console.log('x'); return buildWriteReviewUrl('a') }\n`
    )
    const all = messages.join('\n')
    expect(all, 'the two routes must not share a surface').toMatch(/must not read, or share/i)
    // A raw number in a serverless log is the one place erasure cannot reach.
    expect(all, 'the phone path must not log').toMatch(/Never log on the phone-capture path/i)
  }, 30_000)

  it('stops the review module reaching the database at all', async () => {
    const messages = await messagesFor(
      join(process.cwd(), 'src', 'core', 'review', '__probe.ts'),
      `import { db } from '@/lib/db'\nexport const probe = db\n`
    )
    expect(messages.join('\n')).toMatch(/review module is given no prize/i)
  }, 30_000)
})

/**
 * The loyalty ledger, held to the same standard.
 *
 * `GuestVisit` is the one table that knows a guest came back, so it is the one
 * most likely to acquire a phone number "just for support" or a rating "just to
 * see". Neither belongs there: the number exists only as an HMAC on
 * `GuestIdentity`, and sentiment lives in `VenueFeedback`.
 */
describe('the GuestVisit schema', () => {
  const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf-8')
  const model = /model GuestVisit \{[\s\S]*?\n\}/.exec(schema)?.[0] ?? ''

  it('exists and is a ledger of stamps', () => {
    expect(model).toContain('visitNumber')
    expect(model).toContain('recordedAt')
  })

  it('holds no phone number in any form', () => {
    // Strip the doc comments first — they legitimately discuss phone numbers.
    const code = model
      .split('\n')
      .filter((line) => !line.trim().startsWith('///'))
      .join('\n')
      .toLowerCase()

    expect(code).not.toContain('phone')
    expect(code).not.toContain('msisdn')
    expect(code).not.toContain('mobile')
  })

  it('holds no rating, because sentiment lives in VenueFeedback', () => {
    expect(model.toLowerCase()).not.toContain('rating')
    expect(model.toLowerCase()).not.toContain('sentiment')
  })

  it('is idempotent per service, so one night is one stamp', () => {
    // The database is the guard. A select-then-update check would be a race
    // under polling, and this is the row a free dessert is derived from.
    expect(model).toContain('@@unique([guestIdentityId, serviceId])')
  })
})

describe('the GuestIdentity schema', () => {
  const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf-8')
  const model = /model GuestIdentity \{[\s\S]*?\n\}/.exec(schema)?.[0] ?? ''

  it('stores the phone only as a per-venue HMAC', () => {
    expect(model).toContain('phoneHmac')
    // A raw column would make a cross-venue join possible, which is the thing
    // SECURITY.md §6 claims is impossible by construction.
    expect(model).not.toMatch(/^\s+phone\s+String/m)
  })

  it('is scoped to one venue, so the same number is two identities at two venues', () => {
    expect(model).toContain('@@unique([venueId, phoneHmac])')
  })
})
