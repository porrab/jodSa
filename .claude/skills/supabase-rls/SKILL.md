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

## Pattern C — shared reference reads (SPEC-4 M1, `assets`)
`assets` mixes **system-seeded reference rows** (readable by every authenticated user, writable by
nobody except migrations) with **user-added custom rows** (owner-scoped, Pattern A). One table, two
policies per statement, discriminated by `is_system`:

```sql
alter table assets enable row level security;

create policy "assets_select_system_or_own" on assets
  for select to authenticated
  using (is_system = true or user_id = auth.uid());
create policy "assets_insert_own_custom" on assets
  for insert to authenticated
  with check (is_system = false and user_id = auth.uid());
create policy "assets_update_own_custom" on assets
  for update to authenticated
  using (is_system = false and user_id = auth.uid())
  with check (is_system = false and user_id = auth.uid());
create policy "assets_delete_own_custom" on assets
  for delete to authenticated
  using (is_system = false and user_id = auth.uid());
```

A CHECK constraint (`(is_system and user_id is null) or (not is_system and user_id is not null)`)
backs the policy so a row can never be both system-flagged and user-owned. No anon policy — this
table is authenticated-only, unlike Pattern B's guest reads.

## Owned investment tables (SPEC-4 M1 + M5)
`holdings`, `asset_transactions`, `portfolio_snapshots` (M1, `db/migrations/0008_invest_holdings.sql`)
and `plans` (M5, `db/migrations/0009_invest_plans.sql`) all use plain **Pattern A** — same shape as
`accounts`/`transactions`. `plans` omits an update policy (select/insert/delete only) — a generated
plan is an immutable historical record, there's no legitimate "edit a past plan" action anywhere in
the app. Money columns on all of these tables are **`bigint`**, not `integer` — JodSa's satang columns
are `int4` (caps ~฿21.4M), too small once multi-currency portfolios are in scope. This doesn't change
the RLS pattern, only the column type.

`0009` also backfills `assets.proxy_class` for the 19 system-seeded reference rows (a plain `UPDATE`,
not an RLS change) — without it, the M5 planner's `resolve.ts` step would block every plan on a fresh
install, since it never silently defaults a missing classification.

## Review checklist for any new table
- [ ] RLS enabled and forced.
- [ ] `select`/`insert`/`update`/`delete` each covered (deny by default otherwise).
- [ ] No anon policy unless the table is intentionally guest-reachable.
- [ ] Insert policies use `with check`, not just `using`.
- [ ] 2-user isolation test exists (user A cannot read user B's rows).

## When NOT to use
- To rationalize service-role/Drizzle access on a user request path (forbidden).
- For non-Supabase storage.
