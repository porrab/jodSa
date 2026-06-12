import { describe, it, expect } from 'vitest'
import { createRateLimiter } from '@/lib/rate-limit'

describe('createRateLimiter', () => {
  it('allows up to the limit within the window', () => {
    const check = createRateLimiter(3, 60_000)
    expect(check('k', 0)).toBe(true)
    expect(check('k', 100)).toBe(true)
    expect(check('k', 200)).toBe(true)
    expect(check('k', 300)).toBe(false)
  })

  it('slides the window — old hits expire', () => {
    const check = createRateLimiter(2, 1_000)
    expect(check('k', 0)).toBe(true)
    expect(check('k', 500)).toBe(true)
    expect(check('k', 900)).toBe(false)
    // first hit (t=0) has aged out at t=1001
    expect(check('k', 1_001)).toBe(true)
  })

  it('tracks keys independently', () => {
    const check = createRateLimiter(1, 60_000)
    expect(check('ip1:tokenA', 0)).toBe(true)
    expect(check('ip2:tokenA', 0)).toBe(true)
    expect(check('ip1:tokenB', 0)).toBe(true)
    expect(check('ip1:tokenA', 1)).toBe(false)
  })
})
