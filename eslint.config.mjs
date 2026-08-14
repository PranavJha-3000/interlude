import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

/**
 * The `core/` rules below are compliance enforcement, not style.
 * PLATFORM.md §7: "No pure chance" is a gambling-law line, and `core/` being
 * pure is what makes the invariants testable. Both are enforced here so they
 * fail CI rather than relying on anyone's discipline.
 */
const PURE_CORE = [
  'src/core/prize-engine/**/*.ts',
  'src/core/mechanics/**/*.ts',
  // The game's pairing and ladder live here, and pairing.ts already claimed
  // this ban applied to it. It did not — the glob below is what makes the
  // claim true, and the deterministic seeded deal is what it protects.
  'src/core/game/**/*.ts',
]

const NO_RANDOMNESS = [
  {
    selector: "MemberExpression[object.name='Math'][property.name='random']",
    message:
      'No pure chance in the prize engine or mechanics (PLATFORM.md §7). Outcomes must be a pure function of the skill input. This is a gambling-law line.',
  },
  {
    selector: "MemberExpression[property.name='getRandomValues']",
    message:
      'No pure chance in the prize engine or mechanics (PLATFORM.md §7). Outcomes must be a pure function of the skill input. This is a gambling-law line.',
  },
  {
    selector: "MemberExpression[object.name='crypto'][property.name='randomUUID']",
    message: 'No randomness inside core/. Pass any id in as an argument.',
  },
]

const NO_AMBIENT_CLOCK = [
  {
    selector: "MemberExpression[object.name='Date'][property.name='now']",
    message:
      'No clock inside core/ (PLATFORM.md §5). Take the time as an argument so the function stays deterministic and testable.',
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message:
      'No clock inside core/ (PLATFORM.md §5). Take the time as an argument so the function stays deterministic and testable.',
  },
]

/**
 * `NEXT_PUBLIC_` is not a namespace — it is an instruction to inline the value
 * into the JavaScript bundle every guest downloads. A secret behind that prefix
 * is a published secret, so naming one is an error rather than a warning.
 */
const NO_PUBLIC_SECRETS = [
  {
    selector:
      "MemberExpression[object.property.name='env'] > Identifier[name=/^NEXT_PUBLIC_.*(KEY|SECRET|TOKEN|PASSWORD|SALT|CREDENTIAL|DATABASE)/i]",
    message:
      'NEXT_PUBLIC_ inlines this into the client bundle — it would ship the secret to every guest phone. Drop the prefix and read it in a server component or route handler.',
  },
  {
    selector:
      "MemberExpression[object.property.name='env'][property.value=/^NEXT_PUBLIC_.*(KEY|SECRET|TOKEN|PASSWORD|SALT|CREDENTIAL|DATABASE)/i]",
    message:
      'NEXT_PUBLIC_ inlines this into the client bundle — it would ship the secret to every guest phone. Drop the prefix and read it in a server component or route handler.',
  },
]

/**
 * Everything the review module and the review screen are forbidden to see.
 *
 * One list rather than four copies, because the copies drifted: the screen block
 * already banned `@/lib/table-run` and `@/lib/prize-config` and the module block
 * did not.
 *
 * V1.5 adds loyalty, first-party feedback and per-venue identity. Each is a new
 * thing to know about a guest, and therefore a new way to gate a Google review
 * on one — a returning guest, a low private rating, a table that just won a free
 * dessert. **The list has to grow with the product or the boundary quietly stops
 * covering it.**
 */
