# QA-INVEST-2: approved live migration record

Owner explicitly authorized applying SQL 0010 and continuing verification on
2026-10-18. This authorization is separate from the earlier ballast product scope
approval. No owner holding was reclassified.

## Applied result

- Target: the Supabase project matched by the repository's local API and database
  configuration; credentials and owner rows were not printed or sent to a model.
- SQL: `db/migrations/0010_invest_ballast_sleeve.sql`, reviewed commit `8b16f02`.
- SHA-256: `74c6cde5e1aab17b79158b24ec5cfaff1d7c10281ea206ca6eed4d298d4f768e`.
- Actual execution: `node scripts/apply-ballast-approved.cjs
  --apply-owner-approved-0010`, exit **0**.
- Committed and independently queried after commit at
  **2026-10-18T08:11:43.225Z**.
- Final CHECK: one validated, sleeve-only `holdings_sleeve_values`, accepting
  exactly `core`, `ballast`, `satellite`, and `risk_capital`.

## Preservation evidence

The helper used a reserved `postgres.begin` transaction. It retained the approved
five-second lock timeout, exclusive table lock, preflight guards and DDL body.
Only outer BEGIN/COMMIT were delegated to the driver. Before/after checks ran
while the same transaction held the lock, before allowing commit.

Server-side hashes of every holding row and its total count were identical.
Column types, defaults and nullability, table ownership/ACL, both RLS flags,
all four policy definitions, grants, indexes and every other constraint,
including incoming foreign keys, were identical. Only the intended sleeve CHECK
changed. Raw financial rows and counts were not emitted into logs.

The helper's first draft used raw pooled transaction statements; independent QA
rejected that approach because a reconnect could lose the transaction. It was
corrected to a scoped transaction and re-reviewed before any execution. Failure
reporting also distinguishes uncertain commit acknowledgement from rollback.
Reviewed helper SHA-256:
`f42726bd4c18c4a6247d4f1fab9fc0d8da5dc155ab7f7e86fa6dd484cf899829`.

## Remaining acceptance boundary

This record proves the actual migration and preservation checks, not browser
acceptance or deployment. Live ballast browser tests are tracked separately by
qa-lab. No owner data was backfilled, and no ballast application change has yet
been merged to main at the time this record was written.

The apply helper is deliberately non-idempotent and requires an explicit flag.
Do not rerun it: the legacy-only preflight rejects an already expanded schema.
Any rollback or owner reclassification requires separate owner authorization.
