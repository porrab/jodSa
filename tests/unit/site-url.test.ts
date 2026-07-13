import { describe, it, expect, afterEach } from 'vitest'
import { getSiteURL } from '@/lib/site-url'

const KEYS = ['NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_VERCEL_URL'] as const

describe('getSiteURL', () => {
  const saved: Record<string, string | undefined> = {}
  for (const k of KEYS) saved[k] = process.env[k]

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('prefers NEXT_PUBLIC_SITE_URL and strips a trailing slash', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://jodsa.app/'
    process.env.NEXT_PUBLIC_VERCEL_URL = 'jodsa-preview.vercel.app'
    expect(getSiteURL()).toBe('https://jodsa.app')
  })

  it('adds https:// to a bare host', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'jodsa.app'
    delete process.env.NEXT_PUBLIC_VERCEL_URL
    expect(getSiteURL()).toBe('https://jodsa.app')
  })

  it('falls back to the Vercel deployment URL when SITE_URL is unset', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    process.env.NEXT_PUBLIC_VERCEL_URL = 'jodsa-abc123.vercel.app'
    expect(getSiteURL()).toBe('https://jodsa-abc123.vercel.app')
  })

  it('treats an empty SITE_URL as unset (never emits a protocol-only origin)', () => {
    process.env.NEXT_PUBLIC_SITE_URL = ''
    delete process.env.NEXT_PUBLIC_VERCEL_URL
    expect(getSiteURL()).toBe('http://localhost:3000')
  })

  it('falls back to localhost when nothing is configured', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    delete process.env.NEXT_PUBLIC_VERCEL_URL
    expect(getSiteURL()).toBe('http://localhost:3000')
  })

  it('builds the signup email callback against the resolved origin', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://jodsa.app'
    expect(`${getSiteURL()}/auth/callback`).toBe('https://jodsa.app/auth/callback')
  })
})
