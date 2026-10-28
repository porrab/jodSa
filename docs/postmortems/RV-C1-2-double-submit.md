# RV-C1-2: duplicate C1 backfill submission

## Summary

Two save events in the same browser task could insert two identical C1 backfill transactions while the sheet showed only one saved row. The C1 form now rejects a second submit synchronously, waits for its saved-row refresh, and retains transaction IDs in a ref.

## Symptom

The new `C1 ignores two save taps in one browser task` E2E called the save button's `click()` twice without yielding. Before the fix, the database query for the new counterparty returned 2 rows where 1 was expected; `ลงแล้ว (1)` was visible. A Playwright `dblclick()` did not reproduce the issue because the button became disabled before its second event. A route-delayed refresh experiment kept the React action pending and did not isolate this race.

## Root cause

`TransactionForm` invoked `onSuccess(transactionId)` without awaiting its promise. C1's `refreshAfterSave` fetched the new balance and saved rows, then changed `savedCount`, which remounts the form. The form remained populated until that refresh completed. The button's `isPending` render guard did not reject two submit events dispatched before React committed the disabled state. Both actions could call `createTransaction`.

The same path built `nextSavedTransactionIds` from the render's closed-over `savedTransactionIds`. Concurrent refreshes could therefore each start from the same list and leave a saved ID out of the `ลงแล้ว` summary. The database balance was read separately from `account_balances()`.

## Fix

The C1 caller opts into a synchronous submit guard in `TransactionForm`; the guard prevents a second form submission in the same browser task and releases when the action settles. The non-optimistic action awaits `onSuccess`, so `isPending` and the saving label remain until C1's refresh finishes. The optimistic branch remains detached. C1 appends transaction IDs to `savedTransactionIdsRef` before fetching the updated state, then renders the saved rows returned by the server.

## How it was found and why it slipped through

Source tracing identified the unawaited callback, delayed remount, and closed-over ID list. The first `dblclick()` test passed on the old build, disproving that ordinary Playwright double-click timing reached the window. Dispatching two clicks in one browser task reproduced the duplicate deterministically. Previous C1 E2E cases submitted one transaction at a time and waited for the Gap Bar before the next save.

## Validation

Before the fix, the new E2E failed with `Expected: 1; Received: 2` from the database. After the fix, C1 passed 20/20 with `--repeat-each 5` (four cases per repetition). A3 and rendered contrast passed 8/8. `pnpm -s tsc --noEmit --incremental false` exited 0; Vitest passed 352 tests and skipped 34 live-RLS tests; `pnpm build` exited 0. These E2E runs used the existing test user A storage state and skipped global setup.
