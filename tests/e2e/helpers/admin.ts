import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { env } from './env'

/**
 * Service-role client — TEST SETUP/TEARDOWN ONLY (provision confirmed test
 * users, reset test data between runs). Never used to assert app behavior:
 * every assertion goes through the UI with a real user session, so RLS and
 * the user-facing stack stay fully exercised.
 */
let admin: SupabaseClient | null = null

export function adminClient(): SupabaseClient {
  if (!env.serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing from .env.local — cannot provision test users')
  }
  admin ??= createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return admin
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const { data, error } = await adminClient().auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(`listUsers failed: ${error.message}`)
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null
}

/** Create the user if missing; guarantee the email is confirmed either way. */
export async function ensureConfirmedUser(email: string, password: string, displayName?: string): Promise<string> {
  const existing = await findUserByEmail(email)
  if (existing) {
    if (!existing.email_confirmed_at) {
      const { error } = await adminClient().auth.admin.updateUserById(existing.id, { email_confirm: true })
      if (error) throw new Error(`confirm ${email} failed: ${error.message}`)
    }
    return existing.id
  }
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: displayName ? { full_name: displayName } : undefined,
  })
  if (error) throw new Error(`createUser ${email} failed: ${error.message}`)
  return data.user.id
}

/** Wipe a test user's rows so every run starts from a known-empty state. */
export async function resetUserData(userId: string): Promise<void> {
  const a = adminClient()
  // transactions reference accounts — delete them first
  const { error: txErr } = await a.from('transactions').delete().eq('user_id', userId)
  if (txErr) throw new Error(`reset transactions failed: ${txErr.message}`)
  const { error: acctErr } = await a.from('accounts').delete().eq('user_id', userId)
  if (acctErr) throw new Error(`reset accounts failed: ${acctErr.message}`)
}

/**
 * Full wipe for M3/M4 specs: clears the user's budgets, recurring rules
 * (exceptions cascade), groups, then transactions + accounts. FK-safe order:
 * transactions reference accounts/rules/groups, so they go first; accounts last.
 */
export async function resetAllUserData(userId: string): Promise<void> {
  const a = adminClient()
  // transactions first (they reference accounts/rules/groups); accounts last.
  // recurring_exceptions cascade on rule delete (ON DELETE CASCADE on rule_id).
  for (const table of ['transactions', 'recurring_rules', 'groups', 'budgets', 'accounts'] as const) {
    const { error } = await a.from(table).delete().eq('user_id', userId)
    if (error) throw new Error(`reset ${table} failed: ${error.message}`)
  }
}

export async function deleteUserByEmail(email: string): Promise<void> {
  const user = await findUserByEmail(email)
  if (!user) return
  await resetUserData(user.id)
  const { error } = await adminClient().auth.admin.deleteUser(user.id)
  if (error) throw new Error(`deleteUser ${email} failed: ${error.message}`)
}

/** Seed an account directly (account-creation UX is already covered by M1 specs). */
export async function seedAccount(userId: string, name: string, bank: string): Promise<string> {
  const { data, error } = await adminClient()
    .from('accounts')
    .insert({ user_id: userId, name, bank })
    .select('id')
    .single()
  if (error) throw new Error(`seedAccount failed: ${error.message}`)
  return data.id
}
