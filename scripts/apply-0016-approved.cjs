// Owner-authorized only. Catalog inspection and migration share one transaction.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict')
async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--apply-owner-approved-0016') throw { code: 'EXPLICIT_APPLY_REQUIRED' }
  const root = path.resolve(__dirname, '..')
  const source = fs.readFileSync(path.join(root, 'db/migrations/0016_realtime_broadcast.sql'), 'utf8')
  const sha = crypto.createHash('sha256').update(source).digest('hex')
  assert.equal(sha, '4d9e26abe799c3579f1bf982587223e472b215839fa2a4d0760b1a2e70f5986b', 'SQL_SHA_MISMATCH')
  const env = require('dotenv').parse(fs.readFileSync(path.join(root, '.env.local')))
  const api = new URL(env.NEXT_PUBLIC_SUPABASE_URL), database = new URL(env.DATABASE_URL), ref = api.hostname.split('.')[0]
  if (!api.hostname.endsWith('.supabase.co') || (database.hostname !== `db.${ref}.supabase.co` && decodeURIComponent(database.username) !== `postgres.${ref}`)) throw { code: 'TARGET_MISMATCH' }
  assert.match(source, /^begin;\s*/i); assert.match(source, /\scommit;\s*$/i)
  const sql = require('postgres')(env.DATABASE_URL, { prepare: false, max: 1, connect_timeout: 10, idle_timeout: 1, ssl: 'require', onnotice: () => {} })
  try {
    const result = await sql.begin(async tx => {
      const snapshot = async () => ({
        tables: await tx.unsafe(`select c.oid, c.relname, c.relreplident, c.relrowsecurity, c.relforcerowsecurity from pg_class c where c.oid in ('public.accounts'::regclass,'public.transactions'::regclass,'public.budgets'::regclass,'realtime.messages'::regclass) order by c.oid`),
        members: await tx.unsafe(`select schemaname,tablename from pg_publication_tables where pubname='supabase_realtime' order by schemaname,tablename`),
        publication: await tx.unsafe(`select puballtables,pubinsert,pubupdate,pubdelete,pubtruncate from pg_publication where pubname='supabase_realtime'`),
        policies: await tx.unsafe(`select policyname,roles,cmd,qual,with_check from pg_policies where schemaname='realtime' and tablename='messages' order by policyname`),
      })
      const before = await snapshot()
      assert.equal(before.publication.length, 1, 'PUBLICATION_MISSING')
      assert.equal(before.publication[0].puballtables, false, 'ALL_TABLES_PUBLICATION_UNSAFE')
      assert.equal(before.tables.length, 4)
      assert.ok(before.tables.every(t => t.relrowsecurity), 'RLS_REQUIRED')
      assert.equal(before.policies.length, 0, 'EXISTING_REALTIME_POLICIES_REQUIRE_REVIEW')
      const [send] = await tx.unsafe(`select pg_get_function_result(p.oid) as result, p.prosrc, l.lanname from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure('realtime.send(jsonb,text,text,boolean)')`)
      assert.ok(send, 'REALTIME_SEND_SIGNATURE_MISSING')
      assert.equal(send.result, 'void')
      assert.equal(send.lanname, 'plpgsql')
      // Inspect the actual project definition, not just upstream documentation.
      const sendWarns = /exception[\s\S]*when\s+others[\s\S]*raise\s+warning/i.test(send.prosrc)
      assert.ok(sendWarns, 'REALTIME_SEND_ERROR_BEHAVIOUR_REQUIRES_REVIEW')
      const existing = await tx.unsafe(`select to_regprocedure('public.broadcast_user_change()') is not null as present`)
      assert.equal(existing[0].present, false, '0016_ALREADY_APPLIED')
      await tx.unsafe(source.replace(/^begin;\s*/i, '').replace(/\scommit;\s*$/i, ''))
      const after = await snapshot()
      assert.deepEqual(after.tables, before.tables, 'TABLE_SECURITY_OR_IDENTITY_CHANGED')
      assert.deepEqual(after.publication, before.publication, 'PUBLICATION_OPTIONS_CHANGED')
      const targets = new Set(['public.accounts','public.transactions','public.budgets'])
      assert.deepEqual(after.members, before.members.filter(t => !targets.has(`${t.schemaname}.${t.tablename}`)), 'PUBLICATION_DROP_MISMATCH')
      assert.equal(after.policies.length, 1)
      const policy = after.policies[0]
      assert.equal(policy.policyname, 'user broadcast receive'); assert.equal(policy.cmd, 'SELECT'); assert.deepEqual(policy.roles, ['authenticated']); assert.equal(policy.with_check, null)
      assert.match(policy.qual, /realtime.topic\(\)/); assert.match(policy.qual, /auth.uid\(\)/); assert.match(policy.qual, /user:/); assert.match(policy.qual, /extension.*broadcast/)
      const [fn] = await tx.unsafe(`select p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) as owner,p.prosrc,has_function_privilege('anon',p.oid,'EXECUTE') as anon,has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated, exists(select 1 from aclexplode(p.proacl) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute from pg_proc p where p.oid='public.broadcast_user_change()'::regprocedure`)
      assert.equal(fn.owner, 'postgres'); assert.equal(fn.prosecdef, true); assert.ok(fn.proconfig.some(c => c === 'search_path=""' || c === 'search_path='))
      assert.equal(fn.anon, false); assert.equal(fn.authenticated, false); assert.equal(fn.public_execute, false)
      assert.match(fn.prosrc, /exception when others then null/i)
      const triggers = await tx.unsafe(`select c.relname,t.tgtype,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid where t.tgfoid='public.broadcast_user_change()'::regprocedure order by c.relname`)
      assert.deepEqual(triggers.map(t => t.relname), ['accounts','budgets','transactions'])
      assert.ok(triggers.every(t => t.tgtype === 29 && t.tgenabled === 'O'), 'AFTER_ROW_INSERT_UPDATE_DELETE_REQUIRED')
      return { sqlSha256: sha, realtimeSendSignature: 'realtime.send(jsonb,text,text,boolean)', realtimeSendWarns: sendWarns, triggerExceptionsSwallowed: true, broadcastPolicies: 1, postgresChangesRemoved: true }
    })
    console.log(JSON.stringify(result))
  } finally { await sql.end({ timeout: 5 }) }
}
main().catch(error => { console.error(error?.code ?? error?.message ?? 'FAILED'); process.exit(1) })
