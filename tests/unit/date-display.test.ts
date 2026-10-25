import { afterEach, describe, expect, it, vi } from 'vitest'

import { formatAppDayHeading } from '@/lib/date-display'

describe('formatAppDayHeading', () => {
  afterEach(() => vi.useRealTimers())

  it('omits the Buddhist year for a date in the current Bangkok year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-25T00:00:00.000Z'))

    const heading = formatAppDayHeading('2026-10-24T12:00:00+07:00', 'th')

    expect(heading).toBe('ส. 24 ต.ค.')
    expect(heading).not.toContain('2569')
  })
})
