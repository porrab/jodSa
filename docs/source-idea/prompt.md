# PROJECT: JodSa — Personal Finance Tracking PWA

## 1. Context

JodSa is a low-friction personal finance tracking Progressive Web App. Its headline feature: the user shares a Thai bank/PromptPay slip image from their phone gallery, and the app reads it **entirely on-device** (QR decode + OCR in a Web Worker) to auto-fill a transaction — the raw image is never uploaded and is discarded right after parsing. Users log three things (income, expense, money-transfer), split money across multiple bank accounts, set daily/monthly budgets with +/- tracking, define recurring expenses (subscriptions + weekly costs with per-weekday exclusions), group transactions (e.g. a trip), and run a guest "split-the-bill" session where friends open a link, see the host's bank QR, and upload their payment slip to be recorded automatically.

**Who it's for:** General users in Thailand, starting with the builder themselves. It is a portfolio piece intended to be shared and actually used by others. Multi-tenant with real login; each user's data is fully isolated. THB only. Thai/English UI. Light/dark theme.

**Success criteria**
- Log one item from a slip in **< 10 seconds** (share → auto-filled form → confirm).
- Read the **amount** off a Thai slip correctly **≥ 90%** of the time (user can always edit).
- A brand-new user can sign up and log their first item in **< 2 minutes**, with **zero server-side cost** for slip reading.
- Set a monthly budget and immediately see **+/- vs. real spend**.
- Open on phone and PC and see the **same data** (sync-on-load).

**Explicit non-goals**
- ❌ No bank-API / statement auto-pull — slips only.
- ❌ No real-time / live collaborative sync in MVP (sync-on-load only).
- ❌ No paid server-side AI vision in MVP (free, client-side parsing only).
- ❌ No multi-currency — THB only.
- ❌ Not an investment / trading app.
- ❌ Do **not** store slip images — parse then discard.
- ❌ Not offline-capable — online-only, installable shell, **no offline write queue**.
- ❌ Guest payments are **RECORDED, not VERIFIED** — there is no bank verification API; the host manually confirms/unconfirms each recorded slip.

## 2. Tech Stack

Pin versions to a mutually compatible set (React 19 + Next 15 ecosystem). Verify peer-deps at install; if a library is incompatible with React 19, ask before substituting.

- **Language:** TypeScript (strict mode).
- **Framework:** Next.js 15 (App Router) + React 19. Server Actions for mutations.
- **PWA:** Serwist (`@serwist/next`) — service worker, manifest, **Web Share Target** (Android/installed-PWA only; iOS falls back to an in-app upload button).
- **Backend:** Supabase — Postgres + Auth (email + OAuth) + **Row Level Security (RLS)** + Storage.
- **Schema/migrations:** Drizzle ORM + drizzle-kit — **MIGRATIONS ONLY**. RLS policies live in migration SQL files. Runtime user-data access goes through `supabase-js` carrying the user's session so RLS is enforced. **Never** use Drizzle/direct-connection/service-role for user-data reads or writes at runtime.
- **Validation:** Zod (forms + every server payload).
- **QR decode:** `jsqr` or `@zxing/library` (client-side).
- **OCR:** `tesseract.js` with `tha`+`eng` traineddata, run in a **Web Worker**. Cache WASM + traineddata in the service worker.
- **Data fetching/cache:** TanStack Query (sync-on-load).
- **i18n:** `next-intl` (th/en).
- **Theme:** `next-themes` (light/dark).
- **UI:** Tailwind CSS + shadcn/ui.
- **Charts:** Recharts — **lazy-loaded, M5 only** (do not ship in M1 bundle).
- **Money:** stored as **integer satang** everywhere; convert to baht only at display.
- **Testing:** Vitest (unit: slip parser, recurrence engine, money helpers, transfer/balance math) + Playwright (a few E2E happy paths).
- **Deploy:** Vercel + Supabase (both free tier). `promptpay-qr` is **NOT used** — the host uploads their own bank QR image.

