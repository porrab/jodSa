---
name: recurrence-engine
description: >
  Expand a recurring_rules row into concrete dated occurrences for a requested
  date range, honoring weekday exclusions, Asia/Bangkok timezone, start/end bounds,
  and skip-exceptions, idempotently. Use when implementing or modifying recurring
  expense generation (subscriptions and weekly costs like "travel Tue-Thu+Sat").
  Do NOT use for one-off transactions or for forecasting beyond the rule's end_date.
---

# Recurrence Engine

Generate **real transaction occurrences** from a `recurring_rules` row, **lazily on
read**. There is no cron in MVP: when the app loads a date range, materialize any
missing occurrences for that range.

## Data model consumed

```ts
interface RecurringRule {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amountSatang: number;
  category: string;
  accountId: string;
  freq: 'weekly' | 'monthly' | 'yearly';
  interval: number;             // every N freq units
  byWeekday?: number[];         // Mon=1..Sun=7; e.g. [2,3,4,6] = Tue-Thu + Sat
  startDate: string;            // ISO date, Asia/Bangkok
  endDate?: string | null;
}
```

## Algorithm

For a requested `[from, to]` range (clamped to `[startDate, endDate ?? to]`):
1. Walk candidate dates by `freq` × `interval` from `startDate`.
2. **weekly + `byWeekday`**: emit a date only if its ISO weekday ∈ `byWeekday`.
   ("travel Tue–Thu + Sat" = `byWeekday:[2,3,4,6]`, weekly, interval 1.)
3. **monthly**: same day-of-month; if the month is short (e.g. day 31 in Feb),
   **skip** that month (do not roll over to the 1st).
4. **yearly**: same month+day; Feb 29 in a non-leap year → skip.
5. Drop any date present in `recurring_exceptions` for this rule.
6. For each surviving date with **no existing** transaction
   (`recurring_rule_id` + `occurrence_date`), create one. This makes generation
   **idempotent** — re-reading the same range never duplicates rows.

## Timezone
All date math is **Asia/Bangkok**. Compute weekday and day-of-month in that zone,
not UTC, or boundary days will be off by one.

## Edge cases to test
- Month boundary: weekly rule spanning end of month into next.
- Year boundary: weekly rule crossing Dec→Jan keeps correct weekdays.
- Short month: monthly day-31 rule skips Feb/Apr/Jun/Sep/Nov.
- Leap year: yearly Feb-29 rule emits only in leap years.
- Skip: deleting a generated occurrence writes an exception; re-read does not recreate it.
- Interval: `freq=monthly, interval=3` emits quarterly.

## When NOT to use
- One-off (non-recurring) transactions.
- Generating dates past `endDate`, or pure forecasting that should not create rows.
- Server cron expansion (MVP is lazy-on-read only).
