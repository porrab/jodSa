-- M8 — Smart Account Mapping.
-- Apply via: pnpm db:migrate  (drizzle-kit, direct Postgres connection)
-- WARNING: Never use this connection string on a user request path — it bypasses RLS.
-- NOTE: this file must be applied to the live Supabase project by the user — the dev
-- session does not run this against the live DB (CLAUDE.md hard constraint).

-- ── 1. accounts.number_hint ──────────────────────────────────────────────────
-- Optional last-visible-digits the user types in on the account create/edit
-- sheet (design J4, "เลขท้ายบัญชี"). Used to disambiguate same-bank accounts
-- (e.g. 3 KTB accounts) from a slip's extracted sender mask — see
-- lib/account-map.ts matchAccountByNumberHint(). Free text, not validated
-- against a mask shape (users may type with or without dashes).
alter table public.accounts
  add column if not exists number_hint text;

-- ── 2. slip_account_map — learned fingerprint → account (the learning loop) ──
-- fingerprint = `bank_code|app_signature|sender_mask` (lib/account-map.ts
-- buildFingerprint(), empties normalized to ''). One row per (user, fingerprint):
-- the account the user most recently confirmed/corrected for that slip shape.
-- hits/last_used_at are informational (surfaces "learned X times" in future UI);
-- account_id is always overwritten to the latest confirmed choice, so a
-- correction immediately takes over future auto-selects for the same fingerprint.
create table if not exists public.slip_account_map (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  fingerprint   text not null,
  account_id    uuid not null references public.accounts(id) on delete cascade,
  hits          integer not null default 1 check (hits > 0),
  last_used_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (user_id, fingerprint)
);

create index if not exists slip_account_map_user_id_idx
  on public.slip_account_map (user_id);

-- ── 3. RLS — Pattern A (owner isolation), same as every other owned table ───
alter table public.slip_account_map enable row level security;

create policy "slip_account_map_select_own" on public.slip_account_map
  for select using (user_id = auth.uid());
create policy "slip_account_map_insert_own" on public.slip_account_map
  for insert with check (user_id = auth.uid());
create policy "slip_account_map_update_own" on public.slip_account_map
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "slip_account_map_delete_own" on public.slip_account_map
  for delete using (user_id = auth.uid());
