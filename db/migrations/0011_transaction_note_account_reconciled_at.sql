-- 0011 — OWNER-FB A3/C1 data model.
-- Hand-authored additive migration. No row updates and no backfill.
-- WARNING: Do NOT apply to the live Supabase project without explicit owner
--          authorization in a user message.

begin;

set local lock_timeout = '5s';

alter table public.transactions
  add column note text,
  add constraint transactions_note_length
    check (char_length(note) <= 120);

alter table public.accounts
  add column reconciled_at timestamptz;

commit;
