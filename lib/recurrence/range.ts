// Asia/Bangkok calendar-date helpers for lazy materialization windows.

function bangkokParts(d = new Date()): { y: number; m: number; day: number } {
  // en-CA formats as YYYY-MM-DD, so we get the Bangkok calendar date directly.
  const s = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  const [y, m, day] = s.split('-').map(Number)
  return { y, m, day }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Current month [first, last] as YYYY-MM-DD strings in Asia/Bangkok. */
export function currentMonthRange(d = new Date()): { from: string; to: string } {
  const { y, m } = bangkokParts(d)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate() // day 0 of next month = last day of this month
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay)}` }
}

/** Today's calendar date (YYYY-MM-DD) in Asia/Bangkok. */
export function todayBangkok(d = new Date()): string {
  const { y, m, day } = bangkokParts(d)
  return `${y}-${pad(m)}-${pad(day)}`
}

/**
 * Clamp a materialization window's upper bound to today (Asia/Bangkok) — deduction
 * must land on the rule's actual due date, not the whole remaining month up front
 * (design J7 / M7-D). `to` is typically a month-end from `currentMonthRange`; when
 * that's in the future relative to today, today wins.
 */
export function clampToToday(to: string, d = new Date()): string {
  const today = todayBangkok(d)
  return to > today ? today : to
}

/**
 * True when a rule may still be missing occurrences for a window ending at `to`.
 * `materializedThrough` is the rule's guard date (YYYY-MM-DD, null = never
 * materialized). Plain string comparison is correct for ISO dates.
 *
 * Accepts `undefined` too (not just `null`) — a shape drift that returns the row
 * without this column (e.g. a stale generated-types file, or a partial select)
 * must never silently disable materialization forever. `!materializedThrough`
 * treats any falsy value (null, undefined, '') as "never materialized".
 */
export function needsMaterialization(
  materializedThrough: string | null | undefined,
  to: string,
): boolean {
  return !materializedThrough || materializedThrough < to
}
