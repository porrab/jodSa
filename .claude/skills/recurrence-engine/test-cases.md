# Recurrence Engine — Test Cases

> [M3] STUB. Fixtures + expected occurrence lists for each edge case below. Drives
> the M3 acceptance tests. All date math in Asia/Bangkok.

- [ ] Month boundary: weekly rule spanning end of month into next.
- [ ] Year boundary: weekly rule crossing Dec→Jan keeps correct weekdays.
- [ ] Short month: monthly day-31 rule skips Feb/Apr/Jun/Sep/Nov.
- [ ] Leap year: yearly Feb-29 rule emits only in leap years.
- [ ] Skip: deleting a generated occurrence writes an exception; re-read does not recreate it.
- [ ] Interval: `freq=monthly, interval=3` emits quarterly.
- [ ] byWeekday `[2,3,4,6]` (Tue–Thu + Sat) over a month → only those weekdays.
