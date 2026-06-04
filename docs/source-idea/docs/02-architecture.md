# 02 — Architecture & Stack

## System type
Next.js web app, installable **PWA**, multi-tenant. Backend = **Supabase** (Postgres + Auth + RLS + Storage). Deploy on **Vercel + Supabase** (free tier).

## Key architecture principle — client-side slip parsing
Slip parsing happens **100% on-device** in a Web Worker. The raw slip image is **never uploaded** to the server. Only extracted structured data (JSON) is sent. This single decision satisfies three requirements at once:
- **Privacy** — financial slip images never leave the device.
- **"Discard image"** — the image object is dropped right after parsing.
- **Free / no bill** — no per-image paid API cost, so others can use it without costing the owner.

```
┌─────────────────────── CLIENT (browser / installed PWA) ───────────────────────┐
│  Share Target / File Picker                                                      │
│        │ (slip image stays on device)                                            │
│        ▼                                                                          │
│  Slip Parser (Web Worker)                                                         │
│   ├─ preprocess (downscale/grayscale/contrast)                                    │
│   ├─ QR decode  → ref_code + bank_code        (jsQR / @zxing)                     │
│   ├─ tesseract.js (tha+eng) → amount, datetime, counterparty                      │
│   └─ heuristics + confidence → ParsedSlip                                         │
│        │  (image discarded here — only JSON sent)                                 │
│        ▼                                                                           │
│  React confirm/edit form → submit                                                 │
└───────────────────────────────────┬──────────────────────────────────────────-─┘
                                     │ HTTPS (structured data only)
                                     ▼
┌──────────────────────── SUPABASE (Postgres + Auth + RLS + Storage) ─────────────┐
│  Auth (email + OAuth)                                                            │
│  Tables: users, accounts, transactions, groups, recurring_rules,                 │
│          recurring_exceptions, budgets, payment_sessions, session_slips          │
│  RLS: every query tied to user JWT (auth.uid()); guest path = capability token   │
│  Storage: host bank-QR images (served via signed URL)                            │
└──────────────────────────────────────────────────────────────────────────────-─┘
        ▲
        │ Server Actions / Route Handlers (Next.js, supabase-js with user session)
```

> **No cron in MVP.** Recurrence is generated **lazily on read**. Vercel Cron is Phase 2.

## Data flow (normal log)
input (slip parsed client-side **or** manual form) → Zod validate → Server Action → Postgres (RLS) → refetch via TanStack Query.

## State management
- Postgres (Supabase) = source of truth.
- TanStack Query = client cache; **sync-on-load** (open any device → same data). No realtime in MVP.
- **Money stored as integer satang** everywhere; convert to baht only at display (no floats for money).

## Tech stack decisions

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | type-safe across stack, fewer money bugs |
| Framework | Next.js 15 (App Router) + React 19 | chosen stack; Server Actions reduce API boilerplate |
| PWA | Serwist (`@serwist/next`) | best-maintained for App Router; share_target + SW caching |
| Backend/DB | Supabase (Postgres + Auth + RLS + Storage) | all-in-one; RLS = data isolation at DB layer; Realtime ready for Phase 2 |
| Schema/migration | Drizzle ORM + drizzle-kit | TS schema, file-based migrations (RLS policies in migration SQL) — **migrations only** |
| Runtime data access | supabase-js with user session | ensures RLS is actually enforced (never bypass) |
| Validation | Zod | validate forms + every server payload |
| QR decode | jsqr / @zxing/library | decode slip QR on-device, free |
| OCR | tesseract.js (tha+eng, Web Worker) | free, client-side, image stays local |
| Data fetch/cache | TanStack Query | cache + sync-on-load |
| i18n | next-intl | App Router native, th/en |
| Theme | next-themes | light/dark |
| UI | Tailwind + shadcn/ui | fast, clean, portfolio-grade |
| Charts | Recharts | analytics — **lazy-load, M5 only** |
| Testing | Vitest (unit) + Playwright (E2E) | unit on parser/recurrence/money/balance; manual for OCR accuracy |
| Deploy | Vercel + Supabase | chosen; both free tier |

