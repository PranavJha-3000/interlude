/**
 * Stands in for the `server-only` marker package under vitest.
 *
 * That package resolves to a module whose only job is to throw, unless the
 * resolver selects its `react-server` condition. Next selects it; vitest does
 * not, so importing any server module into a unit test dies at the first line.
 * Aliasing it here is the same substitution Next makes — the marker still does
 * its real work in the build that ships, and it is `vitest.config.ts` alone
 * that opts out.
 */
export {}
