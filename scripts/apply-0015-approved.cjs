// Owner-authorized migration only. Never import from application code.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')
async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--apply-owner-approved-0015') throw { code: 'EXPLICIT_APPLY_REQUIRED' }
  const root = path.resolve(__dirname, '..')
  const source = fs.readFileSync(path.join(root, 'db/migrations/0015_realtime_publication.sql'), 'utf8')
  const sha = crypto.createHash('sha256').update(source).digest('hex')
  assert.equal(sha, 'fa2f15864823591ad6ffdf42a399f0632df05a657aa2dc41b8e9427e55349eb7', 'SQL_SHA_MISMATCH')
  const env = require('dotenv').parse(fs.readFileSync(path.join(root, '.env.local')))
  const api = new URL(env.NEXT_PUBLIC_SUPABASE_URL), database = new URL(env.DATABASE_URL)
  const ref = api.hostname.split('.')[0]
  if (!api.hostname.endsWith('.supabase.co') || (database.hostname !== `db.${ref}.supabase.co` && decodeURIComponent(database.username) !== `postgres.${ref}`)) throw { code: 'TARGET_MISMATCH' }
  assert.match(source, /^begin;\s*/i); assert.match(source, /\scommit;\s*$/i)
  const body = source.replace(/^begin;\s*/i, '').replace(/\scommit;\s*$/i, '')
  const sql = require('postgres')(env.DATABASE_URL, { prepare: false, max: 1, connect_timeout: 10, idle_timeout: 1, ssl: 'require', onnotice: () => {} })
  try {
    const result = await sql.begin(async tx => {
      const snapshot = async () => ({
        publication: await tx.unsafe(`select oid, puballtables, pubinsert, pubupdate, pubdelete, pubtruncate from pg_publication where pubname='supabase_realtime'`),
        tables: await tx.unsafe(`select c.oid, c.relname, c.relreplident, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('transactions','accounts','budgets') order by c.relname`),
        members: await tx.unsafe(`select schemaname, tablename from pg_publication_tables where pubname='supabase_realtime' order by schemaname,tablename`),
      })
      const before = await snapshot()
      assert.equal(before.publication.length, 1, 'PUBLICATION_MISSING')
      assert.equal(before.tables.length, 3, 'TARGET_TABLE_MISSING')
      assert.ok(before.tables.every(t => t.relrowsecurity), 'RLS_MUST_BE_ENABLED')
      assert.ok(before.publication[0].pubinsert && before.publication[0].pubupdate && before.publication[0].pubdelete, 'PUBLICATION_MUST_EMIT_INSERT_UPDATE_DELETE')
      await tx.unsafe(body)
      const after = await snapshot()
      assert.deepEqual(after.publication, before.publication, 'PUBLICATION_OPTIONS_CHANGED')
      assert.deepEqual(after.tables, before.tables, 'TABLE_SECURITY_OR_REPLICA_IDENTITY_CHANGED')
      const expected = new Set(before.members.map(t => `${t.schemaname}.${t.tablename}`))
      for (const name of ['accounts','budgets','transactions']) expected.add(`public.${name}`)
      assert.deepEqual(after.members.map(t => `${t.schemaname}.${t.tablename}`).sort(), [...expected].sort(), 'PUBLICATION_MEMBERSHIP_MISMATCH')
      return { sqlSha256: sha, publicationTables: after.members.map(t => `${t.schemaname}.${t.tablename}`), replicaIdentityUnchanged: true }
    })
    console.log(JSON.stringify(result))
  } finally { await sql.end({ timeout: 5 }) }
}
main().catch(error => { console.error(error?.code ?? error?.message ?? 'FAILED'); process.exit(1) })