> `promptpay-qr` is **dropped** — the host uploads their own bank QR image instead of the app generating a PromptPay payload.

## Data model (Postgres; RLS owner = `auth.uid()`)

- **users** — id (= auth user), display_name (for income-name heuristic), locale, theme.
- **accounts** — id, user_id, name, bank, qr_image_path (Storage), created_at.
- **transactions** — id, user_id, type `income|expense|transfer`, amount_satang (int), account_id (from), to_account_id (nullable; only for transfer), category, ref_code (text, nullable), bank_code (text, nullable), counterparty, datetime, group_id (nullable), recurring_rule_id (nullable), occurrence_date (nullable), created_at. **UNIQUE(user_id, ref_code)** when not null.
- **groups** — id, user_id, title, note (total/breakdown computed from members).
- **recurring_rules** — id, user_id, type, amount_satang, category, account_id, freq `weekly|monthly|yearly`, interval, by_weekday (int[] e.g. `[2,3,4,6]` Tue–Thu+Sat; Mon=1…Sun=7), start_date, end_date (nullable).
- **recurring_exceptions** — id, rule_id, skipped_date.
- **budgets** — id, user_id, period `day|month`, scope `overall|category`, category (nullable), amount_satang.
- **payment_sessions** — id = unguessable nanoid (capability token), owner, account_id, title, target_amount_satang (nullable), status `open|closed`, created_at.
- **session_slips** — id, session_id, amount_satang, ref_code (nullable), paid_at, confirmed (bool, host-controlled, default false), created_at. **UNIQUE(session_id, ref_code)** when not null.

---

## Resolved Blocker #1 — Guest authorization (Capability-token RLS)

Chosen approach: **Option A — Capability-token RLS.**

- `payment_sessions.id` is an **unguessable nanoid**; knowing the token = authorization (capability URL `/pay/<token>`).
- Guests run as the Supabase **anon** role:
  - `anon SELECT payment_sessions` for that id only → returns host QR (signed URL) + title + target amount.
  - `anon SELECT session_slips` → **denied** (a friend cannot see another friend's slip).
  - `anon INSERT session_slips` → allowed **only while `status='open'`**.
  - **Rate-limit guest inserts at `middleware.ts`** by IP + token (RLS cannot rate-limit).
  - Host (authenticated owner) can SELECT/manage all slips in their own session.
- Host bank QR image lives in **Supabase Storage**, served via a **signed URL** scoped to session lifetime.

## Resolved Blocker #2 — Transaction semantics

- Single `transactions` table; `type ∈ {income, expense, transfer}`.
- **Transfer = ONE row** with `account_id` (from) + `to_account_id` (to). Transfers are **excluded from all income/expense totals and from budgets** (moving your own money is not spending).
- **Account balance** = `Σ income(into) − Σ expense(from) − Σ transfer_out(from) + Σ transfer_in(into)`.
- **Recurring rules = templates** that **lazily create real transaction rows on read** (no cron). Each occurrence is a normal editable/skippable/deletable row tagged `recurring_rule_id` + `occurrence_date`. Skipping writes a `recurring_exceptions` row so it is never regenerated.
- **Budgets aggregate `type='expense'` only.**

## Dedup & rules
- `ref_code` comes primarily from the slip QR; the system **must work when it is null**.
- Hard dedup: `UNIQUE(user_id, ref_code)` / `UNIQUE(session_id, ref_code)` when present.
- **Null-ref soft-dedup:** same account + amount + datetime within N minutes → warn "possible duplicate" (do not hard-block).
- **Income heuristic:** if the OCR'd recipient name fuzzy-matches the user's `display_name`, suggest `type=income`.
- **Always require user confirmation** of parsed values. Log OCR confidence + post-parse correction rate.

## Critical security rule
Runtime user-data access goes **only** through `supabase-js` carrying the user session (so RLS applies). **Drizzle / direct connection / service-role key bypass RLS** and must be used only for migrations and trusted server-only operations — never on a user request path.

## Operational caveat
Supabase free-tier projects **pause after ~7 days of inactivity** and cap DB 500 MB / Storage 1 GB. Fine for portfolio/demo; for real shared use add a keep-alive ping or move to a paid tier.
