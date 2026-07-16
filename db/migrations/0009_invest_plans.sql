-- M5 — JodSa Investments: AI Monthly Buy/Sell Planner persistence + proxy_class backfill.
-- Apply via: pnpm db:migrate  (drizzle-kit, direct Postgres connection)
-- WARNING: Never use this connection string on a user request path — it bypasses RLS.
-- NOTE: this file must be applied to the live Supabase project by the OWNER — the dev
-- session does not run this against the live DB (CLAUDE.md hard constraint + SPEC-4
-- guardrail). Author + verify locally only, then surface for sign-off.
--
-- Hand-authored SQL (drizzle-kit generate is broken in this repo, per M8/0008's
-- precedent) — additive to JodSa's chain (0001-0008). Modeled directly on 0008's
-- shape: bigint minor units, jsonb for the plan's inputs/outputs, Pattern A owner
-- RLS (see .claude/skills/supabase-rls/SKILL.md).
--
-- Two independent pieces:
--   1. `plans` — one immutable row per generated plan (M5 "persist each plan").
--   2. A one-time backfill of `assets.proxy_class` for the 19 system-seeded
--      reference assets from 0008. Those rows shipped with proxy_class = null
--      (it was "consumed only by M5" and M5 didn't exist yet) — left as-is, the
--      planner's resolve.ts step would block EVERY plan on day one, since it
--      never silently defaults a missing classification (see resolve.ts).
--      User-created custom assets are NOT touched here; they're classified via
--      app/actions/invest/assets.ts's classifyAssetProxyClass, surfaced by the
--      plan UI when resolve.ts reports them unclassified — no RLS change needed,
--      the existing "assets_update_own_custom" policy from 0008 already permits it.

-- ── 1. plans — one immutable row per generated monthly plan ─────────────────────────
create table if not exists public.plans (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  created_at          timestamptz not null default now(),
  param_version       text not null,          -- pins lib/invest/planner/proxy-params.json's version used
  display_currency    text not null,
  new_money_minor     bigint not null,
  new_money_currency  text not null,
  target_allocation   jsonb not null,         -- the user's target as of this plan (snapshotted, not live-referenced)
  inputs              jsonb not null,         -- resolved holdings as planned (ResolvedHolding[])
  outputs             jsonb not null          -- { allocationDrift, concentration, stress[], suggestions[], verdict, headline, disclaimer }
);

create index if not exists plans_user_id_idx on public.plans (user_id);
create index if not exists plans_created_at_idx on public.plans (user_id, created_at desc);

alter table public.plans enable row level security;

-- Pattern A owner isolation (see .claude/skills/supabase-rls/SKILL.md). No update
-- policy — a plan is an immutable historical record (owner isolation only needs
-- select/insert/delete; there is no legitimate "edit a past plan" action anywhere
-- in the app).
create policy "plans_select_own" on public.plans
  for select using (user_id = auth.uid());
create policy "plans_insert_own" on public.plans
  for insert with check (user_id = auth.uid());
create policy "plans_delete_own" on public.plans
  for delete using (user_id = auth.uid());

-- ── 2. Backfill proxy_class for the 19 system-seeded reference assets ───────────────
-- Best-effort mapping to lib/invest/planner/proxy-params.json's classes, matched by
-- (name, asset_class) exactly as seeded in 0008. Idempotent (plain UPDATE ... WHERE,
-- safe to re-run; a re-run that finds nothing to change is a no-op).
update public.assets set proxy_class = 'us_tech_growth'
  where is_system and asset_class = 'us_equity' and name in
    ('Apple Inc.', 'Microsoft Corporation', 'NVIDIA Corporation', 'Amazon.com, Inc.');

update public.assets set proxy_class = 'us_large_cap'
  where is_system and asset_class = 'etf' and name in
    ('Vanguard S&P 500 ETF', 'Vanguard Total Stock Market ETF');

update public.assets set proxy_class = 'us_tech_growth'
  where is_system and asset_class = 'etf' and name = 'Invesco QQQ Trust';

update public.assets set proxy_class = 'thai_set'
  where is_system and asset_class = 'thai_set';

-- Thai mutual funds: K-USXNDQ-A(A) is a Nasdaq-100 feeder fund (Krungsri) — proxy as
-- us_tech_growth, the same bucket as QQQ. KFGG-A and TISESG-A have no verified
-- strategy on file here — proxy as the generic Thai-fund bucket rather than guess a
-- more specific (and possibly wrong) classification [JUDG-PROXY, APPROX, Verify].
update public.assets set proxy_class = 'us_tech_growth'
  where is_system and asset_class = 'thai_fund' and name = 'K-USXNDQ-A(A)';
update public.assets set proxy_class = 'thai_fund_generic'
  where is_system and asset_class = 'thai_fund' and name in ('KFGG-A', 'TISESG-A');

update public.assets set proxy_class = 'gold'
  where is_system and asset_class = 'gold';

update public.assets set proxy_class = 'crypto'
  where is_system and asset_class = 'crypto' and name in ('Bitcoin', 'Ethereum');

-- Tether is a USD stablecoin, not a high-vol crypto asset — proxy as cash.
update public.assets set proxy_class = 'cash'
  where is_system and asset_class = 'crypto' and name = 'Tether';
