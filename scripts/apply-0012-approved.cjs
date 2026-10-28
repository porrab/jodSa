// Owner-approved live operation only. Do not import from application code.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--apply-owner-approved-0012') {
    throw { code: 'EXPLICIT_APPLY_REQUIRED' }
  }
  const root = path.resolve(__dirname, '..')
  const source = fs.readFileSync(path.join(root, 'db/migrations/0012_invest_divest_cash_links.sql'), 'utf8')
  const sha = crypto.createHash('sha256').update(source).digest('hex')
  assert.equal(sha, '5bfafc0891c66bbcc2322263026fa2937b60ab72de7d4f342440e06bb024625b', 'SQL_SHA_MISMATCH')

  const env = require('dotenv').parse(fs.readFileSync(path.join(root, '.env.local')))
  const api = new URL(env.NEXT_PUBLIC_SUPABASE_URL)
  const database = new URL(env.DATABASE_URL)
  const reference = api.hostname.split('.')[0]
  if (!api.hostname.endsWith('.supabase.co') ||
      (database.hostname !== `db.${reference}.supabase.co` &&
       decodeURIComponent(database.username) !== `postgres.${reference}`)) throw { code: 'TARGET_MISMATCH' }

  // The SQL file is self-contained for manual migration tools. Strip only its outer
  // transaction markers so postgres.js owns the transaction and can roll back a
  // failed balance assertion before any change becomes visible.
  assert.match(source, /^begin;\s*/i)
  assert.match(source, /\scommit;\s*$/i)
  const body = source.replace(/^begin;\s*/i, '').replace(/\scommit;\s*$/i, '')
  const sql = require('postgres')(env.DATABASE_URL, {
    prepare: false, max: 1, connect_timeout: 10, idle_timeout: 1, ssl: 'require',
    onnotice: () => {},
  })
  try {
    const result = await sql.begin(async (tx) => {
      const existing = await tx.unsafe(`select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'transactions' and column_name = 'holding_id'`)
      assert.equal(existing.length, 0, '0012_ALREADY_APPLIED')
      const newTypes = await tx.unsafe(`select count(*)::int as count from public.transactions
        where type in ('invest', 'divest')`)
      assert.equal(newTypes[0].count, 0, 'NEW_TYPE_ROWS_BEFORE_MIGRATION')
      const balances = async () => (await tx.unsafe(`select account_id::text, balance_satang::text
        from public.account_balances() order by account_id`)).map(({ account_id, balance_satang }) => ({ account_id, balance_satang }))
      const before = await balances()
      await tx.unsafe(body)
      const after = await balances()
      assert.deepEqual(after, before, 'ACCOUNT_BALANCES_CHANGED; transaction rolled back')
      return { accountsChecked: before.length, sqlSha256: sha }
    })
    console.log(JSON.stringify(result))
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((error) => {
  console.error(error && error.code ? error.code : error && error.message ? error.message : 'FAILED')
  process.exit(1)
})
