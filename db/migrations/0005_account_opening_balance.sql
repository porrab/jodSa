-- Opening balance: the account's starting amount (satang). NOT a transaction —
-- kept off income/expense/transfer/budget analysis; it only seeds the account's
-- running balance in computeAccountBalance. Existing rows default to 0.
-- No new RLS needed: the column is covered by the accounts row policies.

alter table accounts
  add column if not exists opening_balance_satang integer not null default 0;
