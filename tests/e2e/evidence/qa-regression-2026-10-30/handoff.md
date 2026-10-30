# QA-C2-REG-1 handoff — 2026-10-30

## Result

- No app code, migration, or apply script changed. No push was made.
- `pnpm build` passed; the suite ran against `pnpm start --port 3100` with `JODSA_E2E_PORT=3100`.
- Full Playwright: 172 tests in 48 files — 103 passed, 41 failed, 28 skipped, 0 flaky. Per-file counts and every failure, skip reason, error, and screenshot path are in [full-final/summary.md](full-final/summary.md); raw output is [full-final/results.json](full-final/results.json).
- C1/A3/contrast/C2 `--repeat-each=3`: 61 passed (including setup), 0 failed, 0 skipped, 0 flaky. See [repeat-3/summary.md](repeat-3/summary.md) and [repeat-3/results.json](repeat-3/results.json).
- Raw `pnpm -s tsc --noEmit --incremental false` exited 0. `pnpm -s vitest run` passed 367, skipped 34 (all in `tests/unit/rls.test.ts`; its required `TEST_SUPABASE_*` process variables were not supplied), failed 0.
- Authenticated A/B count queries found one leftover B account after the runs. It was deleted through B's own session with `.eq('user_id', B.id)`. The final A/B count queries show zero rows in all 11 checked tables. See [count-before-cleanup.jsonl](count-before-cleanup.jsonl) and [count-after-cleanup.jsonl](count-after-cleanup.jsonl).

## Every harness change

| File | Change |
| --- | --- |
| `playwright.production.config.ts` | Reuses the explicitly started local production server on port 3100. |
| `tests/e2e/helpers/test-user-guard.ts` | New registered-test-user ID guard; missing or unregistered IDs throw. |
| `tests/unit/test-user-guard.test.ts` | New unit tests for valid, missing, and unregistered IDs, including guarded helper calls. |
| `tests/e2e/helpers/admin.ts` | Resolves test IDs by each named user's own password session; registers confirmed test users; builds RLS-scoped test-user clients; requires registered IDs for reset/seed/update helpers; reads system assets through a user client; retains service-role writes only with test-user ID filters or exact created IDs. |
| `tests/e2e/m5-settings.spec.ts` | Replaces unfiltered auth listing with `getUserById(userId)` for the exact test-created user; updates settings locale selector to current button UI. |
| `tests/e2e/c1-reconcile.spec.ts` | Calls `account_balances()` through an authenticated test-user client; routes screenshots to the run evidence folder. |
| `tests/e2e/c2-invest-divest.spec.ts` | Calls `account_balances()` through an authenticated test-user client; scopes the cash-row SELECT by `user_id`; routes screenshots to the run evidence folder. |
| `tests/e2e/helpers/trip.ts` | Carries the registered owner ID in seeded trip fixtures; checks it before query helpers; scopes trip delete/status writes by both exact trip token and owner ID; uses the selected E2E port for API requests. |
| `tests/e2e/ballast.spec.ts` | Registers A/B IDs obtained from their own sessions; updates settings locale button selector and disambiguates a repeated percentage text assertion. |
| `tests/e2e/helpers/env.ts` | Adds `e2eBaseUrl` from `JODSA_E2E_PORT` and `evidenceDir` for dated screenshot output. |
| `tests/e2e/m4-guest-pay.spec.ts` | Uses `e2eBaseUrl` instead of fixed localhost:3000 for direct API calls. |
| `tests/e2e/helpers/invest.ts` | Uses `role=tab` for the Overview and Plan tabs. |
| `tests/e2e/a3-display-name.spec.ts` | Routes screenshots to the dated run evidence folder. |
| `tests/e2e/ds2-home-evidence.spec.ts` | Routes screenshots to the dated run evidence folder. |
| `tests/e2e/ds3-form-row.spec.ts` | Routes screenshots to the dated run evidence folder. |
| `tests/e2e/ds5-open-items.spec.ts` | Routes screenshots to the dated run evidence folder. |
| `tests/e2e/ds6-polish.spec.ts` | Routes screenshots to the dated run evidence folder. |
| `tests/e2e/field-1-mobile-save.spec.ts` | Updates the slip confirm action, QR reference, and selected account selectors to current UI semantics. |
| `tests/e2e/field-2-counterparty-capture.spec.ts` | Updates the slip confirm action selector. |
| `tests/e2e/invest-m1.spec.ts` | Updates settings locale selection to current button UI. |
| `tests/e2e/invest-m5.spec.ts` | Updates settings locale selection to current button UI. |
| `tests/e2e/m2-s5-accuracy.spec.ts` | Updates the slip confirm action selector. |
| `tests/e2e/m2-slip-import.spec.ts` | Updates slip confirm action and QR reference selectors. |
| `tests/e2e/m7-dup-override.spec.ts` | Updates slip confirm action and QR reference selectors. |
| `tests/e2e/m8-account-mapping.spec.ts` | Updates the slip confirm action selector. |
| `tests/e2e/m9-home-restructure.spec.ts` | Uses `role=tab` for the Overview segment. |
| `tests/e2e/m9-onboarding.spec.ts` | Updates the slip confirm action selector. |
| `tests/e2e/review-20261010.spec.ts` | Uses `role=tab` for the Overview segment. |
| `tests/e2e/m9-trip.spec.ts` | Passes the entire owner-scoped trip fixture to teardown. |
| `tests/e2e/trip-2-join-ledger.spec.ts` | Passes the entire owner-scoped trip fixture to teardown. |
| `tests/e2e/trip-3-expense-split.spec.ts` | Passes the entire owner-scoped trip fixture to teardown. |
| `tests/e2e/trip-4-authz-dedup.spec.ts` | Passes the trip fixture to teardown and scoped slip reads. |
| `tests/e2e/trip-4-slip-ui.spec.ts` | Passes the entire owner-scoped trip fixture to teardown. |
| `tests/e2e/trip-5-owner.spec.ts` | Passes the trip fixture to teardown and scoped slip reads. |
| `tests/e2e/trip-6-security.spec.ts` | Passes the trip fixture to teardown/status helpers. |
| `REVIEW-INBOX.md` | Records QA-C2-REG-1 implementation for QA recheck and files QA-REG-2 for the independent full-suite failures. |

## Query boundary audit

- `rg -n 'listUsers|adminClient\\(\\)\\.rpc\\(' tests -g '*.ts'` returned no unfiltered auth listing or service-role balance RPC.
- All remaining service-role SELECTs in `tests/e2e` were inspected: they use `.eq('user_id', registeredTestId)` or exact IDs/tokens created by the test (`id`, `session_id`, or trip owner). Shared system asset lookup now uses an authenticated test-user client.
- Cleanup count reads and the one B account deletion used B's own authenticated session. No owner auth listing, owner row read, or owner write was used.
