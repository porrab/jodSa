begin;
set local lock_timeout = '5s';

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  notification_prefs jsonb not null default '{"daily":true,"recurring":true,"quietStart":null,"quietEnd":null}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_settings_notification_prefs_object check (jsonb_typeof(notification_prefs) = 'object')
);

create table if not exists public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in ('daily', 'recurring')),
  rule_id uuid references public.recurring_rules(id) on delete cascade,
  occurrence_date date,
  slot_at timestamptz,
  sent_at timestamptz not null default now()
);
create unique index if not exists push_deliveries_daily_once
  on public.push_deliveries(user_id, type, slot_at) where type = 'daily';
create unique index if not exists push_deliveries_recurring_once
  on public.push_deliveries(user_id, rule_id, occurrence_date) where type = 'recurring';

alter table public.push_subscriptions enable row level security;
alter table public.user_settings enable row level security;
alter table public.push_deliveries enable row level security;

create policy "push subscriptions owner select" on public.push_subscriptions for select using (auth.uid() = user_id);
create policy "push subscriptions owner insert" on public.push_subscriptions for insert with check (auth.uid() = user_id);
create policy "push subscriptions owner delete" on public.push_subscriptions for delete using (auth.uid() = user_id);
create policy "user settings owner select" on public.user_settings for select using (auth.uid() = user_id);
create policy "user settings owner insert" on public.user_settings for insert with check (auth.uid() = user_id);
create policy "user settings owner update" on public.user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create function public.claim_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  delete from public.push_subscriptions s where s.endpoint = p_endpoint;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth) values (auth.uid(), p_endpoint, p_p256dh, p_auth);
end;
$$;
revoke all on function public.claim_push_subscription(text,text,text) from public, anon;
grant execute on function public.claim_push_subscription(text,text,text) to authenticated;

commit;
