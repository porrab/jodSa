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

/**
 * Wipe a test user's /invest module rows so every invest spec starts empty.
 * FK-safe order: asset_transactions (→ holdings, cascade) and portfolio_snapshots
 * first, then holdings (→ assets ON DELETE RESTRICT, so must precede custom-asset
 * delete), then the user's OWN custom assets (never the shared is_system rows).
 * Used by invest-m1/invest-m3 specs the way resetAllUserData is used by M3/M4.
 */
export async function resetInvestData(userId: string): Promise<void> {
  const a = adminClient()
  const { error: txErr } = await a.from('asset_transactions').delete().eq('user_id', userId)
  if (txErr) throw new Error(`reset asset_transactions failed: ${txErr.message}`)
  const { error: snapErr } = await a.from('portfolio_snapshots').delete().eq('user_id', userId)
  if (snapErr) throw new Error(`reset portfolio_snapshots failed: ${snapErr.message}`)
  const { error: hErr } = await a.from('holdings').delete().eq('user_id', userId)
  if (hErr) throw new Error(`reset holdings failed: ${hErr.message}`)
  // custom (owned) assets only — leave the 19 shared is_system reference rows intact
  const { error: aErr } = await a.from('assets').delete().eq('user_id', userId).eq('is_system', false)
  if (aErr) throw new Error(`reset custom assets failed: ${aErr.message}`)
}

export async function deleteUserByEmail(email: string): Promise<void> {
  const user = await findUserByEmail(email)
  if (!user) return
  await resetUserData(user.id)
  const { error } = await adminClient().auth.admin.deleteUser(user.id)
  if (error) throw new Error(`deleteUser ${email} failed: ${error.message}`)
}

/**
 * Seed an account directly (account-creation UX is already covered by M1 specs).
 * Optional `numberHint` (M8, design J4 "เลขท้ายบัญชี") lets a spec seed the
 * last-visible-digits used by the number_hint precedence tier — the account
 * create/edit UI for it is covered at code+unit; here we seed it directly so the
 * behavioral mapping assertion is what's under test, not the form.
 */
export async function seedAccount(
  userId: string,
  name: string,
  bank: string,
  numberHint?: string,
): Promise<string> {
  const row: Record<string, unknown> = { user_id: userId, name, bank }
  if (numberHint !== undefined) row.number_hint = numberHint
  const { data, error } = await adminClient()
    .from('accounts')
    .insert(row)
    .select('id')
    .single()
  if (error) throw new Error(`seedAccount failed: ${error.message}`)
  return data.id
}

/**
 * Seed a budget directly (budget-creation UX is covered by M3-S1). Used by the
 * QA-M7 recurring-deducts spec to assert a materialized occurrence is counted by
 * the budget aggregation ("the budget counts it") without hand-driving the budgets
 * form. The assertion still reads the budget through the real dashboard render.
 */
export async function seedBudget(
  userId: string,
  amountSatang: number,
  opts: { period?: 'day' | 'month'; scope?: 'overall' | 'category'; category?: string | null } = {},
): Promise<string> {
  const { data, error } = await adminClient()
    .from('budgets')
    .insert({
      user_id: userId,
      period: opts.period ?? 'month',
      scope: opts.scope ?? 'overall',
      category: opts.category ?? null,
      amount_satang: amountSatang,
    })
    .select('id')
    .single()
  if (error) throw new Error(`seedBudget failed: ${error.message}`)
  return data.id
}

/**
 * Seed a group directly (M3 group-creation UX is covered by M3-S2). Used by the
 * QA-M9 groups→filter spec: with "groups" gone from the nav (design v3 J5),
 * existing grouped data must stay reachable via the /transactions filter chip —
 * this seeds the group whose chip is under test.
 */
export async function seedGroup(userId: string, title: string): Promise<string> {
  const { data, error } = await adminClient()
    .from('groups')
    .insert({ user_id: userId, title })
    .select('id')
    .single()
  if (error) throw new Error(`seedGroup failed: ${error.message}`)
  return data.id
}

/**
 * Seed a transaction directly (manual-logging UX is covered by M1 specs). Used by
 * QA-M9 for rendered-state assertions (the Home budget one-liner, the group filter
 * chip) where the transaction is context, not the thing under test.
 */
export async function seedTransaction(
  userId: string,
  accountId: string,
  opts: {
    type?: 'income' | 'expense' | 'transfer'
    amountSatang: number
    datetime?: string
    category?: string | null
    counterparty?: string | null
    groupId?: string | null
  },
): Promise<string> {
  const { data, error } = await adminClient()
    .from('transactions')
    .insert({
      user_id: userId,
      account_id: accountId,
      type: opts.type ?? 'expense',
      amount_satang: opts.amountSatang,
      datetime: opts.datetime ?? new Date().toISOString(),
      category: opts.category ?? null,
      counterparty: opts.counterparty ?? null,
      group_id: opts.groupId ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error(`seedTransaction failed: ${error.message}`)
  return data.id
}
