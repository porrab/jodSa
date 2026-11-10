// Owner-approved live operation only. Do not import from application code.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--apply-owner-approved-0014') throw { code: 'EXPLICIT_APPLY_REQUIRED' }
  const root = path.resolve(__dirname, '..')
  const source = fs.readFileSync(path.join(root, 'db/migrations/0014_push_notifications.sql'), 'utf8')
  const sha = crypto.createHash('sha256').update(source).digest('hex')
  assert.equal(sha, 'cedc59c95bad45afa067549733020d4740789723f20da9969b384c44b5a9a166', 'SQL_SHA_MISMATCH')
  const env = require('dotenv').parse(fs.readFileSync(path.join(root, '.env.local')))
  const api = new URL(env.NEXT_PUBLIC_SUPABASE_URL), database = new URL(env.DATABASE_URL)
  const ref = api.hostname.split('.')[0]
  if (!api.hostname.endsWith('.supabase.co') || (database.hostname !== `db.${ref}.supabase.co` && decodeURIComponent(database.username) !== `postgres.${ref}`)) throw { code: 'TARGET_MISMATCH' }
  assert.match(source, /^begin;\s*/i); assert.match(source, /\scommit;\s*$/i)
  const body = source.replace(/^begin;\s*/i, '').replace(/\scommit;\s*$/i, '')
  const sql = require('postgres')(env.DATABASE_URL, { prepare: false, max: 1, connect_timeout: 10, idle_timeout: 1, ssl: 'require', onnotice: () => {} })
  try {
    const result = await sql.begin(async (tx) => {
      const state = async () => (await tx.unsafe(`select
        to_regclass('public.push_subscriptions') is not null as subscriptions,
        to_regclass('public.user_settings') is not null as settings,
        to_regclass('public.push_deliveries') is not null as deliveries`))[0]
      const before = await state()
      assert.equal(before.subscriptions, false, '0014_ALREADY_APPLIED')
      assert.equal(before.settings, false, 'USER_SETTINGS_ALREADY_EXISTS_REQUIRES_REVIEW')
      assert.equal(before.deliveries, false, 'PUSH_DELIVERIES_ALREADY_EXISTS_REQUIRES_REVIEW')
      await tx.unsafe(body)
      const after = await state()
      assert.deepEqual(after, { subscriptions: true, settings: true, deliveries: true }, '0014_POSTCONDITION_FAILED')
      const [security] = await tx.unsafe(`select p.prosecdef, p.proconfig, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute, has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute from pg_proc p where p.oid = 'public.claim_push_subscription(text,text,text)'::regprocedure`)
      assert.equal(security.prosecdef, true)
      const [args] = await tx.unsafe(`select proargnames from pg_proc where oid = 'public.claim_push_subscription(text,text,text)'::regprocedure`)
      assert.deepEqual(args.proargnames, ['p_endpoint', 'p_p256dh', 'p_auth'])
      assert.ok(security.proconfig.includes('search_path=public'))
      assert.equal(security.anon_execute, false)
      assert.equal(security.authenticated_execute, true)
      const rls = await tx.unsafe(`select relname, relrowsecurity from pg_class where oid in ('public.push_subscriptions'::regclass,'public.user_settings'::regclass,'public.push_deliveries'::regclass)`)
      assert.equal(rls.length, 3)
      assert.ok(rls.every(row => row.relrowsecurity))
      return { sqlSha256: sha, ...after }
    })
    console.log(JSON.stringify(result))
  } finally { await sql.end({ timeout: 5 }) }
}
main().catch((error) => { console.error(error?.code ?? error?.message ?? 'FAILED'); process.exit(1) })
