-- M6-2 (pm-desk review 2026-07-03): scope the anon slip INSERT to COLLECT sessions.
--
-- Since 0004, payment_sessions.id doubles as the capability token every trip
-- participant holds, and TRIP slip writes flow exclusively through the
-- admin-backed API route (participant_token validated, ref_code dedup 409,
-- payer resolved server-side). The 0001 anon INSERT policy predated trips and
-- let any link-holder bypass that route with a direct PostgREST insert into an
-- open trip session (junk/unbound slips — contained by the payer-confirm gate,
-- but two write doors where the design assumes one).
--
-- Collect-type guest pay (M4, RLS Pattern B) keeps the anon path unchanged:
-- all pre-0004 sessions carry type='collect' (column default at backfill).

drop policy if exists "session_slips_anon_insert_open" on public.session_slips;

create policy "session_slips_anon_insert_open" on public.session_slips
  for insert to anon
  with check (
    exists (select 1 from public.payment_sessions s
            where s.id = session_id
              and s.status = 'open'
              and s.type   = 'collect')
  );
