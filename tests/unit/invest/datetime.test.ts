import { describe, expect, it } from 'vitest'
import { investDatetimeToISO } from '@/lib/invest/datetime'

describe('investment datetime normalization', () => {
  it('treats datetime-local input as Asia/Bangkok wall time', () => {
    const originalTZ = process.env.TZ
    process.env.TZ = 'UTC' // Vercel's server timezone; the old code depended on host TZ.
    try {
      expect(investDatetimeToISO('2026-10-07T20:30')).toBe('2026-10-07T13:30:00.000Z')
      expect(investDatetimeToISO('2026-09-08T20:30')).toBe('2026-09-08T13:30:00.000Z')
    } finally {
      process.env.TZ = originalTZ
    }
  })

  it('rejects values that are not datetime-local input', () => {
    expect(() => investDatetimeToISO('2026-10-07T20:30:00Z')).toThrow('Invalid investment datetime')
    expect(() => investDatetimeToISO('not-a-date')).toThrow('Invalid investment datetime')
  })
})
