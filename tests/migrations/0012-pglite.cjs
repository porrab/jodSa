// Isolated proof for SQL 0012. Set PGLITE_MODULE_PATH to a temporary PGlite install
// when @electric-sql/pglite is not a project dependency.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite')

async function main() {
  const root = path.resolve(__dirname, '../..')
  const db = new PGlite()
  const ids = {
    user: '00000000-0000-4000-8000-000000000000',
    foreignUser: '00000000-0000-4000-8000-000000000099',
    a: '00000000-0000-4000-8000-000000000001',
    b: '00000000-0000-4000-8000-000000000002',
    h: '00000000-0000-4000-8000-000000000003',
    asset: '00000000-0000-4000-8000-000000000004',
  }
  try {
    await db.exec(`create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select '${ids.user}'::uuid $$;
      create table public.accounts (id uuid primary key, user_id uuid not null, opening_balance_satang integer not null);
      create table public.assets (id uuid primary key, currency text not null);
      create table public.holdings (id uuid primary key, user_id uuid not null, asset_id uuid not null references public.assets(id));
      create table public.asset_transactions (
        id uuid primary key default gen_random_uuid(), user_id uuid not null, holding_id uuid not null,
        type text not null, qty numeric, price_minor bigint, currency text, fees_minor bigint,
        fx_rate numeric, datetime timestamptz, ref text);
      create table public.transactions (
        id uuid primary key default gen_random_uuid(), user_id uuid not null,
        type text not null check (type in ('income','expense','transfer')),
        amount_satang integer not null, account_id uuid not null references public.accounts(id),
        to_account_id uuid references public.accounts(id), datetime timestamptz,
        constraint transfer_needs_to_account check (
          (type = 'transfer' and to_account_id is not null) or
          (type <> 'transfer' and to_account_id is null)));
      insert into public.accounts values ('${ids.a}', '${ids.user}', 1000), ('${ids.b}', '${ids.user}', 2000);
      insert into public.assets values ('${ids.asset}', 'THB');
      insert into public.holdings values ('${ids.h}', '${ids.user}', '${ids.asset}');
      insert into public.transactions (id, user_id, type, amount_satang, account_id, to_account_id) values
        ('00000000-0000-4000-8000-000000000011', '${ids.user}', 'income', 500, '${ids.a}', null),
        ('00000000-0000-4000-8000-000000000012', '${ids.user}', 'expense', 100, '${ids.a}', null),
        ('00000000-0000-4000-8000-000000000013', '${ids.user}', 'transfer', 200, '${ids.a}', '${ids.b}');`)
    const oldMigration = fs.readFileSync(path.join(root, 'db/migrations/0006_perf_balance_rpc_materialize_guard.sql'), 'utf8')
    const oldFunction = oldMigration.match(/create or replace function public\.account_balances\(\)[\s\S]*?\$\$;/i)?.[0]
    assert.ok(oldFunction, 'old account_balances definition not found')
    await db.exec(oldFunction)
    const rows = () => db.query('select id::text, type, amount_satang, account_id::text, to_account_id::text from public.transactions order by id')
    const balances = () => db.query('select account_id::text, balance_satang::text from public.account_balances() order by account_id')
    const metadata = () => db.query(`select p.proowner::text, p.prosecdef, p.proacl::text, p.proconfig::text
      from pg_proc p where p.oid = 'public.account_balances()'::regprocedure`)
    const transferCheck = () => db.query(`select pg_get_constraintdef(oid) as definition from pg_constraint
      where conrelid = 'public.transactions'::regclass and conname = 'transfer_needs_to_account'`)
    const before = { rows: (await rows()).rows, balances: (await balances()).rows,
      metadata: (await metadata()).rows, transferCheck: (await transferCheck()).rows }
    assert.deepEqual(before.balances.map((row) => row.balance_satang), ['1200', '2200'])

    await db.exec(fs.readFileSync(path.join(root, 'db/migrations/0012_invest_divest_cash_links.sql'), 'utf8'))
    assert.deepEqual((await rows()).rows, before.rows, 'existing rows changed')
    assert.deepEqual((await balances()).rows, before.balances, 'legacy balances changed')
    assert.deepEqual((await metadata()).rows, before.metadata, 'function security/owner/grants/search_path changed')
    assert.deepEqual((await transferCheck()).rows, before.transferCheck, 'transfer check changed')

    await db.exec(`insert into public.transactions (id, user_id, type, amount_satang, account_id, holding_id) values
      ('00000000-0000-4000-8000-000000000014', '${ids.user}', 'invest', 300, '${ids.a}', '${ids.h}'),
      ('00000000-0000-4000-8000-000000000015', '${ids.user}', 'divest', 50, '${ids.b}', '${ids.h}');`)
    assert.deepEqual((await balances()).rows.map((row) => row.balance_satang), ['900', '2250'])
    await assert.rejects(db.exec(`insert into public.transactions (id, user_id, type, amount_satang, account_id)
      values ('00000000-0000-4000-8000-000000000016', '${ids.user}', 'bogus', 1, '${ids.a}')`), /transactions_type_check/)
    const pairArgs = `'${ids.h}', 2, 100, 'THB', 0, null, '2026-10-28T10:00:00Z', null, '${ids.a}'`
    const count = async (table) => Number((await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n)
    const cashBefore = await count('transactions')
    const buyBefore = await count('asset_transactions')
    await assert.rejects(db.exec(`select * from public.record_buy_with_cash(${pairArgs}, 0)`), /Invalid buy amount/)
    assert.equal(await count('transactions'), cashBefore)
    assert.equal(await count('asset_transactions'), buyBefore)
    await db.exec(`select * from public.record_buy_with_cash(${pairArgs}, 250)`)
    assert.equal(await count('transactions'), cashBefore + 1)
    assert.equal(await count('asset_transactions'), buyBefore + 1)
    // Fail the second insert after the buy insert: PostgreSQL must roll back both.
    await db.exec('alter table public.transactions add constraint cash_limit_for_test check (amount_satang < 1000)')
    await assert.rejects(db.exec(`select * from public.record_buy_with_cash(${pairArgs}, 1000)`), /cash_limit_for_test/)
    assert.equal(await count('transactions'), cashBefore + 1)
    assert.equal(await count('asset_transactions'), buyBefore + 1)
    console.log('0012 PGlite proof passed: legacy rows/balances/security unchanged; direction, type CHECK and atomic buy+cash rollback verified')
  } finally {
    await db.close()
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
