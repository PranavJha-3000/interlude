import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Playwright owns e2e/; vitest must not try to run it.
    exclude: ['node_modules/**', 'e2e/**', '.next/**'],
  },
})
