-- Add ON DELETE CASCADE to account_id foreign keys so deleting an account
-- also removes all child rows (transactions, recurring_rules, payment_sessions).

-- transactions.account_id
alter table public.transactions
  drop constraint if exists transactions_account_id_fkey,
  add constraint transactions_account_id_fkey
    foreign key (account_id) references public.accounts(id) on delete cascade;

-- transactions.to_account_id (transfer destination — cascade because SET NULL
-- would violate the transfer_needs_to_account check constraint)
alter table public.transactions
  drop constraint if exists transactions_to_account_id_fkey,
  add constraint transactions_to_account_id_fkey
    foreign key (to_account_id) references public.accounts(id) on delete cascade;

-- recurring_rules.account_id
alter table public.recurring_rules
  drop constraint if exists recurring_rules_account_id_fkey,
  add constraint recurring_rules_account_id_fkey
    foreign key (account_id) references public.accounts(id) on delete cascade;

-- payment_sessions.account_id
alter table public.payment_sessions
  drop constraint if exists payment_sessions_account_id_fkey,
  add constraint payment_sessions_account_id_fkey
    foreign key (account_id) references public.accounts(id) on delete cascade;
