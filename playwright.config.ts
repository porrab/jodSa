import { defineConfig, devices } from '@playwright/test'

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
    baseURL: 'http://localhost:3000',
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
    command: 'pnpm dev',
    url: 'http://localhost:3000/login',
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
