-- Trip sessions (group-pay "type 2"): a shared multi-payer ledger.
--
-- Identity model: the CREATOR is an authenticated user (owner). Everyone else
-- joins ANONYMOUSLY via the capability token in the URL + a nickname; their
-- per-person secret (participant_token) lives in their own localStorage and is
-- proven on each write through the server API routes (admin client). Mirrors the
-- existing guest /pay capability-token pattern (0001_initial.sql §RLS Pattern B).
--
-- Visibility: in a trip, everyone with the link sees the whole ledger. That read
-- (and every anon write) is served SERVER-SIDE by the admin client AFTER the
-- token is validated — so there is NO anon RLS policy on the new tables, keeping
-- the anon attack surface identical to today (knowing the 126-bit token is the
-- only credential). Owner-side management uses the user-session client, gated by
-- the owner RLS policies below.

-- ── 1. payment_sessions: add type, relax account_id for trip ──────────────────
alter table public.payment_sessions
  add column if not exists type text not null default 'collect'
    check (type in ('collect','trip'));

-- Trip sessions have no single receiving account.
alter table public.payment_sessions
  alter column account_id drop not null;

-- A collect session still requires an account; a trip session must not carry one.
alter table public.payment_sessions
  add constraint payment_sessions_account_per_type check (
    (type = 'collect' and account_id is not null) or
    (type = 'trip'    and account_id is null)
  );

-- ── 2. session_participants ───────────────────────────────────────────────────
create table if not exists public.session_participants (
  id                uuid primary key default gen_random_uuid(),
  session_id        text not null references public.payment_sessions(id) on delete cascade,
  nickname          text not null,
  participant_token text not null,            -- per-person secret, kept in joiner's localStorage
  user_id           uuid references public.users(id) on delete set null, -- set for the owner
  is_owner          boolean not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists session_participants_session_idx
  on public.session_participants (session_id);

-- ── 3. session_expenses (one "expense" = a cost a participant fronted) ─────────
create table if not exists public.session_expenses (
  id                   uuid primary key default gen_random_uuid(),
  session_id           text not null references public.payment_sessions(id) on delete cascade,
  payer_participant_id uuid not null references public.session_participants(id) on delete cascade,
  title                text not null,
  total_amount_satang  integer not null check (total_amount_satang > 0),
  split_among          integer not null check (split_among > 0), -- headcount snapshot, editable
  qr_image_path        text,                                      -- payer's receiving QR (trip-qr bucket)
  created_at           timestamptz not null default now()
);

create index if not exists session_expenses_session_idx
  on public.session_expenses (session_id);

-- ── 4. session_slips: bind a slip to an expense + the participant who paid ─────
alter table public.session_slips
  add column if not exists expense_id uuid
    references public.session_expenses(id) on delete cascade;
alter table public.session_slips
  add column if not exists payer_participant_id uuid
    references public.session_participants(id) on delete set null;

-- ── 5. RLS ────────────────────────────────────────────────────────────────────
alter table public.session_participants enable row level security;
alter table public.session_expenses     enable row level security;

-- Owner manages everything in their own session (Pattern A via join to owner).
create policy "session_participants_owner_all" on public.session_participants
  for all to authenticated
  using (
    exists (select 1 from public.payment_sessions s
            where s.id = session_id and s.owner = auth.uid())
  )
  with check (
    exists (select 1 from public.payment_sessions s
            where s.id = session_id and s.owner = auth.uid())
  );

create policy "session_expenses_owner_all" on public.session_expenses
  for all to authenticated
  using (
    exists (select 1 from public.payment_sessions s
            where s.id = session_id and s.owner = auth.uid())
  )
  with check (
    exists (select 1 from public.payment_sessions s
            where s.id = session_id and s.owner = auth.uid())
  );

-- Note: NO anon policy on session_participants / session_expenses. Anonymous
-- trip reads/writes flow only through the server API routes (admin client) after
-- the capability token is validated. The existing session_slips policies are
-- unchanged: owner manages all; anon may INSERT into an open session (the trip
-- slip route adds expense_id/payer_participant_id, still anon-insert into open).

-- ── 6. trip-qr storage bucket (per-payer receiving QR) ────────────────────────
-- Private. Objects at {session_id}/{expense_id}.{ext}. Anonymous participants
-- have NO storage policy — uploads happen via the admin client in the expense
-- API route, and the trip page serves short-lived signed URLs server-side (same
-- approach as the host bank-qr in 0003).
insert into storage.buckets (id, name, public)
values ('trip-qr', 'trip-qr', false)
on conflict (id) do nothing;
