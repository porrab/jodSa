# QA-INVEST-2: Ballast Sleeve Runtime Implementation Report

**Status (updated 2026-10-20):** Runtime implemented; owner-authorized migration applied with preservation checks; QA GREEN `757ef83` and independent PM APPROVED `33bff60` for code/spec and targeted behavior. Deployment and owner edits remain unverified.
**Specification:** SPEC-6 (`docs/plans/QA-INVEST-2-ballast-proposal.md`, `REVIEW-INBOX.md`).
**Date:** 2026-10-12.

---

## 1. Executive Summary

The bounded, owner-approved SPEC-6 runtime implementation adds `ballast` as the fourth portfolio sleeve (`core`, `ballast`, `satellite`, `risk_capital`) to JodSa Investments.

The sleeve taxonomy represents the portfolio role assigned by the user to stabilize the portfolio. It is strictly reporting-only and is orthogonal to asset-class allocation drift, look-through concentration, stress testing, and recommendation generation.

At original runtime authoring on 2026-10-12, no database mutation or browser run was performed. Subsequent separately authorized migration and independent acceptance are recorded in section 4 below; deployment and owner reclassification are outside that evidence.

---

## 2. Changes Delivered

### 2.1 Database Schema & Supabase Types
- **`db/schema.ts`**:
  Updated the `holdings.sleeve` text column enum metadata:
  ```ts
  sleeve: text('sleeve', { enum: ['core', 'ballast', 'satellite', 'risk_capital'] })
    .default('core')
    .notNull(),
  ```
  Preserves `NOT NULL` and default `'core'`.
- **`lib/supabase/types.ts`**:
  Updated `holdings` type definitions for `Row`, `Insert`, and `Update`:
  - `sleeve: 'core' | 'ballast' | 'satellite' | 'risk_capital'`
  - `sleeve?: 'core' | 'ballast' | 'satellite' | 'risk_capital'`

### 2.2 Validators
- **`lib/validators/invest.ts`**:
  Extended the `SLEEVES` tuple in the exact approved order:
  ```ts
  export const SLEEVES = ['core', 'ballast', 'satellite', 'risk_capital'] as const
  export type Sleeve = (typeof SLEEVES)[number]
  ```
  All Zod schemas (`holdingCreateSchema`, `updateHoldingSchema`) dynamically inherit all 4 values.

### 2.3 Internationalization (i18n) Copy
- **`messages/en.json`**:
  - `"sleeveLabel"`: `"Portfolio role"`
  - `"allocationBySleeve"`: `"By portfolio role"`
  - `"sleeve"`: Added `"ballast": "Ballast"` alongside existing `core`, `satellite`, `risk_capital`.
  - `"ballastHelper"`: `"The part you assign to help stabilize the portfolio; this does not mean it is risk-free."`
- **`messages/th.json`**:
  - `"sleeveLabel"`: `"บทบาทในพอร์ต"`
  - `"allocationBySleeve"`: `"แบ่งตามบทบาทในพอร์ต"`
  - `"sleeve"`: Added `"ballast": "ตัวถ่วง (Ballast)"` alongside existing `core`, `satellite`, `risk_capital`.
  - `"ballastHelper"`: `"ส่วนที่คุณกำหนดให้ช่วยถ่วงความผันผวนของพอร์ต ไม่ได้หมายความว่าไม่มีความเสี่ยง"`

### 2.4 User Interface & Dashboard
- **`app/(app)/invest/invest-client.tsx`**:
  - Added conditional helper text under sleeve radio/select in `AddHoldingDialog` and `HoldingEditForm`:
    ```tsx
    {sleeve === 'ballast' && (
      <p className="text-xs text-muted-foreground">{t('ballastHelper')}</p>
    )}
    ```
  - Preserved neutral outline badge styling and existing risk-capital warning.
- **`app/(app)/invest/portfolio-dashboard.tsx`**:
  - Extended `SnapshotDetail` to display sleeve allocation when present:
    ```tsx
    const sleeveBuckets = Array.isArray(allocation?.sleeve) ? allocation.sleeve : []
    ...
    {sleeveBuckets.length > 0 && (
      <div className="space-y-2">
        <p className="text-sm font-medium">{t('allocationBySleeve')}</p>
        {sleeveBuckets.map((b) => (
          <div key={b.key} className="flex items-center justify-between text-sm">
            <span>{t(`sleeve.${b.key as Sleeve}`)}</span>
            <span className="tabular-nums">{b.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    )}
    ```
  - The source guards missing sleeve buckets. Subsequent real historical/new snapshot browser acceptance passed; see section 4.
