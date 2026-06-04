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
