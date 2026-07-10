// J7 display helpers: "หักล่าสุด / ครั้งถัดไป" per recurring rule. Pure, no DB access —
// callers supply the rule + its exceptions; the DB lookup for "last deducted" (the
// actual materialized row) lives in the page/component, since it's a plain query.

import { generateOccurrenceDates, type RecurrenceRule } from './recurrence'
import { todayBangkok } from './range'

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

/**
 * First occurrence strictly after `today` (respecting endDate + exceptions).
 * Bounded to a 2-year horizon so monthly/yearly rules terminate quickly — well
 * past any realistic "next due" the user would want to see.
 */
export function computeNextDue(
  rule: RecurrenceRule,
  exceptions: string[] = [],
  today: string = todayBangkok(),
): string | null {
  const horizonYear = Number(today.slice(0, 4)) + 2
  const horizon = `${horizonYear}-12-31`
  const dates = generateOccurrenceDates(rule, addDays(today, 1), horizon, exceptions)
  return dates[0] ?? null
}
