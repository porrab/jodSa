const fs = require('node:fs')
const path = require('node:path')
const { createClient } = require('@supabase/supabase-js')

const root = path.resolve(__dirname, '../../../..')
function readEnv(file) {
  const values = {}
  for (const line of fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return values
}

async function main() {
  const local = readEnv('.env.local')
  const test = readEnv('.env.test')
  const client = createClient(local.NEXT_PUBLIC_SUPABASE_URL, local.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const email = test.TEST_USER_B_EMAIL
  const { data, error } = await client.auth.signInWithPassword({ email, password: test.TEST_USER_B_PASS })
  if (error || !data.user || data.user.email?.toLowerCase() !== email.toLowerCase()) throw new Error('Test user B session verification failed')
  const { error: deleteError } = await client.from('accounts').delete().eq('user_id', data.user.id)
  if (deleteError) throw new Error(`Test user B account cleanup failed: ${deleteError.message}`)
  console.log('Deleted test user B accounts through B session, filtered by B user id')
}

main().catch((error) => { console.error(error.message); process.exitCode = 1 })