> ⚠️ **Operational caveat:** Supabase free-tier projects **pause after ~7 days of inactivity** and cap DB at 500 MB / Storage at 1 GB. Fine for portfolio/demo. For real shared use, add a keep-alive ping or move to a paid tier.

## 3. File Structure

Create exactly this tree.

```
jodsa/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx              # email + OAuth login
│   │   └── signup/page.tsx             # registration
│   ├── (app)/
│   │   ├── dashboard/page.tsx          # overview, budget +/-, charts (charts M5)
│   │   ├── transactions/page.tsx       # 3-type log table, filter, link to group
│   │   ├── accounts/page.tsx           # multi-bank accounts + per-account QR upload
│   │   ├── recurring/page.tsx          # subscriptions + weekly rules w/ weekday exclusions
│   │   ├── budgets/page.tsx            # daily/monthly budgets + actual vs budget
│   │   ├── groups/[id]/page.tsx        # a group (trip): total + breakdown
│   │   └── settings/page.tsx           # language, theme, display name, account delete
│   ├── pay/[token]/page.tsx            # GUEST page — no login, capability token
│   ├── import/page.tsx                 # share-target + manual upload landing → parse
│   ├── api/
│   │   └── sessions/[token]/slips/route.ts  # guest slip POST (rate-limited)
│   ├── manifest.ts                     # PWA manifest incl. share_target (POST, files)
│   ├── layout.tsx                      # providers: theme, i18n, TanStack Query
│   └── globals.css
├── middleware.ts                       # rate-limit guest slip inserts by IP+token
├── components/
│   ├── ui/                             # shadcn/ui primitives
│   ├── transaction-form.tsx            # confirm/edit parsed or manual entry
│   ├── slip-dropzone.tsx               # file picker + share-target receiver
│   ├── budget-bar.tsx                  # +/- indicator
│   ├── recurring-form.tsx              # freq/interval/byWeekday editor
│   └── charts/                         # Recharts wrappers (lazy)
├── lib/
│   ├── slip/                           # uses skill: slip-parser
│   │   ├── extract.ts                  # QR+OCR field extraction + heuristics
│   │   └── types.ts                    # ParsedSlip, FieldConfidence
│   ├── recurrence/                     # uses skill: recurrence-engine
│   │   └── recurrence.ts               # rule → occurrences (lazy, idempotent)
│   ├── money.ts                        # satang<->baht, formatTHB, parse input
│   ├── supabase/
│   │   ├── server.ts                   # server client w/ user session (RLS)
│   │   └── client.ts                   # browser client w/ user session (RLS)
│   └── validators/                     # Zod schemas (transaction, account, etc.)
├── db/
│   ├── schema.ts                       # Drizzle schema (definition only)
│   └── migrations/                     # drizzle-kit SQL + RLS policy files
├── workers/
│   └── slip.worker.ts                  # runs QR decode + tesseract.js off main thread
├── messages/
│   ├── th.json
│   └── en.json
├── tests/
│   ├── unit/                           # vitest: parser, recurrence, money, balance
│   └── e2e/                            # playwright: login→log, budget, guest pay
├── .claude/
│   └── skills/
│       ├── slip-parser/
│       │   ├── SKILL.md
│       │   ├── extract.ts
│       │   ├── samples/                # labeled sample structures (no real PII)
│       │   └── test-cases.md
│       ├── recurrence-engine/
│       │   ├── SKILL.md
│       │   ├── recurrence.ts
│       │   └── test-cases.md
│       └── supabase-rls/
│           ├── SKILL.md
│           └── policies.sql
├── .env.example                        # SUPABASE_URL, SUPABASE_ANON_KEY, etc.
├── next.config.ts
├── drizzle.config.ts
├── package.json
└── README.md
```

> There is **no `app/api/cron`** in MVP. Recurrence is generated **lazily on read**. Cron is Phase 2.

### Data model (Postgres; RLS owner = `auth.uid()`)

