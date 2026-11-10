import { describe, expect, it } from 'vitest'
import { isQuietHour, notificationPrefsSchema } from '@/lib/notifications/prefs'

describe('notification preferences', () => {
  it('handles overnight and daytime quiet hours', () => {
    const overnight = notificationPrefsSchema.parse({ daily: true, recurring: true, quietStart: '22:00', quietEnd: '07:00' })
    expect(isQuietHour(overnight, '23:00')).toBe(true); expect(isQuietHour(overnight, '06:59')).toBe(true); expect(isQuietHour(overnight, '12:00')).toBe(false)
    const daytime = notificationPrefsSchema.parse({ daily: true, recurring: true, quietStart: '12:00', quietEnd: '13:00' })
    expect(isQuietHour(daytime, '12:30')).toBe(true); expect(isQuietHour(daytime, '13:00')).toBe(false)
  })
})
