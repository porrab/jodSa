import { defineConfig, devices } from '@playwright/test'

const e2ePort = process.env.JODSA_E2E_PORT ?? '3000'
const e2eBaseUrl = `http://localhost:${e2ePort}`

/**
 * Read-only visual harness for checks that must not provision users or mutate the
 * configured Supabase project. Authentication must already exist in storageState;
 * an expired session fails instead of running global.setup.ts.
 */
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './tests/e2e/.results',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: e2eBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /global\.setup\.ts/,
    },
  ],
  webServer: {
    command: `pnpm dev --port ${e2ePort}`,
    url: `${e2eBaseUrl}/login`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
