# QA-REG-2: classification of the 41 prior failures

Source: `../qa-regression-2026-10-30/full-final/results.json` and failure screenshots. UI commit evidence was checked with `git log -S`/`git show` on the named component. The table classifies the *first reported failure* in each test: 34 TEST-DRIFT, 7 ORDER/FIXTURE, 0 confirmed product bugs. Later assertions are verified by rerun.

| # | Spec | Test | Class | Evidence |
| ---: | --- | --- | --- | --- |
| 1 | ballast.spec.ts | SPEC6-RLS B cannot read/update/delete A ballast or forge ownership; A row and ledger survive | ORDER/FIXTURE | B has no account; FirstAccountSheet covers the holding row (failure screenshot 2). |
| 2 | field-2-counterparty-capture.spec.ts | QA-FIELD-2 counterparty: transfers/merchants pre-fill, bills stay empty (no sender) | ORDER/FIXTURE | Prior trace: after setInputFiles the empty dropzone remained for 240 s. Isolated production repro with networkidle before upload reached confirm 3/3 with amount 40.00. |
| 3 | honey-visual.spec.ts | light sessions | ORDER/FIXTURE | Actual image contains stale ทริปเชียงใหม่ session; resetAllUserData omits payment_sessions. Actual/expected/diff attached below; focused production-build rerun passes after scoped session cleanup. |
| 4 | invest-m1.spec.ts | QA-M1-5 /invest renders in dark theme and in English | TEST-DRIFT | 8cb5288 replaced invest navigation buttons with role=tab. |
| 5 | invest-m3.spec.ts | QA-M3-1 dashboard totals/cost/P&L, allocation and concentration match the fixture | TEST-DRIFT | 8cb5288 added allocation bars, so 93.9% appears in three places; concentration value must be scoped. |
| 6 | invest-m3.spec.ts | QA-M3-4 two holding rows of the same asset aggregate before concentration | TEST-DRIFT | 8cb5288 added allocation bars, so 61.0% appears in three places; concentration value must be scoped. |
| 7 | invest-m5.spec.ts | QA-M5-8 the Plan tab renders in English and in dark theme, disclaimer intact | TEST-DRIFT | 8cb5288 replaced invest navigation buttons with role=tab. |
| 8 | m1-1-signup-journey.spec.ts | signup → account → expense → listed with updated balance | TEST-DRIFT | 4e9e9c9 translated AccountQuickCreateForm Select options (KBank is กสิกรไทย); 8cb5288 changed the full account form to chips. |
| 9 | m1-2-isolation.spec.ts | M1-S2 user B sees none of user A data | TEST-DRIFT | 4e9e9c9 translated AccountQuickCreateForm Select options (SCB is ไทยพาณิชย์); 8cb5288 changed the full account form to chips. |
| 10 | m1-3-balance-sync.spec.ts | M1-S3 transfer/balance hand fixture | TEST-DRIFT | 4e9e9c9 translated AccountQuickCreateForm Select options (SCB is ไทยพาณิชย์); 8cb5288 changed the full account form to chips. |
| 11 | m2-s5-accuracy.spec.ts | M2-S5 amount correct on ≥9/12 real slips; counterparty populated where expected (M2-1 + M2-9b) | ORDER/FIXTURE | Harness causes: three comma-formatted amounts misread by parseFloat (8cb5288), and swallowed uploads before hydration. After harness fixes, 10/12 pass. The two TTB bill misses are the explicitly accepted `QA-M2-1` limitation in `REVIEW-INBOX.md` (Known limitations), not a newly confirmed bug. |
| 12 | m2-slip-import.spec.ts | M2-S1 parsed slip pre-fills confirm form; nothing saves until confirmed | TEST-DRIFT | 8cb5288 AmountInput displays grouping separators: 1,250.00. |
| 13 | m3-budgets.spec.ts | M3-S1 budget 10,000 with 7,000 expense + 5,000 transfer → 3,000 remaining | TEST-DRIFT | 64bc644 changed Budgets action to addShort=เพิ่ม. |
| 14 | m3-groups.spec.ts | M3-S3 group total sums expense members only; a transfer member is excluded | TEST-DRIFT | 8cb5288 changed group candidate from p-3 wrapper + direct action to row button opening action sheet. |
| 15 | m3-recurring.spec.ts | M3-S2 deleting a generated occurrence is not recreated on reload | TEST-DRIFT | 64bc644 changed Recurring action to addShort=เพิ่ม. |
| 16 | m4-guest-pay.spec.ts | M4-S1 host creates session; logged-out guest sees QR and submits a slip; host confirms | TEST-DRIFT | 64bc644 changed Sessions action to addShort=เพิ่ม. |
| 17 | m5-settings.spec.ts | M5-S1 theme + language switch apply app-wide and persist across reload | ORDER/FIXTURE | Fresh prefs user has zero accounts; FirstAccountSheet obscures Settings. Seed an A/B-only account. |
| 18 | m5-settings.spec.ts | M5-S2 dashboard renders the 6-month income/expense chart (lazy Recharts) | TEST-DRIFT | 2af3734 moved six-month Recharts from Home to Budgets; assert chart on /budgets. |
| 19 | m5-settings.spec.ts | delete account → redirected to login, auth user gone, zero rows remain | TEST-DRIFT | 4e9e9c9 translated first-account quick-create options; shared createAccount helper expected English KBank. |
| 20 | m7-dup-override.spec.ts | QA-M7B-1 duplicate ref_code → J2 override saves a new row (not a hard block) | TEST-DRIFT | 8cb5288 AmountInput displays grouping separators: 1,250.00. |
| 21 | m7-edit-transaction.spec.ts | QA-M7A-1 create → edit amount + counterparty → change persists on reload | TEST-DRIFT | b79aff1 added daily expense totals; 100.00 is present twice; scope assertion to transaction row. |
| 22 | m7-recurring-deducts.spec.ts | QA-M7D-1 a rule due today deducts exactly once on dashboard load; balance drops; budget counts it | TEST-DRIFT | 64bc644 changed Recurring action to addShort=เพิ่ม. |
| 23 | m9-home-restructure.spec.ts | M9-home-1 Home has no embedded quick-add; FAB sheet + today list + budget work, and NO chart renders | TEST-DRIFT | 8cb5288 AmountInput caption is จำนวนเงิน, not จำนวนเงิน (บาท). |
| 24 | m9-home-restructure.spec.ts | OWNER-FB A2 AccountGrid exposes six stable balance tiles and dims the transfer source | ORDER/FIXTURE | Seeds -500+1,200+100 on cash account; arithmetic gives ฿800, not ฿700. |
| 25 | m9-onboarding.spec.ts | M9-onboard-1 fresh user: FirstAccountSheet guides the first account, then first log — no dead end | TEST-DRIFT | 4e9e9c9 translated AccountQuickCreateForm Select options (KBank is กสิกรไทย); 8cb5288 changed the full account form to chips. |
| 26 | m9-onboarding.spec.ts | M9-onboard-5 batch import with zero accounts → each card offers inline "+ สร้างบัญชี" (prod build) | ORDER/FIXTURE | Batch review has collapsed card list; first select a parsed card before checking inline account create (6e8d136 queue interaction). |
| 27 | ownerfb-a1-slip-queue.spec.ts | OWNER-FB A1 manual fallback saves one failed item and warns before discarding the other | TEST-DRIFT | 8cb5288 AmountInput caption is จำนวนเงิน, not จำนวนเงิน (บาท). |
| 28 | review-20261010.spec.ts | QA-INVEST-1 full fractional sale survives reload (with FX) | TEST-DRIFT | 8cb5288 replaced asset trade Select with ซื้อ/ขาย chips. |
| 29 | review-20261010.spec.ts | QA-INVEST-1 full fractional sale survives reload (missing valuation FX) | TEST-DRIFT | 8cb5288 replaced asset trade Select with ซื้อ/ขาย chips. |
| 30 | review-20261010.spec.ts | QA-INVEST-1 partial, closed missing-FX/null-proxy, and reopened positions reach the real planner | TEST-DRIFT | 8cb5288 replaced asset trade Select with ซื้อ/ขาย chips. |
| 31 | review-20261010.spec.ts | DS-1 keyboard focus appears without a shadow transition | TEST-DRIFT | 64bc644 changed Budgets action to addShort=เพิ่ม. |
| 32 | review-20261010.spec.ts | DS-1 real budget progress scales to 50% and disables motion when requested | TEST-DRIFT | 64bc644 changed Budgets action to addShort=เพิ่ม. |
| 33 | spec5-optimistic.spec.ts | SPEC5-F6 — optimistic save: provisional row paints subdued & not tappable, balance frozen, then resolves | TEST-DRIFT | 8cb5288 AmountInput caption is จำนวนเงิน, not จำนวนเงิน (บาท). |
| 34 | spec5-optimistic.spec.ts | SPEC5-1 — forced failure: row rolls back, error toast fires, sheet reopens with EVERY field intact (datetime included), balance frozen | TEST-DRIFT | 8cb5288 AmountInput caption is จำนวนเงิน, not จำนวนเงิน (บาท). |
| 35 | spec5-optimistic.spec.ts | SPEC5-scope — editing an existing transaction still BLOCKS (no optimism): sheet stays open on a disabled saving button, no provisional row | TEST-DRIFT | 8cb5288 changed detail SheetTitle from generic title to shownName (saved counterparty ร้านเดิม QA). |
| 36 | spec5-visual.spec.ts | F2 — sheet amount field has a visible affordance and focal size in light | TEST-DRIFT | 8cb5288 changes AmountInput from a muted well to a bottom hairline and shortens its caption to จำนวนเงิน. The test now checks the rendered hairline and focal font size. |
| 37 | spec5-visual.spec.ts | F2 — sheet amount field has a visible affordance and focal size in dark | TEST-DRIFT | Same 8cb5288 AmountInput change; the dark test checks the hairline and focal font size. |
| 38 | spec5-visual.spec.ts | SPEC5-mobile — mobile viewport (390×844): FAB opens the only add sheet, amount affordance + empty prompt render, no 12px on Home | TEST-DRIFT | Same 8cb5288 AmountInput change; the mobile test checks the rendered hairline. |
| 39 | trip-1-create-share.spec.ts | TRIP-1 trip create hides account/QR/target; share card shows the absolute URL | TEST-DRIFT | 64bc644 changed Sessions action to addShort=เพิ่ม. |
| 40 | trip-5-owner.spec.ts | TRIP-5 owner acts in-app (add / send / confirm) then close-gates anon, reopen, delete | TEST-DRIFT | 64bc644 changed Sessions action to addShort=เพิ่ม. |
| 41 | trip-7-regression-ux.spec.ts | TRIP-7 create dialog: required asterisks present, no optional text (collect + trip) | TEST-DRIFT | 64bc644 changed Sessions action to addShort=เพิ่ม. |

