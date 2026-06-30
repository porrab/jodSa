import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import withSerwistInit from '@serwist/next'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  // SW + turbopack dev don't mix; the share-target flow is verified on a prod build
  disable: process.env.NODE_ENV === 'development',
})

const nextConfig: NextConfig = {
  experimental: {
    // Next 15 defaults the client router cache for dynamic pages to 0s, so every
    // revisit re-runs the server render + Supabase round-trip — what made nav feel
    // slow. A short cache makes bouncing between already-visited pages instant.
    // Writes stay fresh: every mutation action calls revalidatePath, which clears
    // the affected route from this cache immediately.
    staleTimes: { dynamic: 30, static: 180 },
  },
}

export default withNextIntl(withSerwist(nextConfig))