- `users` — id (= auth user), display_name (for income-name heuristic), locale, theme.
- `accounts` — id, user_id, name, bank, qr_image_path (Storage), created_at.
- `transactions` — id, user_id, **type** `income|expense|transfer`, **amount_satang** (int), account_id (from), **to_account_id** (nullable; set only for `transfer`), category, ref_code (text, nullable), bank_code (text, nullable), counterparty, datetime, group_id (nullable), recurring_rule_id (nullable), occurrence_date (nullable), created_at.
  - **UNIQUE(user_id, ref_code)** when ref_code is not null.
- `groups` — id, user_id, title, note. (Total/breakdown computed from member transactions.)
- `recurring_rules` — id, user_id, type, amount_satang, category, account_id, **freq** `weekly|monthly|yearly`, interval (int), **by_weekday** (int[] e.g. `[2,3,4,6]` = Tue–Thu + Sat; Mon=1…Sun=7), start_date, end_date (nullable).
- `recurring_exceptions` — id, rule_id, skipped_date. (A generated occurrence the user deleted/skipped; never regenerate it.)
- `budgets` — id, user_id, **period** `day|month`, **scope** `overall|category`, category (nullable), amount_satang.
- `payment_sessions` — **id = unguessable nanoid (the capability token)**, owner (user_id), account_id, title, target_amount_satang (nullable), status `open|closed`, created_at.
- `session_slips` — id, session_id, amount_satang, ref_code (nullable), paid_at, **confirmed** (bool, host-controlled, default false), created_at.
  - **UNIQUE(session_id, ref_code)** when ref_code is not null.

**Semantics that must be honored:**
- A **transfer** is ONE row (`account_id` → `to_account_id`). Transfers are **excluded from all income/expense totals and from budgets**.
- **Account balance** = `Σ income(into acct) − Σ expense(from acct) − Σ transfer_out(from acct) + Σ transfer_in(into acct)`.
- **Budgets** aggregate `type='expense'` **only**.
- **Recurring rules** are templates that **lazily create real `transactions` rows** when a date range is read. Each occurrence is a normal, editable/skippable/deletable row tagged with `recurring_rule_id` + `occurrence_date`. Skipping writes a `recurring_exceptions` row so it is never regenerated.
- **ref_code** comes primarily from the slip's QR. The system **must work when ref_code is null** (QR unreadable). For null-ref rows, run a **soft-dedup**: if a new transaction matches an existing one on account + amount + datetime within N minutes, warn "possible duplicate" (do not hard-block).

## 4. Skill Definitions

Write each of these three files verbatim to its path under `.claude/skills/`.

---

### `.claude/skills/slip-parser/SKILL.md`

