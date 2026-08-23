import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { generateMysteryProfile, type MysteryCustomerConfig } from './games/mystery-customer'

/**
 * Repetition-stability lives here too because it is the observable form of
 * "no chance": two deals of the same seed must agree exactly.
 */

/**
 * The compliance invariants, enforced where talk is cheap and code is not:
 * `core/` never rolls dice, and the games never read a clock. Everything a
 * guest experiences as chance is actually a hash of server-known inputs —
 * which is why the same table, the same night, always meets the same game.
 */

const CORE_ROOT = fileURLToPath(new URL('.', import.meta.url))

// Banned everywhere in core, tests included in spirit but excluded here so
// this file can name its own suspects without arresting itself.
const NEVER_ANYWHERE = [/Math\s*\.\s*random/, /getRandomValues/, /randomUUID/] as const

// Clock reads are banned in the games specifically: a deal or a score that
// shifts at midnight is a bug wearing a timezone.
const NEVER_IN_GAMES = [/\bDate\s*\.\s*now\b/, /\bnew\s+Date\b/] as const

/**
 * Comments are prose, not code — `pairing.ts` documents *why* it never calls
 * `Math.random`, and arresting the mention would make the invariant harder,
 * not easier, to read. Line-comment stripping leaves URLs (`https://…`)
 * untouched by refusing a match right after a colon.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(full, out)
    else if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push(full)
  }
  return out
}

const sources = collectFiles(CORE_ROOT).filter((f) => !/\.test\.ts$/.test(f))
const gameSources = sources.filter((f) => f.replaceAll('\\', '/').includes('/games/'))

describe('core purity', () => {
  it('core/ contains no source of chance', () => {
    expect(sources.length).toBeGreaterThan(0)
    for (const file of sources) {
      const content = stripComments(readFileSync(file, 'utf8'))
      for (const pattern of NEVER_ANYWHERE) {
        expect(content, `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('games never read the clock', () => {
    expect(gameSources.length).toBeGreaterThan(0)
    for (const file of gameSources) {
      const content = stripComments(readFileSync(file, 'utf8'))
      for (const pattern of NEVER_IN_GAMES) {
        expect(content, `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('dealing twice from one seed yields one customer', () => {
    const config: MysteryCustomerConfig = {
      options: [
        { id: 'b1', kind: 'BUDGET', label: '₹300', budgetPaise: 30_000 },
        { id: 'c1', kind: 'CRAVING', label: 'Craves spice', value: 'spicy' },
      ],
      courses: [{ slot: 'main', label: 'Main', categories: ['mains'] }],
    }
    for (const seed of ['run-a', 'run-b', 'run-c']) {
      expect(generateMysteryProfile(config, seed)).toEqual(generateMysteryProfile(config, seed))
    }
  })
})
