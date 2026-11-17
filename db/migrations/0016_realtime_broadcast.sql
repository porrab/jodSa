begin;
set local lock_timeout = '5s';

do $$
declare target text;
begin
  foreach target in array array['transactions','accounts','budgets'] loop
    if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=target) then
      execute format('alter publication supabase_realtime drop table public.%I', target);
    end if;
  end loop;
end;
$$;

create function public.broadcast_user_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  old_owner uuid;
  new_owner uuid;
  row_id uuid;
  message jsonb;
begin
  if TG_OP <> 'INSERT' then old_owner := OLD.user_id; row_id := OLD.id; end if;
  if TG_OP <> 'DELETE' then new_owner := NEW.user_id; row_id := NEW.id; end if;
  message := pg_catalog.jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP, 'id', row_id);
  -- Each send is isolated: a realtime failure must NEVER roll back a ledger write.
  if old_owner is not null then
    begin
      perform realtime.send(message, TG_OP, 'user:' || old_owner::text, true);
    exception when others then null;
    end;
  end if;
  if new_owner is not null and new_owner is distinct from old_owner then
    begin
      perform realtime.send(message, TG_OP, 'user:' || new_owner::text, true);
    exception when others then null;
    end;
  end if;
  return null; -- AFTER ROW trigger: return value is ignored.
end;
$$;
alter function public.broadcast_user_change() owner to postgres;
revoke all on function public.broadcast_user_change() from public, anon, authenticated;

create trigger broadcast_user_change after insert or update or delete on public.transactions for each row execute function public.broadcast_user_change();
create trigger broadcast_user_change after insert or update or delete on public.accounts for each row execute function public.broadcast_user_change();
create trigger broadcast_user_change after insert or update or delete on public.budgets for each row execute function public.broadcast_user_change();

create policy "user broadcast receive" on realtime.messages for select to authenticated
using (realtime.topic() = 'user:' || (select auth.uid())::text and realtime.messages.extension = 'broadcast');
-- No INSERT policy: clients cannot publish messages. Existing policies must be
-- absent (checked by the approved apply script), otherwise owner review is required.

-- Rollback (does NOT restore the leaking postgres_changes publication):
-- begin;
-- drop trigger broadcast_user_change on public.transactions;
-- drop trigger broadcast_user_change on public.accounts;
-- drop trigger broadcast_user_change on public.budgets;
-- drop function public.broadcast_user_change();
-- drop policy "user broadcast receive" on realtime.messages;
-- commit;
commit;