```markdown
---
name: slip-parser
description: >
  Parse a Thai bank/PromptPay payment slip image entirely client-side into a
  structured transaction. Use whenever implementing or modifying the slip-reading
  pipeline — QR decoding, tesseract.js OCR (tha+eng), field extraction heuristics,
  confidence scoring, image preprocessing, or the income-by-recipient-name guess.
  Do NOT use for server-side parsing, paid vision APIs, or non-Thai receipts.
---

# Slip Parser

Turn a slip image into `ParsedSlip` **without ever uploading the image**. All work
happens in `workers/slip.worker.ts`; only the resulting JSON leaves the device.

## Pipeline (in order)

1. **Preprocess** (canvas, in-worker): downscale longest edge to ~1600px, convert
   to grayscale, increase contrast. Optionally crop to the central region for the
   amount. Large phone photos must be shrunk before OCR or it is slow and memory-heavy.
2. **QR decode** (`jsqr` / `@zxing/library`): Thai slips carry a verification QR.
   It reliably yields a **transaction reference (`ref_code`)** and often a **bank
   code (`bank_code`)**. Treat the QR payload as the source of truth for `ref_code`.
   ⚠️ The QR does **NOT** reliably contain the amount — do not depend on it for amount.
3. **OCR** (`tesseract.js`, langs `tha+eng`): extract text. Amounts are Arabic
   numerals and OCR well; Thai names/merchant text are lower-confidence.
4. **Field extraction heuristics** (`extract.ts`): pull `amount`, `datetime`,
   `counterparty` from the OCR text using the per-bank patterns below.
5. **Income-name heuristic**: if the parsed recipient name fuzzy-matches the user's
   configured `display_name`, set `suggestedType = 'income'`; otherwise `'expense'`.
6. **Confidence**: attach a 0–1 confidence per field. Low-confidence fields must be
   visually flagged in the confirm form. **Always require user confirmation** — never
   auto-commit a parsed slip.

## Output schema

```ts
type FieldConfidence<T> = { value: T | null; confidence: number };
interface ParsedSlip {
  amount: FieldConfidence<number>;        // satang (integer)
  datetime: FieldConfidence<string>;      // ISO 8601, Asia/Bangkok
  counterparty: FieldConfidence<string>;
  refCode: FieldConfidence<string>;       // from QR primarily
  bankCode: FieldConfidence<string>;
  suggestedType: 'income' | 'expense';
  rawTextDebug?: string;                  // dev-only, never persisted
}
```

## Per-bank field cues (extend with your labeled corpus)

| Bank | Amount label cues | Date format cues | Notes |
|------|-------------------|------------------|-------|
| SCB | "จำนวนเงิน" / "Amount" + `฿`/`THB` | `dd MMM yy HH:mm` (th month abbr) | QR present |
| KBank (KPlus) | "จำนวน" near baht symbol | `dd/MM/yy HH:mm` | QR present |
| KTB (Krungthai) | "จำนวนเงิน" | `dd MMM yyyy` | QR present |
| BBL (Bangkok Bank) | "Amount"/"จำนวน" | `dd-MM-yyyy HH:mm` | QR present |
| PromptPay | amount near recipient | varies | always QR; ref_code reliable |

## Normalization rules
- Strip thousands separators; accept Thai digits (๐–๙) and map to 0–9.
- Parse amount to **satang**: `baht * 100`, rounding to nearest satang.
- Resolve dates in **Asia/Bangkok**; if year is Buddhist (พ.ศ.), subtract 543.

## When NOT to use
- Server-side OCR or any paid vision API (out of scope for MVP).
- Non-Thai or non-bank receipts (no patterns defined).
- Anything that requires the raw image to leave the device.

## Hard rules
- The image object is discarded immediately after producing `ParsedSlip`.
- Never POST the image. Verify in DevTools Network tab that only JSON is sent.
- Degrade gracefully: if QR fails, continue with OCR and leave `refCode` null.
```

(Also create `extract.ts` with the heuristic implementation, `samples/` holding
**synthetic** labeled slip structures only (no real PII), and `test-cases.md`
enumerating expected `ParsedSlip` outputs for each sample.)

---

### `.claude/skills/recurrence-engine/SKILL.md`

```markdown
---
name: recurrence-engine
description: >
  Expand a recurring_rules row into concrete dated occurrences for a requested
  date range, honoring weekday exclusions, Asia/Bangkok timezone, start/end bounds,
  and skip-exceptions, idempotently. Use when implementing or modifying recurring
  expense generation (subscriptions and weekly costs like "travel Tue-Thu+Sat").
  Do NOT use for one-off transactions or for forecasting beyond the rule's end_date.
---

# Recurrence Engine

Generate **real transaction occurrences** from a `recurring_rules` row, **lazily on
read**. There is no cron in MVP: when the app loads a date range, materialize any
missing occurrences for that range.

## Data model consumed

```ts
interface RecurringRule {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amountSatang: number;
  category: string;
  accountId: string;
  freq: 'weekly' | 'monthly' | 'yearly';
  interval: number;             // every N freq units
  byWeekday?: number[];         // Mon=1..Sun=7; e.g. [2,3,4,6] = Tue-Thu + Sat
  startDate: string;            // ISO date, Asia/Bangkok
  endDate?: string | null;
}
```

## Algorithm

For a requested `[from, to]` range (clamped to `[startDate, endDate ?? to]`):
1. Walk candidate dates by `freq` × `interval` from `startDate`.
2. **weekly + `byWeekday`**: emit a date only if its ISO weekday ∈ `byWeekday`.
   ("travel Tue–Thu + Sat" = `byWeekday:[2,3,4,6]`, weekly, interval 1.)
3. **monthly**: same day-of-month; if the month is short (e.g. day 31 in Feb),
   **skip** that month (do not roll over to the 1st).
4. **yearly**: same month+day; Feb 29 in a non-leap year → skip.
5. Drop any date present in `recurring_exceptions` for this rule.
6. For each surviving date with **no existing** transaction
   (`recurring_rule_id` + `occurrence_date`), create one. This makes generation
   **idempotent** — re-reading the same range never duplicates rows.

## Timezone
All date math is **Asia/Bangkok**. Compute weekday and day-of-month in that zone,
not UTC, or boundary days will be off by one.

## Edge cases to test
- Month boundary: weekly rule spanning end of month into next.
- Year boundary: weekly rule crossing Dec→Jan keeps correct weekdays.
- Short month: monthly day-31 rule skips Feb/Apr/Jun/Sep/Nov.
- Leap year: yearly Feb-29 rule emits only in leap years.
- Skip: deleting a generated occurrence writes an exception; re-read does not recreate it.
- Interval: `freq=monthly, interval=3` emits quarterly.

## When NOT to use
- One-off (non-recurring) transactions.
- Generating dates past `endDate`, or pure forecasting that should not create rows.
- Server cron expansion (MVP is lazy-on-read only).
```

