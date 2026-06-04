-- JodSa initial schema + RLS
-- Apply via: pnpm db:migrate  (drizzle-kit, direct Postgres connection)
-- WARNING: Never use this connection string on a user request path — it bypasses RLS.

-- ──────────────────────────────────────────────
-- 1. TABLES
-- ──────────────────────────────────────────────

create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale      text not null default 'th',
  theme       text not null default 'system'
);

create table if not exists public.accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  name          text not null,
  bank          text not null,
  qr_image_path text,
  created_at    timestamptz not null default now()
);

create table if not exists public.groups (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title   text not null,
  note    text
);

create table if not exists public.transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  type              text not null check (type in ('income','expense','transfer')),
  amount_satang     integer not null check (amount_satang > 0),
  account_id        uuid not null references public.accounts(id),
  to_account_id     uuid references public.accounts(id),
  category          text,
  ref_code          text,
  bank_code         text,
  counterparty      text,
  datetime          timestamptz not null,
  group_id          uuid references public.groups(id) on delete set null,
  recurring_rule_id uuid,
  occurrence_date   date,
  created_at        timestamptz not null default now(),
  -- transfer must have to_account_id; others must not
  constraint transfer_needs_to_account check (
    (type = 'transfer' and to_account_id is not null) or
    (type <> 'transfer' and to_account_id is null)
  )
);

-- Partial unique index: dedup slips with a known ref_code per user
create unique index if not exists transactions_user_ref_code_idx
  on public.transactions (user_id, ref_code)
  where ref_code is not null;

create table if not exists public.recurring_rules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  type          text not null check (type in ('income','expense')),
  amount_satang integer not null check (amount_satang > 0),
  category      text,
  account_id    uuid not null references public.accounts(id),
  freq          text not null check (freq in ('weekly','monthly','yearly')),
  interval      integer not null default 1 check (interval >= 1),
  by_weekday    integer[],
  start_date    date not null,
  end_date      date
);

create table if not exists public.recurring_exceptions (
  id           uuid primary key default gen_random_uuid(),
  rule_id      uuid not null references public.recurring_rules(id) on delete cascade,
  skipped_date date not null,
  unique (rule_id, skipped_date)
);

create table if not exists public.budgets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  period        text not null check (period in ('day','month')),
  scope         text not null check (scope in ('overall','category')),
  category      text,
  amount_satang integer not null check (amount_satang > 0)
);

create table if not exists public.payment_sessions (
  id                   text primary key, -- nanoid capability token
  owner                uuid not null references public.users(id) on delete cascade,
  account_id           uuid not null references public.accounts(id),
  title                text not null,
  target_amount_satang integer,
  status               text not null default 'open' check (status in ('open','closed')),
  created_at           timestamptz not null default now()
);

create table if not exists public.session_slips (
  id            uuid primary key default gen_random_uuid(),
  session_id    text not null references public.payment_sessions(id) on delete cascade,
  amount_satang integer not null check (amount_satang > 0),
  ref_code      text,
  paid_at       timestamptz not null,
  confirmed     boolean not null default false,
  created_at    timestamptz not null default now()
);

create unique index if not exists session_slips_session_ref_code_idx
  on public.session_slips (session_id, ref_code)
  where ref_code is not null;

-- ──────────────────────────────────────────────
-- 2. TRIGGER: auto-create users row on auth signup / OAuth
-- ──────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, display_name, locale, theme)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    'th',
    'system'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ──────────────────────────────────────────────
-- 3. ROW LEVEL SECURITY  (Pattern A — owner isolation)
-- ──────────────────────────────────────────────

alter table public.users               enable row level security;
alter table public.accounts            enable row level security;
alter table public.transactions        enable row level security;
alter table public.groups              enable row level security;
alter table public.recurring_rules     enable row level security;
alter table public.recurring_exceptions enable row level security;
alter table public.budgets             enable row level security;
alter table public.payment_sessions    enable row level security;
alter table public.session_slips       enable row level security;

-- users
create policy "users_select_own" on public.users
  for select using (id = auth.uid());
create policy "users_update_own" on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- accounts
create policy "accounts_select_own" on public.accounts
  for select using (user_id = auth.uid());
create policy "accounts_insert_own" on public.accounts
  for insert with check (user_id = auth.uid());
create policy "accounts_update_own" on public.accounts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "accounts_delete_own" on public.accounts
  for delete using (user_id = auth.uid());

-- transactions
create policy "transactions_select_own" on public.transactions
  for select using (user_id = auth.uid());
create policy "transactions_insert_own" on public.transactions
  for insert with check (user_id = auth.uid());
create policy "transactions_update_own" on public.transactions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "transactions_delete_own" on public.transactions
  for delete using (user_id = auth.uid());

-- groups
create policy "groups_select_own" on public.groups
  for select using (user_id = auth.uid());
create policy "groups_insert_own" on public.groups
  for insert with check (user_id = auth.uid());
create policy "groups_update_own" on public.groups
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "groups_delete_own" on public.groups
  for delete using (user_id = auth.uid());

-- recurring_rules
create policy "recurring_rules_select_own" on public.recurring_rules
  for select using (user_id = auth.uid());
create policy "recurring_rules_insert_own" on public.recurring_rules
  for insert with check (user_id = auth.uid());
create policy "recurring_rules_update_own" on public.recurring_rules
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "recurring_rules_delete_own" on public.recurring_rules
  for delete using (user_id = auth.uid());

-- recurring_exceptions — scoped via join to rule owner
create policy "recurring_exceptions_select_own" on public.recurring_exceptions
  for select using (
    exists (select 1 from public.recurring_rules r
            where r.id = rule_id and r.user_id = auth.uid())
  );
create policy "recurring_exceptions_insert_own" on public.recurring_exceptions
  for insert with check (
    exists (select 1 from public.recurring_rules r
            where r.id = rule_id and r.user_id = auth.uid())
  );
create policy "recurring_exceptions_delete_own" on public.recurring_exceptions
  for delete using (
    exists (select 1 from public.recurring_rules r
            where r.id = rule_id and r.user_id = auth.uid())
  );

-- budgets
create policy "budgets_select_own" on public.budgets
  for select using (user_id = auth.uid());
create policy "budgets_insert_own" on public.budgets
  for insert with check (user_id = auth.uid());
create policy "budgets_update_own" on public.budgets
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "budgets_delete_own" on public.budgets
  for delete using (user_id = auth.uid());

-- payment_sessions — Pattern A (owner) + Pattern B (anon read for open session)
create policy "payment_sessions_owner_all" on public.payment_sessions
  for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

create policy "payment_sessions_anon_read_open" on public.payment_sessions
  for select to anon
  using (status = 'open');

-- session_slips — owner manages all; anon may INSERT into open session only
create policy "session_slips_owner_all" on public.session_slips
  for all to authenticated
  using (
    exists (select 1 from public.payment_sessions s
            where s.id = session_id and s.owner = auth.uid())
  )
  with check (
    exists (select 1 from public.payment_sessions s
            where s.id = session_id and s.owner = auth.uid())
  );

create policy "session_slips_anon_insert_open" on public.session_slips
  for insert to anon
  with check (
    exists (select 1 from public.payment_sessions s
            where s.id = session_id and s.status = 'open')
  );
-- Note: no anon SELECT on session_slips — guests may not read other slips
