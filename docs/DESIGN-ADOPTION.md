# Design Adoption Checklist

Track implementation of [07-design.md](source-idea/docs/07-design.md) against built milestones.

## Phase A — Foundations (low risk, whole-app)

- [x] Font: IBM Plex Sans Thai (thai + latin, wt 400/500/600/700) replacing Geist latin-only
- [x] Theme tokens: emerald-brand primary (`oklch 0.55 0.11 162`), warm near-white background, deep-ink dark
- [x] Semantic tokens: `--income` / `--expense` / `--transfer` added to `:root` + `.dark`, mapped in `@theme inline`
- [x] Radius: bumped `--radius` 0.5rem → 0.75rem
- [x] Viewport theme-color updated to match new background tones

## Phase B — Retrofit M1 / M2 screens

- [x] `transactions-client.tsx`: type badge uses `bg-income/expense/transfer` semantic colors; **expense ≠ red**
- [x] `transactions-client.tsx`: amount text uses `text-income / text-expense / text-transfer`
- [x] `dashboard/page.tsx`: month-income uses `text-income`, month-expense uses `text-expense` (not `text-destructive`)
- [x] `slip-confirm-form.tsx`: privacy notice "🔒 อ่านบนเครื่องคุณ · ภาพไม่ถูกอัปโหลด" visible at confirm step
- [x] `transaction-form.tsx`: TypeToggle buttons are color-coded by type when active

## Phase C — M3+ (build to design from the start)

- [x] Budgets page: BudgetBar uses `bg-expense`/`text-expense` (calm coral) for over-budget — not `destructive` red
- [x] Groups page: type-semantic colors throughout (TYPE_STYLE map); group total in `text-expense`
- [x] Guest pay `/pay/<token>`: visible trust note (Info icon + "Recorded, not bank-verified") above upload; footer recordedNote unchanged
- [x] Bottom tab bar: `app-nav.tsx` 4 daily + center (＋) FAB + /more page (commit 582cbda)
- [x] Bottom sheets: Groups add/edit and group-member add use `Sheet side="bottom"` (Dialog removed); app-shell quick-add also Sheet
- [x] `TransactionForm` amount: hero input — ฿ prefix + `text-3xl font-semibold tabular-nums` (40px equivalent)
- [x] M5: charts use `var(--income)` / `var(--expense)` tokens (not generic `chart-*`)

## Rules to enforce forever

- ❌ Transfer badge/amount must never use `text-destructive` or `bg-destructive`
- ❌ Expense must use `text-expense` (coral), not `text-destructive` (red), for ordinary spend
- ❌ No latin-only font — always Thai-capable (IBM Plex Sans Thai)
- ❌ No `tabular-nums` omitted from any amount or balance display
