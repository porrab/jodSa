import { z } from 'zod'

export const notificationPrefsSchema = z.object({
  daily: z.boolean().default(true), recurring: z.boolean().default(true),
  quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
})
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>
export const defaultNotificationPrefs: NotificationPrefs = { daily: true, recurring: true, quietStart: null, quietEnd: null }

export function isQuietHour(prefs: NotificationPrefs, hourMinute: string) {
  if (!prefs.quietStart || !prefs.quietEnd || prefs.quietStart === prefs.quietEnd) return false
  return prefs.quietStart < prefs.quietEnd
    ? hourMinute >= prefs.quietStart && hourMinute < prefs.quietEnd
    : hourMinute >= prefs.quietStart || hourMinute < prefs.quietEnd
}
