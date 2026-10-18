// Trusted, explicit migration operation. Never imported by application code.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')

async function main() {
  if (process.argv[2] !== '--apply-owner-approved-0010') throw { code: 'EXPLICIT_APPLY_REQUIRED' }
  const root = path.resolve(__dirname, '..')
  const source = fs.readFileSync(path.join(root, 'db/migrations/0010_invest_ballast_sleeve.sql'), 'utf8')
  const sha = crypto.createHash('sha256').update(source).digest('hex')
  assert.equal(sha, '74c6cde5e1aab17b79158b24ec5cfaff1d7c10281ea206ca6eed4d298d4f768e')
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
  const metadata = async (connection) => (await connection.unsafe(`select jsonb_build_object(
    'table', (select jsonb_build_array(relowner, relacl, relrowsecurity, relforcerowsecurity)
      from pg_class where oid='public.holdings'::regclass),
    'columns', (select jsonb_agg(jsonb_build_array(a.attname, format_type(a.atttypid,a.atttypmod),
      a.attnotnull, pg_get_expr(d.adbin,d.adrelid,true)) order by a.attnum)
      from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid='public.holdings'::regclass and a.attnum>0 and not a.attisdropped),
    'policies', (select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p
      where schemaname='public' and tablename='holdings'),
    'grants', (select jsonb_agg(to_jsonb(g) order by grantee,privilege_type,grantor)
      from information_schema.role_table_grants g where table_schema='public' and table_name='holdings'),
    'indexes', (select jsonb_agg(to_jsonb(i) order by indexname) from pg_indexes i
      where schemaname='public' and tablename='holdings'),
    'otherConstraints', (select jsonb_agg(jsonb_build_array(c.conname,c.contype,
      c.convalidated,pg_get_constraintdef(c.oid,true)) order by c.conname,c.conrelid)
      from pg_constraint c where (c.conrelid='public.holdings'::regclass
      or c.confrelid='public.holdings'::regclass) and not (c.conrelid='public.holdings'::regclass
      and c.contype='c' and c.conkey @> array[(select attnum from pg_attribute
      where attrelid='public.holdings'::regclass and attname='sleeve')]::smallint[])),
    'rows', (select jsonb_build_object('count',count(*),'digest',md5(coalesce(
      string_agg(md5(to_jsonb(h)::text),'' order by h.id),''))) from public.holdings h)
  ) as state`))[0].state
  const sleeve = async (connection) => await connection.unsafe(`select c.conname, c.convalidated,
    cardinality(c.conkey) as key_count, pg_get_expr(c.conbin,c.conrelid,true) as expression
    from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
    where c.conrelid='public.holdings'::regclass and c.contype='c' and a.attname='sleeve'`)
  let committed = false
  let commitAttempted = false
  try {
    const beginOffset = source.indexOf('\nbegin;') + '\nbegin;'.length
    const doOffset = source.indexOf('\ndo $$')
    const commitOffset = source.lastIndexOf('\ncommit;')
    assert.ok(beginOffset > '\nbegin;'.length && doOffset > beginOffset && commitOffset > doOffset)
    // postgres.begin reserves one connection and owns BEGIN/COMMIT/ROLLBACK.
    // Only those outer transaction statements are replaced by the driver scope.
    // Exact approved timeout, lock, guard and DDL stay inside that transaction.
    const updated = await sql.begin(async connection => {
    await connection.unsafe(source.slice(beginOffset, doOffset))
    const before = await metadata(connection)
    const old = await sleeve(connection)
    assert.equal(old.length, 1)
    assert.equal(old[0].convalidated, true)
    assert.equal(old[0].key_count, 1)
    assert.equal(old[0].expression, "sleeve = ANY (ARRAY['core'::text, 'satellite'::text, 'risk_capital'::text])")
    assert.equal(before.table[2], true)
    assert.equal(before.table[3], false)
    assert.equal(before.policies.length, 4)
    await connection.unsafe(source.slice(doOffset, commitOffset))
    assert.deepEqual(await metadata(connection), before)
    const updated = await sleeve(connection)
    assert.equal(updated.length, 1)
    assert.equal(updated[0].conname, 'holdings_sleeve_values')
    assert.equal(updated[0].convalidated, true)
    assert.equal(updated[0].key_count, 1)
    assert.equal(updated[0].expression, "sleeve = ANY (ARRAY['core'::text, 'ballast'::text, 'satellite'::text, 'risk_capital'::text])")
    commitAttempted = true
    return updated
    })
    committed = true
    assert.deepEqual(await sleeve(sql), updated)
    console.log(JSON.stringify({ applied: true, committed, sqlSha256: sha,
      checkedAt: new Date().toISOString(), preserved: ['all holding row contents and count',
        'column types, defaults and nullability', 'RLS flags and four policies',
        'grants and table ownership', 'indexes and other constraints including incoming foreign keys'],
      postCommitConstraintVerified: true }))
  } catch (error) {
    // A lost COMMIT acknowledgement is indeterminate; never claim rollback.
    console.error(JSON.stringify({ applied: committed ? true : (commitAttempted ? 'unknown' : false),
      transactionState: committed ? 'committed' : (commitAttempted ? 'commit acknowledgement uncertain; inspect database before retry' : 'transaction aborted; driver rollback requested'),
      code: String(error.code || 'VERIFICATION_FAILED') }))
    process.exitCode = 1
  } finally { await sql.end({ timeout: 2 }) }
}
main().catch(error => {
  console.error(`APPLY_FAILED code=${String(error.code || 'UNSPECIFIED')}`)
  process.exitCode = 1
})
