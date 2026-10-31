const fs = require('node:fs')
const path = require('node:path')
const { createClient } = require('@supabase/supabase-js')
const root = path.resolve(__dirname, '../../../..')
function readEnv(file) {
  const result = {}
  for (const line of fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (match) result[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return result
}
async function main() {
  const local = readEnv('.env.local')
  const test = readEnv('.env.test')
  const admin = createClient(local.NEXT_PUBLIC_SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  for (const label of ['A', 'B']) {
    const client = createClient(local.NEXT_PUBLIC_SUPABASE_URL, local.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
    const email = test[`TEST_USER_${label}_EMAIL`]
    const { data, error } = await client.auth.signInWithPassword({ email, password: test[`TEST_USER_${label}_PASS`] })
    if (error || !data.user || data.user.email?.toLowerCase() !== email.toLowerCase()) throw new Error(`Test user ${label} session verification failed`)
    const userId = data.user.id
    async function del(table, field) {
      const { error } = await admin.from(table).delete().eq(field, userId)
      if (error) throw new Error(`${label} ${table}: ${error.message}`)
    }
    await del('payment_sessions', 'owner')
    for (const table of ['transactions', 'recurring_rules', 'groups', 'budgets', 'accounts', 'plans', 'asset_transactions', 'portfolio_snapshots', 'holdings']) await del(table, 'user_id')
    const { error: assetError } = await admin.from('assets').delete().eq('user_id', userId).eq('is_system', false)
    if (assetError) throw new Error(`${label} assets: ${assetError.message}`)
    console.log(JSON.stringify({ testUser: label, cleaned: true }))
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 })
