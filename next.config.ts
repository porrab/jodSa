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

const nextConfig: NextConfig = {}

export default withNextIntl(withSerwist(nextConfig))
