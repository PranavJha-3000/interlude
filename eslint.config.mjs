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

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    name: 'interlude/pure-core',
    files: PURE_CORE,
    rules: {
      'no-restricted-syntax': ['error', ...NO_RANDOMNESS, ...NO_AMBIENT_CLOCK],
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
