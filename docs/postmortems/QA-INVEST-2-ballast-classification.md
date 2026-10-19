# QA-INVEST-2 / SPEC-6: ballast classification

## Summary

The investment tracker could not record ballast separately from core. The approved
SPEC-6 implementation adds the closed-set `ballast` sleeve across validation,
database metadata, persistence and reporting, with manual authenticated edits only.
It preserves the existing core default and leaves planner algorithms unchanged.
Implementation: `537f6bc..8b16f02`; QA harness additions/fix: `ac9b9f2`, `ecfe44a`,
`cd87d9a`. The exact migration was separately owner-authorized and applied.

## Root cause and mechanism

The original contract enumerated only `core`, `satellite`, and `risk_capital` in
`db/schema.ts`, generated Supabase row/write types, `lib/validators/invest.ts`, and
the migration-0008 CHECK. Forms and translated reporting exposed that same set.
An intended ballast holding therefore had to share a legacy bucket. Correct
aggregation of those stored values still could not recover the owner's separate
classification intent.

The original review brief called the field `risk_group` and suggested that the
planner drifted by sleeve. Source tracing corrected both premises: the field is
`sleeve`; planner drift is by asset class. Changing planner behavior would have
expanded the requested feature unnecessarily and changed financial semantics.

## Fix

Added the fourth value to schema/type/validator contracts, ordered role selectors,
Thai/English contextual copy, badges and allocation/snapshot rendering. Existing
aggregation already groups by sleeve; same-asset concentration still merges across
sleeves. Historical snapshot JSON is retained, with a missing-sleeve rendering
guard. Reclassification uses the existing authenticated update action.

SQL 0010 replaces only the verified sleeve CHECK. A reserved transaction held the
exclusive lock through guard checks, DDL and before/after preservation comparison.
No row backfill, owner holding edit, RLS/grant change or planner-source change was
included. See `docs/plans/QA-INVEST-2-live-migration-2026-10-18.md` for exact hash and
commit acknowledgement.

## Why it slipped through

This was a gap in the original three-sleeve product contract, exposed by the
owner's later ballast classification requirement. Existing tests verified the
original closed set, not a fourth role. Separate product/model approval was needed
before implementation; adding a free-text label would not have repaired the
database and validation contract.

## Validation

Independent QA evidence: `qa-lab` commit `757ef83`,
`qa-lab/projects/jodsa/runs/QA-SPEC6-ballast-live-2026-10-19.md` and its sanitized
summary. Actual consolidated runtime exit 0: 33/33 entries (32 behavior cases and
setup), zero skipped, unexpected or flaky. Seven new ballast cases exercised both
languages, 60/20/10/10 allocation, same-asset concentration, real edit/cancel with
nonzero value/FX/cost/P&L, old/new snapshot UI, unclassified planner blocking, and
two-user RLS negatives with positive controls. The other 25 regression cases passed.

Vitest: 327 passed, 34 API-level live-RLS tests skipped; typecheck and lint exit 0.
The executed browser isolation test is distinct evidence, not a claim that the
skipped API suite ran. Unit `buildPlan` invariance checks preserve drift,
concentration, stress, risk-capital percentage, suggestions and verdict when only
core changes to ballast.

The first consolidated browser attempt exposed a harness teardown problem:
default global Supabase sign-out revoked shared browser sessions. QA changed only
the two teardown calls to local scope and reran the whole targeted suite. Failure
and successful rerun are recorded in the QA report.

Deployment, production build, owner portfolio/reclassification and a saved
historical-plan before/after comparison were not tested. Database NULL/unknown
inserts and default-value DML negatives were not separately executed; schema
metadata/DDL and validator evidence must not be described as those tests.
