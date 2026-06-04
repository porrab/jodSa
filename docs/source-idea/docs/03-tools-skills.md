# 03 — Tools & Skills

## Tool inventory

| Tool | Purpose | Auth | Fallback if unavailable |
|---|---|---|---|
| Supabase | Postgres + Auth + RLS + Storage | project keys (env) | Neon Postgres + Auth.js |
| Vercel | hosting | account | Netlify |
| Tesseract.js | on-device OCR (tha+eng) | none | manual entry / BYO vision key (Phase 2) |
| jsQR / @zxing/library | on-device QR decode | none | OCR only (ref_code left null) |
| Web Share Target API | share slip from gallery into PWA | none (installed PWA) | in-app upload button (iOS path) |
| Supabase Storage | host bank-QR images | project keys | host pastes QR image elsewhere |

> **iOS limitation:** Web Share Target works only on Android with an installed PWA. iOS uses the in-app upload button — same flow, one extra tap.

> `promptpay-qr` is **not used** — the host uploads their own bank QR image.

## Skills to build (3)

These skills are for the **build session** that implements JodSa. Full `SKILL.md` contents are inlined in [`../prompt.md`](../prompt.md) §4 — write them verbatim to `.claude/skills/`.

### 1. `slip-parser`
- **Trigger:** implementing/modifying the slip-reading pipeline — QR decode, tesseract.js OCR (tha+eng), field-extraction heuristics, confidence scoring, image preprocessing, income-by-recipient-name guess.
- **What it does:** client-side pipeline turning a slip image into a structured `ParsedSlip` (amount, datetime, counterparty, ref_code, bank_code, suggestedType) with per-field confidence — **without ever uploading the image**.
- **Files:** `SKILL.md` (per-bank field specs SCB/KBank/KTB/BBL/PromptPay, output schema, normalization, hard rules), `extract.ts` (heuristics), `samples/` (synthetic labeled structures, no real PII), `test-cases.md`.
- **Dependencies:** tesseract.js, jsqr/@zxing.

### 2. `recurrence-engine`
- **Trigger:** implementing/modifying recurring expense generation (subscriptions + weekly costs like "travel Tue–Thu+Sat").
- **What it does:** expands a `recurring_rules` row into concrete dated occurrences for a requested range, honoring weekday exclusions, **Asia/Bangkok** timezone, start/end bounds, and skip-exceptions — **lazily on read** and **idempotently**.
- **Files:** `SKILL.md` (data model + algorithm + edge cases: short months, year cross, leap year, exceptions, interval), `recurrence.ts`, `test-cases.md`.
- **Dependencies:** date-fns / Temporal.

### 3. `supabase-rls`
- **Trigger:** adding a table, writing/altering an RLS policy, or wiring the guest `/pay/<token>` flow.
- **What it does:** RLS policy templates for (A) multi-tenant owner isolation (`owner = auth.uid()`) and (B) the guest capability-token pattern (anon insert into open session, deny anon select on slips). Encodes the **non-negotiable rule** that Drizzle/service-role bypass RLS and must never touch user data on a request path.
- **Files:** `SKILL.md` (Pattern A, Pattern B, review checklist), `policies.sql`.
- **Dependencies:** Supabase.

> Deliberately **not** a skill: PromptPay QR generation (dropped) — it would have been a single library call.