## Visual review evidence

- [Expected](light-sessions-expected.png) · [Actual](light-sessions-actual.png) · [Diff](light-sessions-diff.png). Baseline was not updated.
- The extra trip card is an A-owned session fixture left by the previous suite run, so this is ORDER/FIXTURE rather than a confirmed product bug.

## OCR environment

The production build reads `.env.local` with Supabase keys only. `lib/slip/parse-image.ts` uses local `tesseract.js` (Thai/English) and does not read an OCR provider key. Missing provider configuration is not the cause.



## Minimal OCR repro

[One-off A-session script](ocr-minimal-repro.cjs) and [result](ocr-minimal-repro.jsonl): 1779600297906.jpg reached confirm with amount 40.00 in 3/3 attempts after waiting for network idle. The prior [trace frame](field2-prior-upload-frame.jpeg) shows the empty dropzone after its swallowed input event. No OCR provider env/key exists or is required by the local Tesseract pipeline.



## Existing accepted TTB bill extraction limitation

[One-off A-session repro](ocr-ttb-bill-repro.cjs) and [result](ocr-ttb-bill-repro.jsonl): both TTB bill fixtures reach confirm with no console error, but amount is blank (expected 30 and 60). No slip was saved. `REVIEW-INBOX.md` already records this exact TTB bill amount case under "Known limitations (slip parser) — accepted, deferred realities · not live bugs" (former `QA-M2-1`), including the Tesseract root cause and manual-entry fallback. No duplicate OPEN item is filed.



## Focused production-build verification

The focused rerun ([focused-ocr-results.json](focused-ocr-results.json)) passed 4/4 including setup: field-2 parsed 13/13; M2-S5 amount accuracy 10/12 and counterparty 2/2; light-sessions matched the unchanged baseline. The two TTB bill misses remain the documented accepted limitation.
