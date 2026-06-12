// [M3] Recurring rule → dated occurrences (lazy-on-read, idempotent, Asia/Bangkok).
// See skill: recurrence-engine.
//
// `date` columns are plain calendar dates (YYYY-MM-DD), so all math here is done on
// UTC-midnight instants to stay deterministic. Asia/Bangkok has no DST and a fixed
// +07:00 offset, so a calendar date never spans a UTC day boundary in a way that
// would shift its weekday or day-of-month — UTC arithmetic gives the same answer.

const MS_DAY = 86_400_000

export interface RecurrenceRule {
  freq: 'weekly' | 'monthly' | 'yearly'
  interval: number // every N freq units (>= 1)
  byWeekday?: number[] | null // ISO weekday Mon=1..Sun=7 (weekly only)
  startDate: string // YYYY-MM-DD, inclusive
  endDate?: string | null // YYYY-MM-DD, inclusive
}

function parseDate(d: string): number {
  const [y, m, day] = d.split('-').map(Number)
  return Date.UTC(y, m - 1, day)
}

function formatDate(ms: number): string {
  const dt = new Date(ms)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ISO weekday: Mon=1 .. Sun=7
function isoWeekday(ms: number): number {
  const dow = new Date(ms).getUTCDay() // 0=Sun .. 6=Sat
  return dow === 0 ? 7 : dow
}

/**
 * Pure date generator. Returns sorted YYYY-MM-DD strings for every occurrence of
 * `rule` within [from, to] (both inclusive), clamped to the rule's own
 * [startDate, endDate] window, with `exceptions` (skipped dates) removed.
 *
 * Idempotency / dedup against already-materialized rows is the caller's job —
 * this function only decides which calendar dates the rule lands on.
 */
export function generateOccurrenceDates(
  rule: RecurrenceRule,
  from: string,
  to: string,
  exceptions: string[] = [],
): string[] {
  const start = parseDate(rule.startDate)
  const end = rule.endDate ? parseDate(rule.endDate) : Number.POSITIVE_INFINITY
  const lo = Math.max(start, parseDate(from))
  const hi = Math.min(end, parseDate(to))
  if (lo > hi) return []

  const interval = Math.max(1, rule.interval)
  const ex = new Set(exceptions)
  const out: string[] = []
  const push = (ms: number) => {
    const s = formatDate(ms)
    if (!ex.has(s)) out.push(s)
  }

  if (rule.freq === 'weekly') {
    const startWd = isoWeekday(start)
    const mondayOfStartWeek = start - (startWd - 1) * MS_DAY
    const weekdays =
      rule.byWeekday && rule.byWeekday.length
        ? new Set(rule.byWeekday)
        : new Set([startWd])
    for (let ms = lo; ms <= hi; ms += MS_DAY) {
      const weeksSinceStart = Math.floor((ms - mondayOfStartWeek) / (7 * MS_DAY))
      if (weeksSinceStart % interval !== 0) continue
      if (!weekdays.has(isoWeekday(ms))) continue
      push(ms)
    }
    return out
  }

  const [sy, sm, sd] = rule.startDate.split('-').map(Number)

  if (rule.freq === 'monthly') {
    let y = sy
    let m = sm // 1-based
    while (true) {
      const cand = Date.UTC(y, m - 1, sd)
      if (cand > hi) break
      // Short month (e.g. day 31 in Feb) overflows into the next month — skip it.
      const valid = new Date(cand).getUTCMonth() === m - 1
      if (valid && cand >= lo) push(cand)
      m += interval
      while (m > 12) {
        m -= 12
        y += 1
      }
    }
    return out
  }

  // yearly
  let y = sy
  while (true) {
    const cand = Date.UTC(y, sm - 1, sd)
    if (cand > hi) break
    // Feb 29 in a non-leap year overflows to Mar 1 — skip it.
    const dt = new Date(cand)
    const valid = dt.getUTCMonth() === sm - 1 && dt.getUTCDate() === sd
    if (valid && cand >= lo) push(cand)
    y += interval
  }
  return out
}
