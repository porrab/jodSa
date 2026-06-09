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

- [ ] Budgets page: BudgetBar with calm under-budget / clear (not red) over-budget styles
- [ ] Groups page: uses type-semantic colors throughout
- [ ] Guest pay `/pay/<token>`: minimal trust-forward layout; states "recorded, host confirms"
- [ ] Bottom tab bar: redesign `app-nav.tsx` with center Add/Scan button (thumb reach)
- [ ] Bottom sheets: replace centered Dialogs on mobile with Sheet (slide-up)
- [ ] `AmountDisplay` hero component: 40px tabular-nums, ฿ prefix
- [ ] M5: charts use income/expense color tokens (not generic chart-*)

## Rules to enforce forever

- ❌ Transfer badge/amount must never use `text-destructive` or `bg-destructive`
- ❌ Expense must use `text-expense` (coral), not `text-destructive` (red), for ordinary spend
- ❌ No latin-only font — always Thai-capable (IBM Plex Sans Thai)
- ❌ No `tabular-nums` omitted from any amount or balance display