(Also create `recurrence.ts` implementing the above and `test-cases.md` with the
edge-case fixtures and expected occurrence lists.)

---

### `.claude/skills/supabase-rls/SKILL.md`

```markdown
---
name: supabase-rls
description: >
  Author and review Row Level Security policies for JodSa's Supabase Postgres:
  multi-tenant owner isolation (owner = auth.uid()) and the guest capability-token
  pattern for payment sessions. Use whenever adding a table, writing/altering an RLS
  policy, or wiring the guest /pay/<token> flow. Do NOT use to justify bypassing RLS
  with the service role at runtime.
---

# Supabase RLS

RLS is the security boundary for financial data. **Deny by default**; every table
has explicit policies. A misconfigured policy = cross-user data leak (critical).

## 🚨 Non-negotiable rule
- **Runtime user-data access goes ONLY through `supabase-js` carrying the user's
  session.** RLS is enforced relative to `auth.uid()`.
- **Drizzle, the direct Postgres connection string, and the service-role key BYPASS
  RLS.** Use them **only** for migrations and trusted server-only operations — never
  to read or write a logged-in user's data on a request path.

## Pattern A — multi-tenant owner isolation
For every owned table (`accounts`, `transactions`, `groups`, `recurring_rules`,
`recurring_exceptions`, `budgets`, `payment_sessions`):

```sql
alter table transactions enable row level security;

create policy "owner_select" on transactions
  for select using (user_id = auth.uid());
create policy "owner_insert" on transactions
  for insert with check (user_id = auth.uid());
create policy "owner_update" on transactions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owner_delete" on transactions
  for delete using (user_id = auth.uid());
```

## Pattern B — guest capability-token (payment sessions)
The session **id is an unguessable nanoid** acting as a capability: knowing it =
authorization. Guests are the Supabase **anon** role.

```sql
-- A guest may read ONLY the session they hold the token for (to show host QR/title).
create policy "anon_read_open_session" on payment_sessions
  for select to anon
  using (status = 'open');   -- guest can only query by exact id; never list

-- A guest may INSERT a slip only into an OPEN session.
create policy "anon_insert_slip" on session_slips
  for insert to anon
  with check (
    exists (select 1 from payment_sessions s
            where s.id = session_slips.session_id and s.status = 'open')
  );

