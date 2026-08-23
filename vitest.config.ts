import { resolve } from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // `server-only` throws on import unless the resolver picks its
    // `react-server` condition, which Next does and vitest does not. The stub
    // is the same substitution Next makes, so a server module can be unit
    // tested without weakening the marker in the build that ships.
    alias: { 'server-only': resolve(__dirname, 'src/lib/test/server-only.stub.ts') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Playwright owns e2e/; vitest must not try to run it.
    exclude: ['node_modules/**', 'e2e/**', '.next/**'],
  },
})
