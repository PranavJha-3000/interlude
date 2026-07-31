import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

/**
 * The `core/` rules below are compliance enforcement, not style.
 * PLATFORM.md §7: "No pure chance" is a gambling-law line, and `core/` being
 * pure is what makes the invariants testable. Both are enforced here so they
 * fail CI rather than relying on anyone's discipline.
 */
const PURE_CORE = ['src/core/prize-engine/**/*.ts', 'src/core/mechanics/**/*.ts']

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
              ],
              message:
                'core/prize-engine and core/mechanics take everything as arguments — no I/O, no database, no framework (PLATFORM.md §5).',
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
                '@/core/prize-engine',
                '@/core/prize-engine/*',
                '@/core/game',
                '@/core/game/*',
                '@/core/mechanics',
                '@/core/mechanics/*',
                '@/generated/prisma',
                '@prisma/*',
                '@/lib/db',
                '@/lib/db*',
                'next',
                'next/*',
              ],
              message:
                'The review module is given no prize, award, life or game state (§7.2). It cannot gate on what it cannot read, and that is the enforcement — not a convention. Incentivised or sentiment-gated reviews put the restaurant’s Business Profile at risk, so the harm lands on the customer.',
            },
          ],
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