-- Guests may NOT read slips at all (one friend must not see another's slip).
-- (No anon SELECT policy on session_slips → denied by default.)

-- The host (owner) sees and manages every slip in their own session.
create policy "owner_manage_slips" on session_slips
  for all to authenticated
  using (exists (select 1 from payment_sessions s
                 where s.id = session_slips.session_id and s.owner = auth.uid()))
  with check (exists (select 1 from payment_sessions s
                 where s.id = session_slips.session_id and s.owner = auth.uid()));
```

- Pair this with a **middleware rate-limit** (IP + token) on the guest slip POST —
  RLS cannot rate-limit, so spam protection lives in `middleware.ts`.
- Serve the host QR image via a **signed URL** scoped to the session lifetime.

## Review checklist for any new table
- [ ] RLS enabled and forced.
- [ ] `select`/`insert`/`update`/`delete` each covered (deny by default otherwise).
- [ ] No anon policy unless the table is intentionally guest-reachable.
- [ ] Insert policies use `with check`, not just `using`.
- [ ] 2-user isolation test exists (user A cannot read user B's rows).

## When NOT to use
- To rationalize service-role/Drizzle access on a user request path (forbidden).
- For non-Supabase storage.
```

(Also create `policies.sql` collecting the canonical policy templates above.)

## 5. Build Order

Build milestones in order. Each is shippable on its own.

**M1 — Foundation + Auth + Manual Logging** (complexity L; depends on: none)
- Scaffold Next.js 15 + React 19 + Tailwind + shadcn/ui + Serwist PWA shell.
- Supabase project; full schema + RLS via Drizzle migrations (apply `supabase-rls` patterns).
- Multi-tenant auth (email + one OAuth provider). Providers: theme, i18n, TanStack Query.
- Multi-bank accounts CRUD. Manual logging for income/expense/transfer with **transfer two-account semantics** and **account balance** computation. Transactions table UI. `lib/money.ts` satang helpers.

**M2 — Slip Parsing** (complexity L; **riskiest**; depends on: M1; skill: `slip-parser`)
- **PREREQ:** collect + label ~25 real Thai slips across SCB / KBank / KTB / BBL / PromptPay. Without this corpus there is no objective exit for this milestone.
- `workers/slip.worker.ts`: QR decode + tesseract.js (tha+eng) + preprocessing + `extract.ts` heuristics + confidence + income-name heuristic.
- Confirm/edit form pre-filled from `ParsedSlip`; low-confidence fields flagged; mandatory user confirmation.
- Image never leaves device; discard after parse. Dedup by `ref_code`; null-ref soft-dedup warning. Log OCR confidence + correction rate.

**M3 — Budgets + Recurring + Groups** (complexity M; depends on: M1; skill: `recurrence-engine`)
- Budgets day/month, overall/category, showing **+/- vs. actual (expense only)**.
- Recurrence engine **lazy-on-read** (weekly/monthly/yearly, `byWeekday` exclusions, exceptions, Asia/Bangkok, idempotent).
- Groups (trips): assign transactions to a group; show total + breakdown.

**M4 — Guest Group-Payment** (complexity M; depends on: M2; skill: `supabase-rls`)
- Settings: upload host bank QR per account to Supabase Storage.
- Create session → show host QR at `/pay/<token>` (no login). Friend parses slip client-side → POST `{amount, ref_code}` bound to token. Host sees entries and can confirm/unconfirm.
- Capability-token RLS (Pattern B) + middleware rate-limit. Session persists across browser restart (token in URL + localStorage).

**M5 — Polish + i18n + Theme + Analytics + Share Target** (complexity M; depends on: M1–M4)
- Full th/en (next-intl) and light/dark (next-themes), app-wide.
- Dashboard summary + income/expense charts (lazy-loaded Recharts).
- PWA install + Web Share Target (Android) + in-app upload button (iOS fallback).
- Account deletion (cascade) in settings.

**Phase 2 (do not build now):** Supabase Realtime live-sync; Line OA image send; BYO vision API key; CSV export; Vercel Cron for budget/recurring notifications.

## 6. Acceptance Tests

**M1**
- Create two users A and B. As A, create accounts/transactions. Query as B → B sees **zero** of A's rows (run a Vitest/integration check against RLS, and verify manually).
- Log income, expense, and a transfer between two of A's accounts. Assert: transfer does **not** appear in income or expense totals; both accounts' balances change by the transfer amount; `balance = Σincome − Σexpense − Σtransfer_out + Σtransfer_in` matches a hand-computed fixture.
- Log in on a second device/browser → same data appears after load.

**M2**
- Run the parser over the 25-slip corpus. **Amount correct on ≥ 9 of any 10** (≥ 90%).
- Open DevTools → Network while importing a slip: confirm **no image upload**; only JSON `ParsedSlip`/transaction payload is sent.
- Import the same slip twice (with a readable QR) → second insert is **rejected** by `UNIQUE(user_id, ref_code)`. For a null-ref slip, importing a near-identical one triggers the **soft-dedup warning**.

**M3**
- Create rule "travel, weekly, byWeekday `[2,3,4,6]`". Read a month spanning a month boundary → occurrences fall **only** on Tue/Thu/Sat (Mon=1…Sun=7). Read across Dec→Jan → weekdays still correct. Delete one occurrence → re-read does **not** recreate it.
- Monthly day-31 rule → **skips** Feb/Apr/Jun/Sep/Nov. Yearly Feb-29 → emits only in leap years.
- Set monthly budget 10,000 THB; log 7,000 of expense + a 5,000 transfer → budget shows **3,000 remaining** (transfer ignored).
- Assign 3 transactions to a group → group total = sum of the three.

**M4**
- Open `/pay/<token>` in a logged-out browser → host QR + title render; upload a slip → recorded; reload host view → entry appears (unconfirmed). Host toggles confirm → state persists.
- As a different anon client, attempt to read `session_slips` of that session → **denied**. Attempt to insert into a `closed` session → **rejected**.
- Hammer the guest POST past the rate limit → **throttled** by middleware. Close and reopen the guest browser → still inside the same session (token in URL + localStorage).

**M5**
- Toggle language and theme → entire app updates, no untranslated strings on core screens.
- Install the PWA on Android, share a slip image from the gallery to JodSa → lands on `/import` parsed. On iOS, the in-app upload button performs the same flow.
- Dashboard charts render; verify Recharts is **not** in the M1 route bundle.
- Delete account → all of that user's rows are gone (cascade) and the user is signed out.

## 7. First Action

1. Create the exact folder structure from Section 3.
2. Write the three `SKILL.md` files (and their helper files: `extract.ts`, `recurrence.ts`, `policies.sql`, `samples/`, `test-cases.md`) verbatim from Section 4 to `.claude/skills/`.
3. Initialize the project: `npx create-next-app@latest` (TypeScript, App Router, Tailwind), then add Serwist, Supabase client, Drizzle, Zod, TanStack Query, next-intl, next-themes, shadcn/ui, tesseract.js, the QR lib. Pin React 19 / Next 15-compatible versions. Create `.env.example`.
4. **Stop and confirm with me before starting M1.** Share the dependency list + versions you resolved so I can sanity-check compatibility before any feature code.

## 8. Operating Instructions

- **Coding standards:** TypeScript strict. Validate every external input and server payload with Zod. Money is **integer satang** end-to-end; never use floats for money. Handle the unhappy path explicitly (QR fail, OCR garbage, network error) — surface errors to the user, don't swallow them.
- **Security (non-negotiable):** Runtime user data flows **only** through `supabase-js` with the user session so RLS applies. **Never** use the service role / Drizzle / direct connection on a user request path. New tables ship with RLS enabled + full policies + a 2-user isolation test before merge.
- **Privacy:** Slip images are parsed in-worker and discarded; never upload or persist them. Verify in the Network tab.
- **Testing:** Unit-test the slip parser, recurrence engine, money helpers, and transfer/balance math (Vitest). Add Playwright happy-path E2E for login→log, budget, and guest pay. A milestone isn't done until its acceptance tests pass.
- **When to ask vs decide:** Decide naming, file layout, component structure, and styling yourself. **Ask before** adding a new external dependency, changing the data model/RLS contract, or altering any decision in this prompt (especially the non-goals).
- **Ambiguity:** If a requirement is unclear, ask **one** focused question — do not invent requirements. The non-goals are firm; push back politely if asked to cross them.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`). One milestone ≈ a focused series of commits; keep them buildable.
- **Definition of done per milestone:** acceptance tests pass + types clean + lint clean + RLS isolation holds.
