-- Perf: first-load page cost (PERF-HANDOFF 2026-07-02).
-- 1) recurring_rules.materialized_through — cheap "already materialized" guard
-- 2) account_balances() — per-account balance as a Postgres aggregate (bounded)
-- 3) transactions (user_id, datetime) index for the month/chart/list reads

-- ── 1. Materialization guard ────────────────────────────────────────────────
-- Latest date (inclusive) through which this rule's occurrences have been
-- materialized. NULL = never. Rule edits reset it to NULL so the current window
-- is re-materialized (idempotent, exceptions still respected). Covered by the
-- existing recurring_rules owner policies — no new RLS needed.
alter table public.recurring_rules
  add column if not exists materialized_through date;

-- ── 2. Bounded balance computation ──────────────────────────────────────────
-- balance = opening_balance + Σincome − Σexpense − Σtransfer_out + Σtransfer_in
-- Mirrors lib/money.ts computeAccountBalance (unit-tested JS reference).
-- SECURITY INVOKER (default): runs as the calling user, so RLS on accounts and
-- transactions applies — anon or another user sees zero rows. Never call with
-- the service role on a request path.
create or replace function public.account_balances()
returns table (account_id uuid, balance_satang bigint)
language sql
stable
set search_path = ''
as $$
  select a.id as account_id,
         a.opening_balance_satang + coalesce(t.delta, 0) as balance_satang
  from public.accounts a
  left join (
    select acct_id, sum(delta)::bigint as delta
    from (
      -- primary leg: income credits, expense and transfer-out debit account_id
      select account_id as acct_id,
             case type
               when 'income' then amount_satang::bigint
               else -amount_satang::bigint
             end as delta
      from public.transactions
      union all
      -- transfer-in leg: credits the destination account (a self-transfer nets 0)
      select to_account_id, amount_satang::bigint
      from public.transactions
      where type = 'transfer' and to_account_id is not null
    ) legs
    group by acct_id
  ) t on t.acct_id = a.id
$$;

-- ── 3. Index for user-scoped, datetime-bounded reads ────────────────────────
-- Dashboard month/chart windows and the transactions list all filter by the
-- RLS user_id and order/range on datetime.
create index if not exists transactions_user_datetime_idx
  on public.transactions (user_id, datetime desc);