- **`app/actions/invest/holdings.ts`**:
  - Verified no changes needed: existing authenticated Server Actions correctly validate against the updated schemas and persist all 4 sleeve values.

---

## 3. Unit Test Coverage & Verification

### 3.1 Test Additions
- **`tests/unit/invest/validators.test.ts`**:
  - `SLEEVES contains all four values in approved order`
  - `holdingCreateSchema accepts all four sleeve values`
  - `holdingCreateSchema defaults sleeve to core when omitted`
  - `updateHoldingSchema accepts all four sleeve values`
  - `holdingCreateSchema rejects an invalid sleeve string`
- **`tests/unit/invest/portfolio.test.ts`**:
  - `SPEC-6: sleeve allocation groups all four sleeves (600 core / 200 ballast / 100 satellite / 100 risk_capital)`
  - `SPEC-6: same asset across core and ballast splits in sleeve allocation but merges in concentration`
  - Production `buildSnapshotPayload()` serializes a single ballast bucket; the test does not cover all four buckets together.
  - The legacy snapshot fixture round-trips a locally constructed object. It does not call the production renderer and is not browser/history acceptance evidence.
- **`tests/unit/invest/planner/plan.test.ts`**:
  - `SPEC-6: core → ballast sleeve change is plan-invariant`: Changing a holding's sleeve from `core` to `ballast` preserves identical `allocationDrift`, `concentration`, `stress`, `riskCapitalPct` (remains 0), `suggestions`, `verdict`, and `totalValueMinor`.
- **`tests/unit/invest/planner/resolve.test.ts`**:
  - `SPEC-6: active ballast holding with missing proxy_class still blocks resolution`: Proves the `proxy_class` gate is independent of sleeve.

### 3.2 Verification Results
1. **Type Checking**:
   ```bash
   pnpm -s tsc --noEmit
   ```
   **Result:** 0 errors (clean exit).
2. **Unit Test Suite**:
   ```bash
   pnpm -s vitest run tests/unit/invest/validators.test.ts tests/unit/invest/portfolio.test.ts tests/unit/invest/planner/plan.test.ts tests/unit/invest/planner/resolve.test.ts
   ```
   **Result:**
   - `tests/unit/invest/validators.test.ts` (14 tests passed)
   - `tests/unit/invest/planner/resolve.test.ts` (9 tests passed)
   - `tests/unit/invest/portfolio.test.ts` (24 tests passed)
   - `tests/unit/invest/planner/plan.test.ts` (27 tests passed)
   - **Total:** 4 test files, 74 passed, 0 failed.

---

## 4. Final acceptance and boundaries (2026-10-20)

- Exact SQL 0010 was separately owner-authorized and committed on 2026-10-18 with unchanged holding contents/count and schema/security metadata. See QA-INVEST-2-live-migration-2026-10-18.md.
- Independent QA report and sanitized run summary: qa-lab commit 757ef83, workspace path qa-lab/projects/jodsa/runs/QA-SPEC6-ballast-live-2026-10-19.md. Actual final runtime exit 0: 33/33 entries (32 behavior cases + setup), zero skipped, unexpected or flaky. Full unit suite: 327 passed / 34 API-level live-RLS skipped; typecheck and lint exit 0.
- Independent PM code/spec and targeted behavioral acceptance: APPROVED, pm-desk commit 33bff60, workspace path pm-desk/projects/jodsa/reviews/SPEC-6-ballast-review-2026-10-20.md.
- QA corrected only global-to-local sign-out in test teardown (cd87d9a), then the whole targeted suite passed; no assertion weakening or app-code change was used.
- Post-mortem: docs/postmortems/QA-INVEST-2-ballast-classification.md.

Production build/deployment, owner portfolio/reclassification, separate DB NULL/unknown/default DML probes and saved historical-plan before/after browser comparison were not executed. Historical plans are protected by unchanged source/write contracts; do not label that a browser mutation test. The broad expense/slip/trip suite was outside this review. No automatic SGOV backfill or planner algorithm change occurred.
