# Home budget and populated responsive matrix — 2026-11-20

Implementation complete; Claude visual review is pending. The original full E2E was interrupted after 75 verified passes of 201 discovered tests; the remaining 126 were resumed, with 121 passed / 4 skipped / 1 failed. A focused recheck passed but the original functional failure remains open. The owner's actual data was not accessed. Final captures were regenerated on 2026-11-21; the requested task directory date is retained.

## Root cause and mechanism

Home fixed its budget section at 134px and stretched its links with `h-full`. Four budget rows could overflow after wrapping; the no-budget link instead stretched into a band. The over-budget branch used `-my-4` against a parent with `pt-4 pb-2`, exceeding bottom padding by 8px. Amounts could not wrap, and long category titles had no truncation boundary. Copy contained chevrons alongside icons and two independently rendered missing-value messages.

## Fixes

| Item / page | Commit | Change |
| --- | --- | --- |
| HB-1 | 45ceba6 | Content-sized section and links; retain shrink protection and progress-fill height. |
| HB-2 | a1365c6 | Match blush compensation to actual top/bottom padding; reset on desktop. |
| HB-3 | 3346322 | Wrap amounts; constrain/truncate category title. |
| HB-4 | 05ceb81 | Remove text chevrons in th/en; select one missing-value message. |
| HB-5 Home | f0d602f | Constrain the hero flex item and scale long totals; ordinary totals retain 36px and existing tests. |
| HB-5 Budgets | f5c74cc | Contain blush on its button; wrap amounts and truncate category. |
| HB-5 Transactions | e061999 | Constrain long group chips; remove overflowing day-header negative margins. |
| HB-5 Plan | 2128770 | Wrap saved-plan date and verdict at 320px. |
| HB-5 guard | b325aa3 | Explicit `JODSA_UX_MATRIX=1` disposable-user matrix. |

## Reproduction and evidence

Run `JODSA_UX_MATRIX=1 JODSA_E2E_PRODUCTION=1 pnpm exec playwright test ux-populated-matrix.spec.ts --no-deps --update-snapshots=none` (set environment variables using the shell's syntax). Empty browser storage and `--no-deps` keep the matrix away from canonical A/B. Each execution creates exactly one guarded `qa-matrix-<timestamp>@jodsa.test` identity, uses its returned ID exclusively, and deletes that ID in `finally`; Auth lookup must then return 404. Ordinary Honey/full-suite gates retain their existing canonical fixtures.

The fixture has four accounts (long name, million-baht balance), 29 transactions over five date buckets including today (income/expense/transfer, long notes and counterparties), six grouped transactions, three recurring rules, a trip with six named participants and pending/confirmed slips, three THB/USD holdings including priced/unpriced/long-name cases, and one plan generated through the UI. One existing recurrence becomes due after budget captures to populate `/recurring/confirm`.

Home/Budgets each capture no-budget, under, near (95%), over (125%) and category-only long-name states. Category-only matters because Home prefers overall budgets. All other signed-in routes, detail/edit sheets and the saved-plan result are included: 28 page/state combinations × three light widths (320/375/414) plus dark 375, height 812 = 112 captures, exported as 28 contact sheets and 28 dark PNGs.

Rules inspect the real viewport before temporarily expanding main's inner scrollport for full-page export. They fail on root overflow, visible text overflow without ellipsis, fixed-height visible content overflow (CSS Typed OM), and sibling-section intersection. Actual ellipses are reported with full text. Sharp reuses Next's installed dependency. No image was opened by Codex.

Discovery run one stopped after 64 captures because trip detail has nested main landmarks; the harness now scopes the outer main. Cleanup still verified 404. It found Home 5, Budgets 20 and Transactions 39 violations. The next complete run found four plan-history violations (Plan 2, result background 2), all at light 320. These are 68 observed instances across two discovery runs, not a same-coverage baseline. Raw selectors/text survive in `rules-before.json` and `rules-plan-before.json`.

Final matrix: 112 captures, 0 rule failures, 1,152 report-only ellipses; disposable deletion verified 404. TypeScript exit 0; Vitest 422 passed / 34 skipped (existing optional RLS unit suite); production build exit 0 with existing unused-import warnings; Honey 28/28 with updates disabled. Only light/dark Home and light/dark add-slip baselines changed intentionally. E2E combined unique coverage: 196 passed / 4 skipped / 1 failed across the interrupted original and targeted continuation. The onboarding recheck passed 1/1 without a fix; its original failure is retained. No second full invocation was started.

## Why it escaped / remaining decision

Earlier visual runs used test A with no budgets and sparse data. They did not exercise four budget rows, long names, million-baht totals or populated plan history. Pre-HB CSS was diagnosed from source rather than separately rebuilt for a baseline run. The repeatable matrix now covers the original conditions. Existing Home assertions were not changed or weakened.

Product decision: Home counts today (`daysInMonth - day + 1`); Budgets excludes it (`lastDay - date`). On 2026-11-20 they show 11 and 10 days respectively. No arithmetic was changed to guess a convention. Claude owns independent image review. No migrations or push.

## Review coordinates

Code: `dfe4dd7..b325aa3`, 14 files, 340 insertions / 25 deletions including four binary baselines. Verify section/strip padding, mutually exclusive missing-value copy, normal/long total typography, BudgetBar's single caller, chip/header containment, plan-history wrapping, and returned-ID cleanup / failing rule assertions. Evidence: workspace-relative `design-studio/reviews/jodsa/2026-11-20-populated/index.md`.

## Unresolved functional gate finding

The E2E continuation had one failure in m9-onboarding.spec.ts:63 (assertion at line 86). After creating the first account and submitting the first transaction, the save dialog briefly entered data-state=closed and then reopened; toBeHidden timed out after 20 seconds. A focused unchanged-test recheck passed 1/1. This does not establish a fix or a pre-existing cause, so the original failure remains in the gate count. AppShell, FirstAccountSheet, account actions and TransactionForm have no diff in dfe4dd7..b325aa3. Root cause remains unverified; no timing allowance, assertion, skip or application save path was changed to hide it.

Original failure text and result are retained in remaining-e2e.json; recheck in onboarding-recheck.json. Local original trace/error context remain under project/jodsa/tests/e2e/.results/m9-onboarding-M9-onboard-1-8697a-hen-first-log-—-no-dead-end-chromium/. No image was opened.
