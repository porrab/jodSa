import fs from 'node:fs'
import path from 'node:path'

/**
 * Minimal .env parser so the harness needs no extra dotenv dependency.
 * Reads the repo's existing .env.local (app Supabase project + service key)
 * and .env.test (canonical test users) — never modifies them.
 */
function parseEnvFile(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {}
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[m[1]] = v
  }
  return out
}

const root = path.resolve(__dirname, '../../..')
const local = parseEnvFile(path.join(root, '.env.local'))
const testEnv = parseEnvFile(path.join(root, '.env.test'))

export const env = {
  supabaseUrl: local.NEXT_PUBLIC_SUPABASE_URL ?? testEnv.TEST_SUPABASE_URL ?? '',
  anonKey: local.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? testEnv.TEST_SUPABASE_ANON_KEY ?? '',
  serviceRoleKey: local.SUPABASE_SERVICE_ROLE_KEY ?? '',
  userA: {
    email: testEnv.TEST_USER_A_EMAIL ?? 'test-a@jodsa.test',
    password: testEnv.TEST_USER_A_PASS ?? '',
  },
  userB: {
    email: testEnv.TEST_USER_B_EMAIL ?? 'test-b@jodsa.test',
    password: testEnv.TEST_USER_B_PASS ?? '',
  },
}

export const AUTH_DIR = path.resolve(__dirname, '../.auth')
export const GENERATED_DIR = path.resolve(__dirname, '../.generated')
export const STORAGE_A = path.join(AUTH_DIR, 'userA.json')
export const STORAGE_B = path.join(AUTH_DIR, 'userB.json')
