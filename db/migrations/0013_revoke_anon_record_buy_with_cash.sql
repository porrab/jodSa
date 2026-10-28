begin;
set local lock_timeout = '5s';

revoke execute on function public.record_buy_with_cash(
  uuid, numeric, bigint, text, bigint, numeric, timestamptz, text, uuid, integer
) from anon;

commit;
