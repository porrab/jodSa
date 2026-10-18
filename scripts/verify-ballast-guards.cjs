// Source-derived preflight predicate checks. READ ONLY; no migration execution.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

async function main() {
  const root = path.resolve(__dirname, '..')
  const source = fs.readFileSync(path.join(root, 'db/migrations/0010_invest_ballast_sleeve.sql'), 'utf8')
  const check = source.match(/if v_canonical_expr not in \(([\s\S]*?)\n  \) then/)
  const defaultGuard = source.match(/or btrim\(coalesce\(v_default_expr, ''\)\)\s+not in \(([\s\S]*?)\) then/)
  if (!check || !defaultGuard) throw Object.assign(new Error(), { code: 'PREDICATE_NOT_FOUND' })

  const env = require('dotenv').parse(fs.readFileSync(path.join(root, '.env.local')))
  const api = new URL(env.NEXT_PUBLIC_SUPABASE_URL)
  const reference = api.hostname.split('.')[0]
  const database = new URL(env.DATABASE_URL)
  if (!api.hostname.endsWith('.supabase.co') ||
      (database.hostname !== `db.${reference}.supabase.co` &&
       decodeURIComponent(database.username) !== `postgres.${reference}`)) {
    throw Object.assign(new Error(), { code: 'TARGET_MISMATCH' })
  }

  const expression = "sleeve = ANY (ARRAY['core'::text, 'satellite'::text, 'risk_capital'::text])"
  const cases = [
    ['canonical', expression, true],
    ['parenthesized', `(${expression})`, true],
    ['outer whitespace', `  ${expression}  `, true],
    ['typed IN', "sleeve IN ('core'::text, 'satellite'::text, 'risk_capital'::text)", true],
    ['uppercase literal', expression.replace("'core'", "'CORE'"), false],
    ['spaced core', expression.replace("'core'", "'c ore'"), false],
    ['spaced risk', expression.replace("'risk_capital'", "'risk_ capital'"), false],
    ['extra value', expression.replace("'risk_capital'::text", "'risk_capital'::text, 'ballast'::text"), false],
    ['OR branch', `${expression} OR true`, false],
    ['another column', `${expression} AND user_id IS NOT NULL`, false],
    ['missing expression', null, false],
  ].map(([label, value, expected_check]) => ({
    label, expression: value, default_value: "'core'::text", expected_check, expected_default: true,
  }))
  for (const [label, value, expected_default] of [
    ['untyped default', "'core'", true],
    ['uppercase default', "'CORE'::text", false],
    ['spaced default', "'c ore'::text", false],
    ['changed default expression', "'core'::text || ''", false],
    ['missing default', null, false],
  ]) {
    cases.push({ label, expression, default_value: value, expected_check: true, expected_default })
  }

  const sql = require('postgres')(env.DATABASE_URL, {
    prepare: false, max: 1, connect_timeout: 10, idle_timeout: 1, ssl: 'require',
  })
  try {
    await sql.unsafe('begin read only')
    const query = `select label, expected_check, expected_default,
      btrim(coalesce(expression, '')) in (${check[1]}) as accepted_check,
      btrim(coalesce(default_value, '')) in (${defaultGuard[1]}) as accepted_default
      from jsonb_to_recordset($1::jsonb) as c(label text, expression text,
        default_value text, expected_check boolean, expected_default boolean)`
    // postgres serializes jsonb parameters itself; never double-encode a JSON string.
    const rows = await sql.unsafe(query, [sql.json(cases)])
    const failures = rows.filter(row =>
      row.accepted_check !== row.expected_check || row.accepted_default !== row.expected_default)
    console.log(JSON.stringify({
      readOnly: true, ddlExecuted: false, cases: rows.length,
      passed: rows.length - failures.length, failures,
      sqlSha256: crypto.createHash('sha256').update(source).digest('hex'),
    }))
    if (failures.length || rows.length !== cases.length) process.exitCode = 1
  } finally {
    try { await sql.unsafe('rollback') } finally { await sql.end({ timeout: 2 }) }
  }
}

main().catch(error => {
  // Never print connection strings, credential values, or authenticated traces.
  console.error(`GUARD_TEST_FAILED code=${String(error.code || 'UNSPECIFIED')}`)
  process.exitCode = 1
})
