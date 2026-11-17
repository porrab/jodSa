begin;
set local lock_timeout = '5s';

-- Keep the existing replica identity: Step 0 must observe actual DELETE payloads.
do $$
declare target text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'supabase_realtime publication missing';
  end if;
  foreach target in array array['transactions', 'accounts', 'budgets'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target);
    end if;
  end loop;
end;
$$;

commit;
