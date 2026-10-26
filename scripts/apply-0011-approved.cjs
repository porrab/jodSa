// Trusted, explicit migration operation. Never imported by application code.
// Owner authorized applying SQL 0011 to live Supabase on 2026-10-26.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')

async function main() {
  if (process.argv[2] !== '--apply-owner-approved-0011') throw { code: 'EXPLICIT_APPLY_REQUIRED' }
  const root = path.resolve(__dirname, '..')
  const source = fs.readFileSync(
    path.join(root, 'db/migrations/0011_transaction_note_account_reconciled_at.sql'), 'utf8')
  const sha = crypto.createHash('sha256').update(source).digest('hex')
  assert.equal(sha, '53553d03434ff647fc21cdb8a7912a06d7971d9c6f6fdf3e5650c0ddce593708')
  const env = require('dotenv').parse(fs.readFileSync(path.join(root, '.env.local')))
  const api = new URL(env.NEXT_PUBLIC_SUPABASE_URL)
  const database = new URL(env.DATABASE_URL)
  const reference = api.hostname.split('.')[0]
  if (!api.hostname.endsWith('.supabase.co') ||
      (database.hostname !== `db.${reference}.supabase.co` &&
       decodeURIComponent(database.username) !== `postgres.${reference}`)) throw { code: 'TARGET_MISMATCH' }
  const sql = require('postgres')(env.DATABASE_URL, {
    prepare: false, max: 1, connect_timeout: 10, idle_timeout: 1, ssl: 'require',
    onnotice: () => {},
  })
  const columns = () => sql.unsafe(`select table_name, column_name, data_type, is_nullable
    from information_schema.columns where table_schema='public'
    and ((table_name='transactions' and column_name='note')
      or (table_name='accounts' and column_name='reconciled_at')) order by table_name`)
  const digest = (table) => sql.unsafe(`select count(*)::int as count,
    md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by t.id),'')) as digest
    from public.${table} t`)
  try {
    assert.equal((await columns()).length, 0, 'columns already exist; 0011 is not idempotent')
    const before = { tx: (await digest('transactions'))[0], acct: (await digest('accounts'))[0] }
    await sql.unsafe(source)
    const after = await columns()
    const check = await sql.unsafe(`select conname, convalidated, pg_get_constraintdef(oid,true) as def
      from pg_constraint where conrelid='public.transactions'::regclass and conname='transactions_note_length'`)
    const counts = {
      tx: (await sql.unsafe('select count(*)::int as count, count(note)::int as notes from public.transactions'))[0],
      acct: (await sql.unsafe('select count(*)::int as count, count(reconciled_at)::int as reconciled from public.accounts'))[0],
    }
    assert.equal(after.length, 2)
    assert.equal(check.length, 1)
    assert.equal(counts.tx.count, before.tx.count)
    assert.equal(counts.acct.count, before.acct.count)
    assert.equal(counts.tx.notes, 0)
    assert.equal(counts.acct.reconciled, 0)
    console.log(JSON.stringify({ before: { tx: before.tx.count, acct: before.acct.count }, after, check, counts }, null, 2))
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((error) => {
  console.error(error && error.code ? error.code : error && error.message ? error.message : 'FAILED')
  process.exit(1)
})
