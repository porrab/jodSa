# OWNER-FB `/invest` date shifted to the next day

## Summary

Investment transactions entered at night in Bangkok were stored seven hours late and displayed on the next calendar day. Commit `b3d044f` now converts `datetime-local` values as explicit Asia/Bangkok wall time in both investment write paths. The deterministic UTC-host regression test passes; production deployment and repair of existing shifted rows are not covered by this fix.

## Symptom

The production holding detail sheet displayed a transaction entered as `2026-10-07T20:30` as `8/10/2569`, and the SGOV transaction entered as `2026-09-08T20:30` as `9/9/2569`. A regression test running under `TZ=UTC` reproduced the stored value as `2026-10-07T20:30:00.000Z` instead of `2026-10-07T13:30:00.000Z`.

## Root cause

`app/actions/invest/holdings.ts` and `app/actions/invest/transactions.ts` passed the timezone-free value from `<input type="datetime-local">` to `new Date(v.datetime).toISOString()`. JavaScript interprets that input in the server host timezone. Local development runs in Asia/Bangkok and accidentally produced the intended instant; Vercel runs the action in UTC and stored the wall-clock value as UTC, seven hours late.

## Why it produced the symptom

The client correctly renders stored timestamps in the user's Bangkok timezone. A value entered as 20:30 but stored as 20:30Z renders as 03:30 the following day in Bangkok, so the holding dialog advances the date by one.

## Fix

Commit `b3d044f` adds `investDatetimeToISO` in `lib/invest/datetime.ts`. It accepts only the `datetime-local` shape, appends the explicit `+07:00` offset, and converts that absolute instant to ISO. Both investment creation paths use the helper, so their behavior no longer depends on the server host timezone.

## How it was found

The production holding sheet provided a deterministic visual repro for both reported dates. Source tracing found the two host-timezone-dependent conversions. The first regression run under `TZ=UTC` failed with `20:30Z`; the hypothesis was falsified against a Bangkok-host run, where the old code passed, proving that host timezone—not locale formatting—controlled the result. Adding an explicit offset made the same test pass under UTC.

## Why it slipped through

The write path had no test that varied the server timezone. Development and the existing test environment used Asia/Bangkok, which masked the dependency, while browser tests did not assert the saved calendar date in the holding detail sheet.

## Validation

- `pnpm -s vitest run tests/unit/invest/datetime.test.ts`: 2/2 passed with the test pinned to `TZ=UTC`.
- Full unit suite: 329 passed, 34 skipped live-RLS tests.
- `pnpm -s tsc --noEmit`: passed.
- Production was inspected to confirm the pre-fix symptom. The fix has not been deployed or production-verified.

## Action items / follow-ups

- Existing investment timestamps written by the old path remain shifted. Repairing owner data requires a separately reviewed, owner-authorized one-time update; this code fix does not mutate existing records.
- The UTC-host regression test added in `b3d044f` closes the CI gap for future investment writes.
