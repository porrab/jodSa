// Owner-approved live operation only. Do not import from application code.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--apply-owner-approved-0013') {
    throw { code: 'EXPLICIT_APPLY_REQUIRED' }
  }
  const root = path.resolve(__dirname, '..')
  const source = fs.readFileSync(path.join(root, 'db/migrations/0013_revoke_anon_record_buy_with_cash.sql'), 'utf8')
  const sha = crypto.createHash('sha256').update(source).digest('hex')
  assert.equal(sha, '18876f9c24b64c30e03790bd093e4226e66df3877cd9b02bc6b4b6b0965eea8d', 'SQL_SHA_MISMATCH')

  const env = require('dotenv').parse(fs.readFileSync(path.join(root, '.env.local')))
  const api = new URL(env.NEXT_PUBLIC_SUPABASE_URL)
  const database = new URL(env.DATABASE_URL)
  const reference = api.hostname.split('.')[0]
  if (!api.hostname.endsWith('.supabase.co') ||
      (database.hostname !== `db.${reference}.supabase.co` &&
       decodeURIComponent(database.username) !== `postgres.${reference}`)) throw { code: 'TARGET_MISMATCH' }

  assert.match(source, /^begin;\s*/i)
  assert.match(source, /\scommit;\s*$/i)
  const body = source.replace(/^begin;\s*/i, '').replace(/\scommit;\s*$/i, '')
  const sql = require('postgres')(env.DATABASE_URL, {
    prepare: false, max: 1, connect_timeout: 10, idle_timeout: 1, ssl: 'require',
    onnotice: () => {},
  })
  const signature = 'public.record_buy_with_cash(uuid, numeric, bigint, text, bigint, numeric, timestamptz, text, uuid, integer)'
  try {
    const result = await sql.begin(async (tx) => {
      const acl = async () => (await tx.unsafe(`select
        has_function_privilege('anon', '${signature}', 'EXECUTE') as anon_execute,
        has_function_privilege('authenticated', '${signature}', 'EXECUTE') as authenticated_execute,
        pg_get_functiondef('${signature}'::regprocedure) as definition,
        p.proowner::text as owner, p.prosecdef as security_definer, p.proconfig::text as config
        from pg_proc p where p.oid = '${signature}'::regprocedure`))[0]
      const before = await acl()
      assert.ok(before, '0012_FUNCTION_MISSING')
      assert.equal(before.anon_execute, true, '0013_ALREADY_APPLIED')
      assert.equal(before.authenticated_execute, true, 'AUTHENTICATED_EXECUTE_MISSING_BEFORE')
      await tx.unsafe(body)
      const after = await acl()
      assert.equal(after.anon_execute, false, 'ANON_EXECUTE_REMAINS; transaction rolled back')
      assert.equal(after.authenticated_execute, true, 'AUTHENTICATED_EXECUTE_LOST; transaction rolled back')
      for (const key of ['definition', 'owner', 'security_definer', 'config']) {
        assert.deepEqual(after[key], before[key], `${key.toUpperCase()}_CHANGED; transaction rolled back`)
      }
      return { sqlSha256: sha, anonExecute: after.anon_execute, authenticatedExecute: after.authenticated_execute }
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
