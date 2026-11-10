import { expect, it } from 'vitest'
import { notificationSlot } from '@/lib/notifications/slot'
it('maps UTC to Bangkok slot boundaries across retries and midnight', () => {
  expect(notificationSlot(new Date('2026-11-10T05:01:00Z'))?.boundary).toBe('2026-11-10T12:00:00+07:00')
  expect(notificationSlot(new Date('2026-11-10T05:59:00Z'))?.boundary).toBe('2026-11-10T12:00:00+07:00')
  expect(notificationSlot(new Date('2026-11-10T15:00:00Z'))?.boundary).toBe('2026-11-10T22:00:00+07:00')
  expect(notificationSlot(new Date('2026-11-10T17:00:00Z'))).toBeNull()
  expect(notificationSlot(new Date('2026-11-11T05:00:00Z'))?.day).toBe('2026-11-11')
})
