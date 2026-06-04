# Architecture Audit: JodSa

**Audited**: 2026-06-04
**Verdict**: 🟠 FIX BLOCKERS FIRST (2 blockers — both resolved; see resolutions at the bottom)

## Summary
The shape is right: client-side-only slip parsing is a genuinely elegant decision that solves privacy + cost + "discard image" in one move, and money-as-satang + RLS-at-DB-layer are the correct instincts for financial data. Two things would have bitten the builder if not nailed down first: the guest-payment authorization model was hand-waved ("insert via session token" + "every query via user JWT" can't both be true), and the core transaction semantics were undefined (how transfers and recurring items hit budget math is a 1-way schema decision). Neither required rethinking — both needed a decision before handoff. One more thing the plan was quietly dishonest about: the guest feature records *claimed* payments, not *verified* ones.

## Blockers (🔴)

1. **Guest-payment authz model unspecified; naive version either leaks or breaks.** An unauthenticated guest runs as the Supabase `anon` role, so JWT-based RLS (`auth.uid()` null) gives them nothing. Two legitimate paths: (A) capability-token RLS — `payment_sessions.id` is an unguessable nanoid, anon INSERT allowed only for an open session, with anon SELECT on slips denied + rate-limiting; (B) service-role Route Handler that validates the token server-side. Must be chosen explicitly and the anon SELECT scope + rate limit spelled out.

2. **Transaction model semantics undefined — a 1-way schema door that decides whether budgets are correct.** (a) Transfers touch two accounts and must be excluded from income/expense + budget math, or moving money between your own accounts reads as spending. (b) Recurring items: are generated occurrences *real transactions* (count as spent) or *forecasts* (confirm first)? This decides the schema and budget correctness.

## Concerns (🟡)
1. **Guest payments are recorded, not verified.** A friend uploads an image they control; OCR reads an amount off it. Nothing proves the transfer happened. Acceptable for a portfolio app, but the UI must say "recorded" not "verified," and the host needs a manual confirm/unconfirm.
2. **Drizzle is a loaded footgun next to RLS.** Any runtime path using Drizzle over the direct connection / service role silently bypasses every policy. State the rule: Drizzle = migrations only; all runtime user data via supabase-js with the user session.
3. **`UNIQUE(user_id, ref_code)` does nothing when QR is unreadable** (Postgres allows unlimited NULLs). Add a soft-dedup heuristic for null-ref rows.
4. **M2's ≥90% gate has no test corpus.** Need ~25 labeled real Thai slips (SCB/KBank/KTB/BBL/PromptPay) before building the parser, or the milestone has no objective exit.
5. **Supabase free tier pauses after ~7 days idle** and caps DB 500 MB / Storage 1 GB — fatal for "share it so others use it." Note operationally; real launch needs keep-alive or paid tier.
6. **Vercel Cron may be unnecessary complexity in MVP.** Recurrence can be generated lazily on read, removing the cron dependency and the Hobby-tier cron limit.
7. **Intake rule "income payee name matches configured name" was dropped.** Restore as a slip-parser heuristic or confirm it's cut.

## Nits (🟢)
- Declare offline a non-goal (PWA implies offline; this is online-only).
- Log OCR confidence + correction rate — the only way to know if the 90% claim holds (parse errors fail silently).
- Add a data-deletion/export path if others store real finances.
- Pin React 19 / Next 15-compatible versions.
- Lazy-load Recharts (M5 only); don't ship it in the M1 bundle.

## Dimension Notes
1. **Completeness**: Gaps in transfer/recurring semantics (🔴#2), guest authz (🔴#1), missing slip corpus. QR-fail/OCR-garbage error paths implied, not specified.
2. **Soundness**: Stack fits. One mismatch: Drizzle-vs-RLS access duality (🟡#2). Supabase + Vercel + Serwist is coherent and proven.
3. **Security & Privacy**: Client-only parsing is excellent. Live edges: guest authz (🔴#1), Drizzle bypass (🟡#2), slip authenticity (🟡#1). Confirm no secrets in repo via `.env.example`.
4. **Cost**: ~$0 by design (client OCR, no paid API). Only "cost" is Supabase tier limits/pausing (🟡#5). Strong.
5. **Complexity**: Mostly justified. Cron likely superfluous in MVP (🟡#6). 3 skills is the right count.
6. **Integration Risk**: Tesseract Thai accuracy is the big unknown; Web Share Target POST handling is fiddly but has a clean fallback. No fragile third-party APIs.
7. **Observability**: Effectively none planned. Add confidence/correction logging (🟢) — wrong-but-not-crashing is the failure mode that matters.
8. **Failure Modes**: Null-ref duplicate inserts (🟡#3); partial OCR needs a default (insert low-confidence + require confirm — covered). Recurrence idempotency correctly called out.
9. **Scalability**: N/A at this stage — 10x is fine, 100x doesn't matter. Client-side OCR even scales for free.
10. **Team Fit**: Solo build, modern TS stack the user chose. Supabase RLS is the one real footgun — the `supabase-rls` skill is well-placed to absorb it.

## 1-Way Door Decisions
- Supabase (Postgres+Auth+RLS) — 1-way-ish; deliberate and correct. ✅
- Transaction schema (transfers, recurring) — 1-way, was undecided → blocker #2 (now resolved).
- Money as integer satang — 1-way, correct. ✅
- Client-side-only slip parsing — architectural 1-way, well-justified. ✅
- Next.js 15 / React 19 — 1-way-ish, fine. 2-way: Drizzle, Recharts, log format, OAuth provider.

## Recommended Plan Changes (all accepted)
1. Add a "Guest authorization" subsection (chose Option A — capability-token RLS; anon SELECT scope + insert rate-limit specified).
2. Add a "Transaction semantics" subsection (transfer single row + excluded from income/expense/budget; recurring = auto-created skippable real transactions; budget = expense only).
3. Add non-goal: guest payments recorded, not verified; host confirm/unconfirm.
4. State the Drizzle rule (migrations only; runtime via supabase-js).
5. M2 prerequisite: collect + label ~25 real slips; null-ref soft-dedup.
6. Recurrence lazy-on-read for MVP; drop Vercel Cron to Phase 2.
7. Note Supabase free-tier pause/limits.
8. Restore the income-payee-name heuristic.

---

## Resolutions (post-audit)

**Blocker #1 → Option A (Capability-token RLS).** `payment_sessions.id` = unguessable nanoid = capability. Anon: SELECT a single open session (host QR signed-URL + title + amount), INSERT slip only while open, **no** SELECT on `session_slips`; host (owner) manages all slips. Spam handled by `middleware.ts` rate-limit (IP + token). Host QR served via signed URL scoped to session lifetime.

**Blocker #2 → Defined.** Transfer = one row (`account_id` → `to_account_id`), excluded from income/expense totals and budgets; balance = `Σincome − Σexpense − Σtransfer_out + Σtransfer_in`. Recurring = templates that lazily create real, editable/skippable transactions (skip → `recurring_exceptions`). Budgets aggregate `type='expense'` only.

All concerns and nits accepted and folded into the architecture + handoff prompt. Cleared to proceed to prompt-builder → scaffolder.
