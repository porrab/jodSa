const fs = require('node:fs')
const path = require('node:path')
const { createClient } = require('@supabase/supabase-js')

const root = path.resolve(__dirname, '../../../..')
function readEnv(filename) {
  const result = {}
  for (const line of fs.readFileSync(path.join(root, filename), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (match) result[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return result
}

async function main() {
  const local = readEnv('.env.local')
  const test = readEnv('.env.test')
  for (const label of ['A', 'B']) {
    const client = createClient(local.NEXT_PUBLIC_SUPABASE_URL, local.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const email = test[`TEST_USER_${label}_EMAIL`]
    const password = test[`TEST_USER_${label}_PASS`]
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error || data.user?.email?.toLowerCase() !== email.toLowerCase()) throw new Error(`Test user ${label} sign-in failed`)
    const counts = {}
    for (const table of ['accounts', 'transactions', 'budgets', 'groups', 'recurring_rules', 'holdings', 'asset_transactions', 'portfolio_snapshots', 'plans', 'assets', 'payment_sessions']) {
      let query = client.from(table).select('id', { head: true, count: 'exact' })
      if (table === 'assets') query = query.eq('is_system', false)
      const { count, error: readError } = await query
      if (readError) throw new Error(`${label} ${table}: ${readError.message}`)
      counts[table] = count
    }
    console.log(JSON.stringify({ testUser: label, counts }))
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1 })
