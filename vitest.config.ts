import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    // e2e specs are Playwright-only — vitest must not collect them
    include: ['tests/unit/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      // Next's bundler resolves this bare specifier internally at build time; it
      // isn't an installed package, so tests that import a `server-only` module
      // (e.g. lib/recurrence/materialize.ts) need an explicit stub to resolve it.
      'server-only': resolve(__dirname, 'tests/unit/__stubs__/server-only.ts'),
    },
  },
})
