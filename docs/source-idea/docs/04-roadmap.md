# 04 — Implementation Roadmap

Five ordered milestones, each shippable on its own. Acceptance tests are detailed in [`../prompt.md`](../prompt.md) §6.

## M1 — Foundation + Auth + Manual Logging
**Complexity:** L · **Depends on:** none

**Deliverable:** Next.js 15 + React 19 + Tailwind + shadcn/ui + Serwist PWA shell; Supabase project with full schema + RLS via Drizzle migrations; multi-tenant auth (email + one OAuth provider); providers (theme, i18n, TanStack Query); multi-bank accounts CRUD; manual logging for income/expense/transfer with transfer two-account semantics + account balance; transactions table UI; `lib/money.ts` satang helpers.

**Acceptance:**
- 2 users → data fully isolated (RLS verified, both test + manual).
- All 3 types log; transfer is **not** counted as expense; balance math matches a hand-computed fixture.
- Second device/browser shows the same data after load.

## M2 — Slip Parsing  *(riskiest)*
**Complexity:** L · **Depends on:** M1 · **Skill:** `slip-parser`

**PREREQ:** collect + label **~25 real Thai slips** across SCB / KBank / KTB / BBL / PromptPay (no objective exit without this corpus).

**Deliverable:** `workers/slip.worker.ts` (QR decode + tesseract.js tha+eng + preprocessing + `extract.ts` heuristics + confidence + income-name heuristic); confirm/edit form pre-filled from `ParsedSlip` with low-confidence flags and mandatory confirmation; image never on server + discarded after parse; dedup by ref + null-ref soft-dedup; log confidence/correction.

**Acceptance:**
- ≥ 9/10 slips: amount correct (≥ 90%).
- DevTools Network: **no image upload**, only JSON sent.
- Re-importing the same readable-QR slip is rejected; near-identical null-ref slip triggers soft-dedup warning.

## M3 — Budgets + Recurring + Groups
**Complexity:** M · **Depends on:** M1 · **Skill:** `recurrence-engine`

**Deliverable:** budgets day/month, overall/category, showing +/- vs. actual (**expense only**); recurrence engine **lazy-on-read** (weekly/monthly/yearly + `byWeekday` exclusions + exceptions, Asia/Bangkok, idempotent); grouped expenses (trips) with total + breakdown.

**Acceptance:**
- "travel Tue–Thu+Sat" generates only those weekdays across month/year boundaries; deleting an occurrence + re-reading does not recreate it.
- Monthly day-31 rule skips short months; yearly Feb-29 emits only in leap years.
- Budget over/under correct and **excludes transfers**; group totals correct.

## M4 — Guest Group-Payment
**Complexity:** M · **Depends on:** M2 · **Skill:** `supabase-rls`

**Deliverable:** settings host-QR upload to Storage; create session + show host QR at `/pay/<token>` (no login); friend client-parses slip → POST `{amount, ref_code}` bound to token; host sees entries + confirm/unconfirm; capability-token RLS (Pattern B) + middleware rate-limit; session persists across browser restart (token in URL + localStorage).

**Acceptance:**
- Logged-out link → pay + upload works; host sees entry (unconfirmed) and can toggle confirm.
- A different anon client cannot read the session's slips; insert into a closed session is rejected.
- Guest POST past the limit is throttled; closing/reopening the guest browser stays in the same session.

## M5 — Polish + i18n + Theme + Analytics + Share Target
**Complexity:** M · **Depends on:** M1–M4

**Deliverable:** full th/en (next-intl) + light/dark (next-themes) app-wide; dashboard summary + income/expense charts (lazy Recharts); PWA install + Web Share Target (Android) + in-app upload (iOS); account deletion (cascade) in settings.

**Acceptance:**
- Language/theme switch updates the whole app; no untranslated strings on core screens.
- Install PWA on Android + share a slip from the gallery → lands parsed on `/import`; iOS upload button does the same.
- Recharts not in the M1 route bundle; dashboard loads fast.
- Delete account removes all the user's data and signs them out.

---

## Phase 2 (not built now)
- Supabase Realtime live-sync (Notion-style).
- Line OA image send.
- BYO vision API key (premium accuracy).
- CSV export.
- Vercel Cron for budget/recurring notifications.
