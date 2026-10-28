// ACL-only proof for staged SQL 0013. Set PGLITE_MODULE_PATH to a temporary
// PGlite install when @electric-sql/pglite is not a project dependency.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite')

async function main() {
  const db = new PGlite()
  const signature = `public.record_buy_with_cash(uuid, numeric, bigint, text, bigint, numeric, timestamptz, text, uuid, integer)`
  try {
    await db.exec(`create role anon; create role authenticated;
      create function public.record_buy_with_cash(
        uuid, numeric, bigint, text, bigint, numeric, timestamptz, text, uuid, integer
      ) returns void language sql security invoker set search_path = '' as $$ select null $$;
      revoke execute on function ${signature} from public;
      grant execute on function ${signature} to anon, authenticated;`)
    const inspect = async () => (await db.query(`select
      has_function_privilege('anon', '${signature}', 'EXECUTE') as anon_execute,
      has_function_privilege('authenticated', '${signature}', 'EXECUTE') as authenticated_execute,
      pg_get_functiondef('${signature}'::regprocedure) as definition,
      p.proowner::text as owner, p.prosecdef as security_definer, p.proconfig::text as config
      from pg_proc p where p.oid = '${signature}'::regprocedure`)).rows[0]
    const before = await inspect()
    assert.equal(before.anon_execute, true, 'fixture must reproduce Supabase anon=X')
    assert.equal(before.authenticated_execute, true)
    await db.exec(fs.readFileSync(path.join(__dirname, '../../db/migrations/0013_revoke_anon_record_buy_with_cash.sql'), 'utf8'))
    const after = await inspect()
    assert.equal(after.anon_execute, false, '0013 must remove anon execute')
    assert.equal(after.authenticated_execute, true, '0013 must retain authenticated execute')
    for (const key of ['definition', 'owner', 'security_definer', 'config']) {
      assert.deepEqual(after[key], before[key], `${key} changed`)
    }
    console.log('0013 PGlite ACL proof passed: anon EXECUTE true→false; authenticated EXECUTE true→true; owner/security/search_path/definition unchanged')
  } finally {
    await db.close()
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
