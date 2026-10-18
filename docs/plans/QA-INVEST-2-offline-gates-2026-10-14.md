# Ballast offline gate evidence — 2026-10-14

Workspace anchor: `E:\claudeWorkSpace`. Observed directly by the parent orchestrator, on the uncommitted ballast runtime changes based on `project/jodsa` commit `537f6bc`. This is execution evidence, not independent acceptance or deployment approval.

| Command (cwd `project/jodsa`) | Terminal result |
|---|---|
| `rtk proxy pnpm -s tsc --noEmit` | Session 13335, exit 0, no diagnostics |
| `rtk proxy pnpm -s vitest run` | Session 79413, exit 0; 327 passed, 34 skipped; 21 files passed, 1 skipped; duration 12.49s |
| `rtk proxy pnpm -s lint` | Session 76010, exit 0; `No ESLint warnings or errors` |

The 34 skipped cases are live RLS tests. Expected error-path fixtures in `materialize.test.ts` emitted insert/guard failure messages and passed; these were not suite failures. Next.js printed its existing `next lint` deprecation notice, then lint completed successfully.

Ballast unit files: validators 14 tests, portfolio 24, planner resolution 9, planner plan 27. Total for those four files: 74 passing tests. The legacy snapshot fixture checks serialized data only; it does not prove rendering or persisted history. Browser, database constraint execution, migration preservation, and live two-user ballast isolation remain unverified.

No database migration, owner-data mutation or ballast deployment was performed. Follow `project/jodsa/docs/plans/QA-INVEST-2-migration-runbook.md` only after approval of the exact reviewed SQL. Subsequent SQL/runbook-only corrections do not change the runtime tested above; any later runtime edit requires appropriate revalidation.

## Read-only live schema preflight

The parent used the trusted local Node/postgres client with configuration kept inside the process. The database target was matched to the configured Supabase API project before connecting. The query read only catalog metadata, not user rows, and performed no DDL or DML.

Observed: one `holdings_sleeve_check`, validated, referencing one column; `sleeve` is NOT NULL text with default `'core'::text`. Its current expression is exactly `sleeve = ANY (ARRAY['core'::text, 'satellite'::text, 'risk_capital'::text])`. This proves the inspected live preflight shape, not migration execution or full before/after preservation. The exact migration still requires independent review and separate live-apply authorization.

## Source-derived guard verification

`rtk proxy node scripts/verify-ballast-guards.cjs` completed exit 0: **16 cases, 16 passed**, inside a PostgreSQL READ ONLY transaction. No DDL/DML or user-row read occurred. The script extracts the actual candidate expression/default allowlists and verifies normal inputs plus case/space changes, extra values, OR/other-column branches and missing values. It does not execute the migration or prove concurrent-lock behavior.

Verified SQL SHA-256: `74c6cde5e1aab17b79158b24ec5cfaff1d7c10281ea206ca6eed4d298d4f768e`.

The initial inline guard harness failed with SQLSTATE `22023` before evaluating cases because the postgres client JSON-serialized an already stringified JSON parameter. The committed runnable harness uses the client's typed `sql.json()` parameter; its full rerun passed. This was a harness error, not a hidden migration pass.

## Routing ledger

Antigravity authored the runtime and initial migration/runbook. The later correction attempt first stopped at the launcher's 90-second health timeout; subsequent direct probes confirmed health HTTP 200. The efficient model request then returned 429 (Gemini credentials cooling down), and a direct Antigravity Claude request returned 429 with all accounts exhausted/reset after five minutes. The exact two-file correction was therefore completed natively and independently rechecked. No persistent CLI setup or account switching was performed.

2026-10-18 continuation: runtime/source state was unchanged from the gate run. The user explicitly requested separate Gemini quota, so a direct `gemini` route was launched for bounded source-only ballast E2E authoring; no database apply was authorized or attempted.
