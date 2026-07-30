import { defineConfig, devices } from '@playwright/test'

/**
 * One happy path on a real mobile viewport. The guest surface is only ever
 * used on a phone held one-handed, so testing it at desktop width would test
 * something no guest will see.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3200',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'npm run build && npx next start -p 3200',
    url: 'http://localhost:3200/floor',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // This is a production build with no `RESEND_API_KEY`, which `email.ts`
    // refuses by default so a real deployment cannot drop sign-in mail in
    // silence. The suite never reads a message — `fixtures.ts` writes the token
    // row directly — so it only needs the refusal waived, by name.
    env: { EMAIL_TRANSPORT: 'console' },
  },
})
