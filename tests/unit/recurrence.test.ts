import { describe, it, expect } from 'vitest'
import { generateOccurrenceDates, type RecurrenceRule } from '@/lib/recurrence/recurrence'
import { needsMaterialization } from '@/lib/recurrence/range'

const weekly = (over: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  freq: 'weekly',
  interval: 1,
  startDate: '2026-01-01',
  ...over,
})

describe('weekly + byWeekday', () => {
  // 2026-06 starts on Monday. byWeekday [2,3,4,6] = Tue, Wed, Thu, Sat.
  it('emits only the chosen weekdays across a month', () => {
    const dates = generateOccurrenceDates(
      weekly({ byWeekday: [2, 3, 4, 6], startDate: '2026-06-01' }),
      '2026-06-01',
      '2026-06-30',
    )
    // every emitted date must be Tue/Wed/Thu/Sat, never Mon/Fri/Sun
    for (const d of dates) {
      const wd = new Date(`${d}T00:00:00Z`).getUTCDay() // 0=Sun..6=Sat
      expect([2, 3, 6]).not.toContain(wd === 0 ? 7 : wd === 1 ? 1 : wd === 5 ? 5 : -1)
    }
    // first week: Jun 2(Tue),3(Wed),4(Thu),6(Sat)
    expect(dates.slice(0, 4)).toEqual(['2026-06-02', '2026-06-03', '2026-06-04', '2026-06-06'])
    // no Mondays, Fridays, or Sundays
    expect(dates).not.toContain('2026-06-01') // Mon
    expect(dates).not.toContain('2026-06-05') // Fri
    expect(dates).not.toContain('2026-06-07') // Sun
  })

  it('keeps correct weekdays across a Dec→Jan year boundary', () => {
    const dates = generateOccurrenceDates(
      weekly({ byWeekday: [2, 4, 6], startDate: '2026-12-01' }),
      '2026-12-28',
      '2027-01-04',
    )
    // Dec 29(Tue), 31(Thu), Jan 2(Sat)... verify membership only
    expect(dates).toContain('2026-12-29') // Tue
    expect(dates).toContain('2026-12-31') // Thu
    expect(dates).toContain('2027-01-02') // Sat
    expect(dates).not.toContain('2026-12-28') // Mon
    expect(dates).not.toContain('2027-01-01') // Fri
  })

  it('respects interval (every 2 weeks)', () => {
    const dates = generateOccurrenceDates(
      weekly({ interval: 2, byWeekday: [1], startDate: '2026-06-01' }), // Mondays, biweekly
      '2026-06-01',
      '2026-06-30',
    )
    expect(dates).toEqual(['2026-06-01', '2026-06-15', '2026-06-29'])
  })

  it('defaults to the start weekday when byWeekday is absent', () => {
    const dates = generateOccurrenceDates(
      weekly({ startDate: '2026-06-03' }), // Wednesday
      '2026-06-01',
      '2026-06-30',
    )
    expect(dates).toEqual(['2026-06-03', '2026-06-10', '2026-06-17', '2026-06-24'])
  })
})

describe('monthly', () => {
  it('skips short months for a day-31 rule', () => {
    const dates = generateOccurrenceDates(
      { freq: 'monthly', interval: 1, startDate: '2026-01-31' },
      '2026-01-01',
      '2026-12-31',
    )
    // present: Jan, Mar, May, Jul, Aug, Oct, Dec — absent: Feb, Apr, Jun, Sep, Nov
    expect(dates).toContain('2026-01-31')
    expect(dates).toContain('2026-03-31')
    expect(dates).not.toContain('2026-02-28')
    expect(dates).not.toContain('2026-04-30')
    expect(dates).not.toContain('2026-06-30')
    expect(dates).not.toContain('2026-09-30')
    expect(dates).not.toContain('2026-11-30')
    expect(dates).toEqual([
      '2026-01-31', '2026-03-31', '2026-05-31',
      '2026-07-31', '2026-08-31', '2026-10-31', '2026-12-31',
    ])
  })

  it('emits quarterly with interval 3', () => {
    const dates = generateOccurrenceDates(
      { freq: 'monthly', interval: 3, startDate: '2026-01-15' },
      '2026-01-01',
      '2026-12-31',
    )
    expect(dates).toEqual(['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15'])
  })
})

describe('yearly', () => {
  it('emits Feb-29 only in leap years', () => {
    const dates = generateOccurrenceDates(
      { freq: 'yearly', interval: 1, startDate: '2024-02-29' },
      '2024-01-01',
      '2032-12-31',
    )
    // leap years in range: 2024, 2028, 2032
    expect(dates).toEqual(['2024-02-29', '2028-02-29', '2032-02-29'])
  })
})

describe('clamping + exceptions', () => {
  it('clamps to the rule endDate', () => {
    const dates = generateOccurrenceDates(
      { freq: 'monthly', interval: 1, startDate: '2026-01-10', endDate: '2026-03-31' },
      '2026-01-01',
      '2026-12-31',
    )
    expect(dates).toEqual(['2026-01-10', '2026-02-10', '2026-03-10'])
  })

  it('clamps to the requested window', () => {
    const dates = generateOccurrenceDates(
      { freq: 'monthly', interval: 1, startDate: '2026-01-10' },
      '2026-03-01',
      '2026-04-30',
    )
    expect(dates).toEqual(['2026-03-10', '2026-04-10'])
  })

  it('drops dates present in exceptions', () => {
    const dates = generateOccurrenceDates(
      { freq: 'monthly', interval: 1, startDate: '2026-01-10' },
      '2026-01-01',
      '2026-03-31',
      ['2026-02-10'],
    )
    expect(dates).toEqual(['2026-01-10', '2026-03-10'])
  })

  it('returns empty when the window precedes the start', () => {
    const dates = generateOccurrenceDates(
      { freq: 'weekly', interval: 1, startDate: '2026-06-01' },
      '2026-01-01',
      '2026-05-31',
    )
    expect(dates).toEqual([])
  })
})

describe('needsMaterialization guard', () => {
  it('null guard (never materialized) needs work', () => {
    expect(needsMaterialization(null, '2026-07-31')).toBe(true)
  })

  it('guard at the window end is fresh', () => {
    expect(needsMaterialization('2026-07-31', '2026-07-31')).toBe(false)
  })

  it('guard past the window end is fresh', () => {
    expect(needsMaterialization('2026-08-31', '2026-07-31')).toBe(false)
  })

  it('guard from an earlier month is stale', () => {
    expect(needsMaterialization('2026-06-30', '2026-07-31')).toBe(true)
  })

  it('string comparison holds across a year boundary', () => {
    expect(needsMaterialization('2025-12-31', '2026-01-31')).toBe(true)
  })
})
