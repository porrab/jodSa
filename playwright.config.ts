import { defineConfig, devices } from '@playwright/test'

const e2ePort = process.env.JODSA_E2E_PORT ?? '3000'
const e2eBaseUrl = `http://localhost:${e2ePort}`

/**
 * E2E config — owned by qa-lab (see REVIEW-INBOX.md handshake).
 * Runs against `pnpm dev` + the live Supabase test project.
 * Slip-import specs include on-device OCR (tesseract.js), hence the long timeouts.
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
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
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
