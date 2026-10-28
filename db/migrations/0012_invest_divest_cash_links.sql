begin;
set local lock_timeout = '5s';

alter table public.transactions
  drop constraint transactions_type_check,
  add constraint transactions_type_check
    check (type in ('income', 'expense', 'transfer', 'invest', 'divest')),
  add column holding_id uuid references public.holdings(id) on delete set null,
  add column asset_transaction_id uuid references public.asset_transactions(id) on delete set null;

-- CREATE OR REPLACE retains the existing function owner, ACL and SECURITY INVOKER mode.
-- The only balance change is that divest credits the account; invest uses the old debit branch.
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
      -- primary leg: income and divest credit; expense, transfer-out and invest debit
      select account_id as acct_id,
             case type
               when 'income' then amount_satang::bigint
               when 'divest' then amount_satang::bigint
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

-- A buy funded from a JodSa account is one database operation. Both inserts
-- run under the caller's RLS policies; an error in either rolls back both.
create function public.record_buy_with_cash(
  p_holding_id uuid, p_qty numeric, p_price_minor bigint, p_currency text,
  p_fees_minor bigint, p_fx_rate numeric, p_datetime timestamptz, p_ref text,
  p_account_id uuid, p_amount_satang integer
)
returns table (asset_transaction_id uuid, cash_transaction_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_asset_transaction_id uuid;
  v_cash_transaction_id uuid;
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_qty <= 0 or p_price_minor <= 0 or p_fees_minor < 0 or p_amount_satang <= 0 then
    raise exception 'Invalid buy amount' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.holdings h join public.assets a on a.id = h.asset_id
    where h.id = p_holding_id and h.user_id = v_user_id and a.currency = p_currency
  ) then raise exception 'Holding not owned by caller or currency mismatch' using errcode = '42501'; end if;
  if not exists (select 1 from public.accounts a where a.id = p_account_id and a.user_id = v_user_id) then
    raise exception 'Account not owned by caller' using errcode = '42501';
  end if;

  insert into public.asset_transactions
    (user_id, holding_id, type, qty, price_minor, currency, fees_minor, fx_rate, datetime, ref)
  values (v_user_id, p_holding_id, 'buy', p_qty, p_price_minor, p_currency,
          p_fees_minor, p_fx_rate, p_datetime, p_ref)
  returning id into v_asset_transaction_id;

  insert into public.transactions
    (user_id, type, amount_satang, account_id, holding_id, asset_transaction_id, datetime)
  values (v_user_id, 'invest', p_amount_satang, p_account_id, p_holding_id, v_asset_transaction_id, p_datetime)
  returning id into v_cash_transaction_id;

  return query select v_asset_transaction_id, v_cash_transaction_id;
end;
$$;
revoke all on function public.record_buy_with_cash(uuid, numeric, bigint, text, bigint, numeric, timestamptz, text, uuid, integer) from public;
grant execute on function public.record_buy_with_cash(uuid, numeric, bigint, text, bigint, numeric, timestamptz, text, uuid, integer) to authenticated;

commit;
