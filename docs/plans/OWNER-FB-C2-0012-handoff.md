# OWNER-FB C2 / migration 0012 handoff — 2026-10-28

## Release gate

Migration 0012 is staged and validated **only on isolated PGlite**. `scripts/apply-0012-approved.cjs` has not been run. The owner must explicitly authorize applying the pinned SQL to live Supabase in chat. **C2 application code must not reach production until 0012 is live.** The existing live test database has no `transactions.holding_id`; the C2 persistence E2E is skipped for that reason. No owner records were used or changed; browser tests used test user A only.

The SQL is additive, in one transaction with `lock_timeout='5s'`. `transfer_needs_to_account` is unchanged. `account_balances()` keeps the old function's SQL/stable/search_path, SECURITY INVOKER, owner and grants. The primary CASE changes only from `income => credit, else => debit` to `income/divest => credit, else => debit`. PGlite compared existing rows, all legacy balances, and function metadata before and after. It also proved invest debit, divest credit, bogus type rejection, and rollback of a buy if its cash insert fails. The live apply helper snapshots *all* account balances in its own transaction and rolls back on any difference.

PGlite was installed one-off outside project dependencies. Reproduce after installing `@electric-sql/pglite` to a temporary folder: set `PGLITE_MODULE_PATH` to that folder's `node_modules/@electric-sql/pglite`, then run `node tests/migrations/0012-pglite.cjs`. The test never connects to Supabase.

## Changed three-type assumptions

| Area | Change / audit result |
| --- | --- |
| `TYPE_STYLE`, `TYPE_TEXT`, `TYPE_STRIPE` | Extended shared `TRANSACTION_TYPE_STYLE`, Home/detail `TYPE_TEXT`, and group `TYPE_STYLE` with transfer-blue invest/divest. There is no `TYPE_STRIPE` mapping in this tree. `TransactionTypeBadge` now displays TrendingUp and `⇄ ลงทุน` / `⇄ ถอนจากพอร์ต`. |
| Balance and “not income means expense” | `lib/money.ts` now credits divest and debits invest explicitly. `/budgets` chart aggregation uses explicit income/expense cases rather than treating every other type as expense. The 0012 SQL changes only the divest branch. |
| `spentForBudget` | Widened row type; existing explicit `type === 'expense'` guard stays. Unit fixture mixes expense, invest and divest. |
| B3 day totals | `/transactions` uses `dayExpenseTotal`, which counts expense only. Unit test covers all five types. |
| B2 Home budget strip | Month expense query and `HomeTodayList` use explicit expense filters; reviewed and kept. Investment cash cannot enter budget status. |
| `/budgets` charts | Query still filters to income/expense; aggregation is now explicit and unit-tested against all five types. |
| Pending transaction preview | `lib/pending-tx.ts`, `lib/quick-add.ts` and `TransactionForm` accept invest/divest and use investment-specific fallback text. Existing detached optimistic submit lifecycle remains intact. |
| Recurring | `lib/validators/recurring.ts` still accepts only income/expense; new unit cases prove invest/divest are rejected. |
| Trip/group and session | `lib/group.ts` widens member types while `groupExpenseTotal` and category breakdown still count only expense. Session expenses are a separate table and do not consume `transactions.type`; no new cash type enters session spending. |
| `account_balances()` consumers | `/dashboard`, `/accounts`, reconcile and `useAccountBalances` continue to call the RPC; they receive the new balance direction from 0012. Reconcile remainder, difference math, stale detection and `reconciled_at` were not changed. |
| Tx Row copy | Shared copy now resolves an optional holding symbol under RLS and uses display name first, else `→ พอร์ตลงทุน · <symbol>` / `← พอร์ตลงทุน · <symbol>`. `/transactions`, Home, accounts and group detail pass the symbol; transaction detail shows the cash direction. |

## C2 behavior and checks

The portfolio tile appears in the transfer destination grid for invest and source grid for divest, including C1 reconcile forms; it disappears from the other grid once selected so portfolio-to-portfolio cannot be submitted. Holding selection is optional; the server action checks that a selected holding belongs to `auth.uid()`. The `/invest` buy form has a collapsed optional cash section with a compact account grid. THB pre-fills the cash amount; USD requires the user to enter it when the section is opened. The `record_buy_with_cash` SECURITY INVOKER RPC verifies holding/account ownership and writes the asset buy and invest cash row in one database operation. Holding detail lists linked cash rows; deleting a buy warns that the cash row remains.

Checks run on 2026-10-28: `tsc --noEmit --incremental false`, Vitest, isolated PGlite proof, production build, C1 E2E with `--repeat-each=5`, A3 and contrast E2E, and C2 UI E2E. Exact final counts are in the implementing commit and user handoff. The C2 persistence browser test is deliberately conditional on the live 0012 column and currently skips; PGlite covers its database atomicity and balance behavior without touching Supabase.

Figma frames: `27:1654` (invest), `27:1816` (divest) in file `85YURQNppODPO2dFxD8O6W`. Each pair in `tests/e2e/evidence/c2-2026-10-28/` is 780×844: left half 390×844 Figma crop at native scale, right half 390×844 app screenshot using test user A. Top and bottom crops are included because the design frames are taller than the requested viewport.
