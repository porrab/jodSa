# DS-5 C12 — transaction date heading hydration mismatch

## Summary

The `/transactions` day heading could render a different year on the server and in the browser, which surfaced as a React hydration error. The fix on `main` derives Bangkok calendar parts numerically through one deterministic formatter path and uses those parts for both the current-year comparison and the rendered date.

## Symptom

The DS-5 re-review recorded a hydration error on `/transactions`. A current-year Thai heading could also incorrectly include `2569`; the focused unit reproduction returned `ส. 24 ต.ค. 2569` when the required result was `ส. 24 ต.ค.`.

## Root cause

`calendarYear()` in `lib/date-display.ts` formatted the year as Thai Buddhist-calendar display text and passed the entire string to `Number()`. The runtime can return text such as `พ.ศ. 2569`, for which `Number()` returns `NaN`. Since `NaN !== NaN`, `formatAppDayHeading()` concluded that every date was outside the current year. It then delegated rendering to a separate locale-sensitive `Intl.DateTimeFormat` instance, leaving server and browser output dependent on their ICU formatting details.

## Why it produced the symptom

The failed numeric conversion made the include-year decision unstable, and the second formatter independently produced the visible date. When the server and browser differed in localized year text or punctuation, React received different text for the same heading and reported a hydration mismatch.

## Fix

`bangkokDateParts()` now obtains Gregorian `year`, `month`, and `day` with `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).formatToParts()` and converts only numeric part values. `calendarYear()`, `formatAppDate()`, `formatAppDayHeading()`, and `formatAppDateTime()` all consume this shared numeric path. Thai display years are derived explicitly as Gregorian year plus 543, while current-year comparison stays Gregorian.

## How it was found

The re-review named the failing conversion. A frozen-time unit test made the output deterministic and failed before the fix because the current-year heading included `2569`. Source tracing then confirmed that the comparison and display paths used separate locale formatters.

## Why it slipped through

Date tests covered transaction behavior but not localized heading text at the server/browser seam. No E2E assertion treated React hydration console errors as test failures, so a page that remained visually usable could pass the existing suite.

## Validation

- `tests/unit/date-display.test.ts` freezes the clock in 2026 and verifies that a 2026 Bangkok heading omits the year; it failed before the fix and now passes.
- `tests/e2e/ds5-date-hydration.spec.ts` listens for hydration and server-render mismatch console errors while loading `/transactions`; the gate passes.
- `pnpm -s vitest run`: 334 passed, 34 live-RLS tests skipped.
- `pnpm -s tsc --noEmit`: exit 0.
- Combined DS-3, DS-5 C12/N1, and Honey contrast E2E gate: 8 passed.

## Prevention

Keep locale display strings out of numeric comparisons. The new unit and console-error E2E tests are the regression gates for this seam.
