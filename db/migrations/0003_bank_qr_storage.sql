-- M4: private Storage bucket for host bank/PromptPay QR images.
-- Objects live at {user_id}/{account_id}.{ext}. Owners manage their own folder
-- via the user-session client (storage RLS below). Guests NEVER get a storage
-- policy — the /pay/<token> page serves a short-lived signed URL created
-- server-side after the open-session capability token is validated.

insert into storage.buckets (id, name, public)
values ('bank-qr', 'bank-qr', false)
on conflict (id) do nothing;

create policy "bank_qr_owner_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'bank-qr' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "bank_qr_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bank-qr' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "bank_qr_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'bank-qr' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'bank-qr' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "bank_qr_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'bank-qr' and (storage.foldername(name))[1] = auth.uid()::text);
