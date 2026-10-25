const BANGKOK = 'Asia/Bangkok'

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const ENGLISH_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const THAI_WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
const ENGLISH_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function bangkokDateParts(iso: string | Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: 'numeric', day: 'numeric', timeZone: BANGKOK,
  }).formatToParts(new Date(iso))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  }
}

function calendarYear(iso: string | Date): number {
  return bangkokDateParts(iso).year
}

export function formatAppDate(
  iso: string | Date,
  { locale = 'th', weekday = false, includeYear = true }: { locale?: 'th' | 'en'; weekday?: boolean; includeYear?: boolean } = {},
): string {
  const { year, month, day } = bangkokDateParts(iso)
  const weekdayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  const displayYear = locale === 'th' ? year + 543 : year
  const monthLabel = locale === 'th' ? THAI_MONTHS[month - 1] : ENGLISH_MONTHS[month - 1]
  const weekdayLabel = locale === 'th' ? THAI_WEEKDAYS[weekdayIndex] : ENGLISH_WEEKDAYS[weekdayIndex]
  const date = `${day} ${monthLabel}${includeYear ? ` ${displayYear}` : ''}`
  if (!weekday) return date
  return locale === 'th' ? `${weekdayLabel} ${date}` : `${weekdayLabel}, ${date}`
}

export function formatAppDayHeading(iso: string | Date, locale: 'th' | 'en' = 'th'): string {
  const currentYear = calendarYear(new Date())
  const valueYear = calendarYear(iso)
  return formatAppDate(iso, { locale, weekday: true, includeYear: valueYear !== currentYear })
}

export function formatAppDateTime(iso: string | Date, locale: 'th' | 'en' = 'th'): string {
  const date = formatAppDate(iso, { locale, includeYear: true })
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: BANGKOK,
  }).formatToParts(new Date(iso))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const time = `${values.hour}:${values.minute}`
  return `${date} · ${time}`
}
