-- M1 — JodSa Investments: holdings + asset-transaction ledger.
-- Apply via: pnpm db:migrate  (drizzle-kit, direct Postgres connection)
-- WARNING: Never use this connection string on a user request path — it bypasses RLS.
-- NOTE: this file must be applied to the live Supabase project by the OWNER — the dev
-- session does not run this against the live DB (CLAUDE.md hard constraint + SPEC-4 guardrail).
--
-- Hand-authored SQL (drizzle-kit generate is broken in this repo, per M8's precedent) —
-- additive to JodSa's existing migration chain (0001-0007). Money columns that hold
-- investment amounts use **bigint** (int8), NOT integer (int4) like JodSa's satang
-- columns — JodSa's `integer` caps out around ฿21.4M, too small once multi-currency
-- portfolios are in scope (Fable build-readiness review, SPEC-4).
--
-- Cost-basis design decision: `holdings` does NOT store a redundant avg-cost column.
-- The architecture doc flagged `holdings.avg_cost_minor` as ambiguous ("per-unit int is
-- lossy for fractional crypto/Dime qty — store total cost or derive from transactions").
-- This migration takes the "derive from transactions" branch: qty + cost basis are always
-- computed live from `asset_transactions` (see lib/invest/cost-basis.ts), so there is
-- exactly one source of truth and no drift risk. A holding's *first* row is always its
-- opening `buy` transaction — "add a holding" and "record a buy" are the same action.

-- ── 1. assets — system-seeded reference list + user-scoped custom rows ──────────────
create table if not exists public.assets (
  id            uuid primary key default gen_random_uuid(),
  symbol        text,
  name          text not null,
  asset_class   text not null check (asset_class in ('us_equity','etf','thai_set','thai_fund','gold','crypto')),
  region        text,
  currency      text not null,                 -- ISO 4217, e.g. 'USD', 'THB'
  proxy_class   text,                           -- nullable; consumed only by the later M5 planner
  lookthrough   jsonb,                          -- nullable; ETF constituents, consumed only by M5
  is_system     boolean not null default false, -- true = shared reference row, seeded by migration
  user_id       uuid references public.users(id) on delete cascade, -- null for system rows
  created_at    timestamptz not null default now(),
  -- system rows are user_id-less; custom rows always belong to exactly one user
  constraint assets_system_or_owned check (
    (is_system and user_id is null) or (not is_system and user_id is not null)
  )
);

create index if not exists assets_asset_class_idx on public.assets (asset_class);
create index if not exists assets_user_id_idx on public.assets (user_id);

-- ── 2. holdings — one row per (user, asset [, broker]) position ─────────────────────
create table if not exists public.holdings (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references public.users(id) on delete cascade,
  asset_id                uuid not null references public.assets(id) on delete restrict,
  sleeve                  text not null default 'core' check (sleeve in ('core','satellite','risk_capital')),
  broker                  text,
  -- Manually-entered "current value" (M3 "update prices"; may be null in M1 until the
  -- user sets it). Currency defaults to the asset's own currency; current_fx_to_display
  -- is the FX rate used to roll this holding into the user's display-currency total —
  -- entered by the user, never fetched (FX-at-valuation, per 02-architecture.md).
  current_value_minor     bigint,
  current_value_currency  text,
  current_fx_to_display   numeric,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists holdings_user_id_idx on public.holdings (user_id);
create index if not exists holdings_asset_id_idx on public.holdings (asset_id);

-- ── 3. asset_transactions — buy / sell / dividend / fee ledger ──────────────────────
-- For 'buy'/'sell': qty is the traded quantity, price_minor is the PER-UNIT price.
-- For 'dividend'/'fee': qty is null, price_minor holds the TOTAL cash amount for that
-- event (not a per-unit price) — documented here since the column is reused.
create table if not exists public.asset_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  holding_id   uuid not null references public.holdings(id) on delete cascade,
  type         text not null check (type in ('buy','sell','dividend','fee')),
  qty          numeric,
  price_minor  bigint,
  currency     text not null,
  fees_minor   bigint not null default 0,
  fx_rate      numeric,          -- FX-at-cost: display-currency-per-unit-of-`currency`, captured at trade time, immutable
  datetime     timestamptz not null,
  ref          text,
  created_at   timestamptz not null default now(),
  constraint asset_transactions_buy_sell_qty check (
    (type in ('buy','sell') and qty is not null and qty > 0) or (type in ('dividend','fee'))
  )
);

create index if not exists asset_transactions_user_id_idx on public.asset_transactions (user_id);
create index if not exists asset_transactions_holding_id_idx on public.asset_transactions (holding_id);

-- ── 4. portfolio_snapshots — immutable value/cost/P&L/allocation history (M3 UI; schema now) ─
create table if not exists public.portfolio_snapshots (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  taken_at          timestamptz not null default now(),
  display_currency  text not null,
  holdings          jsonb not null,   -- valued positions as of the snapshot
  totals            jsonb not null,   -- value / cost / P&L in display currency
  allocation        jsonb not null,   -- by asset_class / currency / sleeve
  created_at        timestamptz not null default now()
);

create index if not exists portfolio_snapshots_user_id_idx on public.portfolio_snapshots (user_id);

-- ── 5. RLS ────────────────────────────────────────────────────────────────────────

-- assets: shared reference reads for system rows (all authenticated users) + owner
-- isolation for user-added custom rows. No anon policy anywhere in this migration.
alter table public.assets enable row level security;

create policy "assets_select_system_or_own" on public.assets
  for select to authenticated
  using (is_system = true or user_id = auth.uid());
create policy "assets_insert_own_custom" on public.assets
  for insert to authenticated
  with check (is_system = false and user_id = auth.uid());
create policy "assets_update_own_custom" on public.assets
  for update to authenticated
  using (is_system = false and user_id = auth.uid())
  with check (is_system = false and user_id = auth.uid());
create policy "assets_delete_own_custom" on public.assets
  for delete to authenticated
  using (is_system = false and user_id = auth.uid());

-- holdings — Pattern A owner isolation (see .claude/skills/supabase-rls/SKILL.md)
alter table public.holdings enable row level security;

create policy "holdings_select_own" on public.holdings
  for select using (user_id = auth.uid());
create policy "holdings_insert_own" on public.holdings
  for insert with check (user_id = auth.uid());
create policy "holdings_update_own" on public.holdings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "holdings_delete_own" on public.holdings
  for delete using (user_id = auth.uid());

-- asset_transactions — Pattern A owner isolation
alter table public.asset_transactions enable row level security;

create policy "asset_transactions_select_own" on public.asset_transactions
  for select using (user_id = auth.uid());
create policy "asset_transactions_insert_own" on public.asset_transactions
  for insert with check (user_id = auth.uid());
create policy "asset_transactions_update_own" on public.asset_transactions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "asset_transactions_delete_own" on public.asset_transactions
  for delete using (user_id = auth.uid());

-- portfolio_snapshots — Pattern A owner isolation
alter table public.portfolio_snapshots enable row level security;

create policy "portfolio_snapshots_select_own" on public.portfolio_snapshots
  for select using (user_id = auth.uid());
create policy "portfolio_snapshots_insert_own" on public.portfolio_snapshots
  for insert with check (user_id = auth.uid());
create policy "portfolio_snapshots_update_own" on public.portfolio_snapshots
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "portfolio_snapshots_delete_own" on public.portfolio_snapshots
  for delete using (user_id = auth.uid());

-- ── 6. Seed — system reference assets across every MVP asset class ─────────────────
-- Idempotent: partial unique index on (name, asset_class) where is_system lets a
-- re-run of this migration `on conflict ... do nothing` instead of duplicating rows.
create unique index if not exists assets_system_name_class_idx
  on public.assets (name, asset_class)
  where is_system;

insert into public.assets (name, asset_class, currency, symbol, is_system, region) values
  -- US stocks / ETFs
  ('Apple Inc.', 'us_equity', 'USD', 'AAPL', true, 'US'),
  ('Microsoft Corporation', 'us_equity', 'USD', 'MSFT', true, 'US'),
  ('NVIDIA Corporation', 'us_equity', 'USD', 'NVDA', true, 'US'),
  ('Amazon.com, Inc.', 'us_equity', 'USD', 'AMZN', true, 'US'),
  ('Vanguard S&P 500 ETF', 'etf', 'USD', 'VOO', true, 'US'),
  ('Vanguard Total Stock Market ETF', 'etf', 'USD', 'VTI', true, 'US'),
  ('Invesco QQQ Trust', 'etf', 'USD', 'QQQ', true, 'US'),
  -- Thai SET single-names
  ('ปตท. จำกัด (มหาชน)', 'thai_set', 'THB', 'PTT', true, 'TH'),
  ('ซีพี ออลล์ จำกัด (มหาชน)', 'thai_set', 'THB', 'CPALL', true, 'TH'),
  ('ท่าอากาศยานไทย จำกัด (มหาชน)', 'thai_set', 'THB', 'AOT', true, 'TH'),
  ('ธนาคารกสิกรไทย จำกัด (มหาชน)', 'thai_set', 'THB', 'KBANK', true, 'TH'),
  -- Thai mutual funds
  ('K-USXNDQ-A(A)', 'thai_fund', 'THB', 'K-USXNDQ-A(A)', true, 'TH'),
  ('KFGG-A', 'thai_fund', 'THB', 'KFGG-A', true, 'TH'),
  ('TISESG-A', 'thai_fund', 'THB', 'TISESG-A', true, 'TH'),
  -- Gold
  ('ทองคำแท่ง 96.5%', 'gold', 'THB', null, true, 'TH'),
  ('ทองรูปพรรณ 96.5%', 'gold', 'THB', null, true, 'TH'),
  -- Crypto
  ('Bitcoin', 'crypto', 'USD', 'BTC', true, null),
  ('Ethereum', 'crypto', 'USD', 'ETH', true, null),
  ('Tether', 'crypto', 'USD', 'USDT', true, null)
on conflict (name, asset_class) where is_system do nothing;
