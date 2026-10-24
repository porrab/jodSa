const BANGKOK = 'Asia/Bangkok'

function calendarYear(iso: string | Date, locale: 'th' | 'en' = 'th'): number {
  return Number(new Intl.DateTimeFormat(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', {
    year: 'numeric', timeZone: BANGKOK,
  }).format(new Date(iso)))
}

export function formatAppDate(
  iso: string | Date,
  { locale = 'th', weekday = false, includeYear = true }: { locale?: 'th' | 'en'; weekday?: boolean; includeYear?: boolean } = {},
): string {
  return new Intl.DateTimeFormat(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', {
    ...(weekday ? { weekday: 'short' as const } : {}),
    day: 'numeric',
    month: 'short',
    ...(includeYear ? { year: 'numeric' as const } : {}),
    timeZone: BANGKOK,
  }).format(new Date(iso))
}

export function formatAppDayHeading(iso: string | Date, locale: 'th' | 'en' = 'th'): string {
  const currentYear = calendarYear(new Date(), locale)
  const valueYear = calendarYear(iso, locale)
  return formatAppDate(iso, { locale, weekday: true, includeYear: valueYear !== currentYear })
}

export function formatAppDateTime(iso: string | Date, locale: 'th' | 'en' = 'th'): string {
  const date = formatAppDate(iso, { locale, includeYear: true })
  const time = new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: BANGKOK,
  }).format(new Date(iso))
  return `${date} · ${time}`
}