const REVIEW_FORBIDDEN_IMPORTS = [
  '@/core/prize-engine',
  '@/core/prize-engine/*',
  '@/core/game',
  '@/core/game/*',
  '@/core/mechanics',
  '@/core/mechanics/*',
  '@/lib/table-run',
  '@/lib/prize-config',
  // V1.5 — loyalty, identity and first-party feedback.
  '@/lib/prize-award',
  '@/lib/loyalty',
  '@/lib/phone-identity',
  '@/lib/feedback',
]

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    name: 'interlude/no-public-secrets',
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...NO_PUBLIC_SECRETS],
    },
  },

  {
    name: 'interlude/pure-core',
    files: PURE_CORE,
    rules: {
      // Flat config replaces a rule's options rather than merging them, so the
      // public-secret selectors have to be repeated here or they would be
      // silently dropped for exactly the files we care most about.
      'no-restricted-syntax': [
        'error',
        ...NO_PUBLIC_SECRETS,
        ...NO_RANDOMNESS,
        ...NO_AMBIENT_CLOCK,
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/generated/prisma',
                '@prisma/*',
                'next',
                'next/*',
                'fs',
                'node:*',
                '@/lib/db',
                '@/lib/db*',
                '@/lib/ai',
                '@/lib/ai/*',
                '@anthropic-ai/*',
              ],
              message:
                'core/prize-engine and core/mechanics take everything as arguments — no I/O, no database, no framework, no AI (PLATFORM.md §5, §6a). An LLM is nondeterministic, and a model call here would break the no-pure-chance proof that keeps the product legal.',
            },
          ],
        },
      ],
    },
  },

  /**
   * The review module's isolation (§7.2), as a boundary rather than as
   * discipline.
   *
   * The rule the product cannot bend is that a Google review is never
   * incentivised, gated, or filtered on sentiment. Enforcing that by review
   * means someone eventually imports award state "just to log it". Enforcing it
   * here means they cannot: the module is not permitted to see prize, award,
   * life or game state, so it cannot gate on any of them.
   *
   * Violating this requires deleting this block, which is a much louder thing
   * to do in a diff than adding an import.
   */
  {
    name: 'interlude/review-isolation',
    files: ['src/core/review/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                ...REVIEW_FORBIDDEN_IMPORTS,
                '@/generated/prisma',
                '@prisma/*',
                '@/lib/db',
                '@/lib/db*',
                'next',
                'next/*',
                '@/lib/ai',
                '@/lib/ai/*',
                '@anthropic-ai/*',
              ],
              message:
                'The review module is given no prize, award, life, loyalty or identity state (§7.2). It cannot gate on what it cannot read, and that is the enforcement — not a convention. Incentivised or sentiment-gated reviews put the restaurant’s Business Profile at risk, so the harm lands on the customer.',
            },
          ],
        },
      ],
    },
  },

  /**
   * The review *screen* gets the same isolation as the review module, minus
   * the database ban — it writes funnel rows, which is its job. What it may
   * never do is read a win, a prize, a rung or a mechanic, because a screen
   * that can read them can be taught to branch on them (§7.2).
   *
   * ⚠️ **The path segment is `*`, not `[qrToken]`, and that is load-bearing.**
   * This glob read `src/app/(guest)/t/[qrToken]/review/**` until V1.5, and it
   * had never matched a single file: square brackets are a character class, so
   * `[qrToken]` matches one character from {q,r,T,o,k,e,n} rather than the
   * literal directory a Next.js dynamic route is named. The block existed, the
   * message said "enforced here, not by discipline", and nothing was enforced.
   * `boundary.test.ts` now lints a probe through the ESLint API so this cannot
   * silently come back.
   */
  {
    name: 'interlude/review-screen-isolation',
    files: ['src/app/(guest)/t/*/review/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: REVIEW_FORBIDDEN_IMPORTS,
              message:
                'The review screen is given no prize, award, life, loyalty or identity state (§7.2). It renders identically for a table that never played, lost, or won — enforced here, not by discipline.',
            },
          ],
        },
      ],
    },
  },

  /**
   * The review funnel writer.
   *
   * `shownAt` is written by the guest page and `openedAt` by the review screen,
   * so a second module now writes review rows. It gets the same blindness: a
   * helper that can read a win can be given an `if (won)` around the write, and
   * from then on the funnel silently measures winners instead of tables.
   */
  {
    name: 'interlude/review-funnel-isolation',
    files: ['src/lib/review-funnel.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: REVIEW_FORBIDDEN_IMPORTS,
              message:
                'The review funnel writer is given no prize, award, life, loyalty or identity state (§7.2). It records that a prompt was shown and opened, for every table — and it must not be able to record it for only some.',
            },
          ],
        },
      ],
    },
  },

  /**
   * The boundary runs both ways.
   *
   * Private feedback may carry a rating and may grant a life. The Google prompt
   * may do neither, and `core/review/prompt.ts` says so explicitly: they must
   * not share a surface. If the feedback screen could read the review funnel,
   * "they already rated us 2, skip the Google prompt" is one `if` away — which
   * is sentiment gating arriving through the back door.
   */
  {
    name: 'interlude/feedback-screen-isolation',
    files: [
      'src/app/(guest)/t/*/feedback/**/*.{ts,tsx}',
      'src/app/(guest)/t/*/phone/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/core/review', '@/core/review/*', '@/lib/review-funnel'],
              message:
                'First-party feedback and phone capture must not read, or share a surface with, the Google review prompt (§7.2). They are separate routes on purpose, and neither may branch on the other.',
            },
          ],
        },
      ],
      // Flat config replaces a rule's options rather than merging them, so
      // NO_PUBLIC_SECRETS is re-spread here or it would be silently dropped for
      // the two routes that actually handle a phone number.
      'no-restricted-syntax': [
        'error',
        ...NO_PUBLIC_SECRETS,
        {
          selector: "MemberExpression[object.name='console']",
          message:
            'Never log on the phone-capture path. A raw number in a serverless function log is the raw number stored — and a log is the one place erasure cannot reach (SECURITY.md §6).',
        },
      ],
    },
  },

  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'src/generated/**',
    'playwright-report/**',
    'test-results/**',
  ]),
])

export default eslintConfig
