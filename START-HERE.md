# START HERE

This project was scaffolded by Dev Kit from the idea-forge blueprint in `docs/source-idea/`.
Nothing is implemented yet — the structure, role, and skills are in place.

## You are the dev session for: JodSa — Personal Finance Tracking PWA

Your role and full context are in [CLAUDE.md](CLAUDE.md) (auto-loaded). In short: you're a
**Fullstack Engineer** (Next.js 15 + React 19 + Supabase) building a **multi-tenant, privacy-first
PWA** whose headline feature — reading Thai bank slips — runs **client-side in a Web Worker** (the
image never leaves the device). Stakes: **portfolio piece intended for real multi-tenant use →
production-grade rigor** (RLS isolation, money-as-satang, tests).

## Build Order

Build milestones **strictly in order**. Don't start one until the previous meets its acceptance criteria.

1. **M1: Foundation + Auth + Manual Logging** — Next.js + Supabase shell, full schema + RLS, multi-tenant auth, multi-bank accounts CRUD, manual income/expense/transfer with balances.
   - Acceptance: users A & B fully isolated (B sees **zero** of A's rows — automated RLS check + manual); transfer excluded from income/expense totals while both balances change and `balance = Σincome − Σexpense − Σtransfer_out + Σtransfer_in` matches a hand fixture; second device shows the same data after load.
2. **M2: Slip Parsing** *(riskiest)* — Web Worker QR + tesseract.js (tha+eng), `extract.ts` heuristics, confidence, mandatory confirm form.
   - Acceptance: amount correct on **≥ 9 of any 10** slips; DevTools Network shows **no image upload** (JSON only); duplicate readable-QR import rejected by `UNIQUE(user_id, ref_code)`, null-ref near-dup triggers soft-dedup warning.
   - **PREREQ:** collect + label **~25 real Thai slips** (SCB/KBank/KTB/BBL/PromptPay) first — without the corpus there's no objective exit.
3. **M3: Budgets + Recurring + Groups** — budgets (+/- vs. actual, expense only), lazy-on-read recurrence engine, groups (trips).
   - Acceptance: weekly rule `[2,3,4,6]` emits only Tue/Thu/Sat across month & Dec→Jan boundaries and deleted occurrences aren't recreated; monthly day-31 skips short months, yearly Feb-29 only in leap years; budget 10,000 with 7,000 expense + 5,000 transfer → **3,000 remaining**; group total = sum of members.
4. **M4: Guest Group-Payment** — host QR upload, `/pay/<token>` guest page, capability-token RLS + middleware rate-limit, host confirm/unconfirm.
   - Acceptance: logged-out `/pay/<token>` renders host QR + title and records an uploaded slip (unconfirmed); a different anon client is **denied** reading `session_slips` and rejected inserting into a closed session; over-limit POSTs are **throttled**; reopening the browser stays in-session.
5. **M5: Polish + i18n + Theme + Analytics + Share Target** — full th/en + light/dark, dashboard charts (lazy Recharts), PWA install + Web Share Target (Android) / in-app upload (iOS), account deletion (cascade).
   - Acceptance: toggling language/theme updates the whole app with no untranslated core strings; Android share-from-gallery lands on `/import` parsed and iOS upload does the same; charts render and Recharts is **not** in the M1 route bundle; account delete removes all rows (cascade) and signs the user out.

## Before You Start M1

- Read [CLAUDE.md](CLAUDE.md) (your role + project context + the "Watch Out For" risk list).
- Skim [docs/source-idea/prompt.md](docs/source-idea/prompt.md) for the full architecture, data model, and rationale (prompt.md is authoritative; the `docs/` files add detail).
- Read [.claude/skills/supabase-rls/SKILL.md](.claude/skills/supabase-rls/SKILL.md) before writing any schema/policy — RLS is M1's hardest part and the project's security boundary.

## First Action

Initialize the Next.js app, then resolve and pin the dependency set — **do not write feature code yet**:

```bash
npx create-next-app@latest .        # TypeScript, App Router, Tailwind
# then add (React 19 / Next 15-compatible versions):
#   @serwist/next  @supabase/supabase-js @supabase/ssr  drizzle-orm drizzle-kit
#   zod  @tanstack/react-query  next-intl  next-themes  tesseract.js  jsqr (or @zxing/library)
#   recharts (lazy/M5)  vitest  @playwright/test  + shadcn/ui init
cp .env.example .env.local           # fill in Supabase keys
```

Then **STOP and confirm the resolved dependency list + versions with the user before any M1 feature code** (the blueprint's First Action #4 — sanity-check React 19 peer-dep compatibility first). After that, build M1 per the architecture in `docs/source-idea/`.

When M1 is done, it can be reviewed by **pm-desk** against the same blueprint.
