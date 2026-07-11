'use server'

import { createClient } from '@/lib/supabase/server'
import { hasFingerprintSignal } from '@/lib/account-map'

/**
 * Top precedence tier of the M8 account-mapping resolver: has this exact
 * fingerprint (bank_code|app_signature|sender_mask) been confirmed/corrected
 * to a specific account before? RLS (`slip_account_map_select_own`) scopes
 * this to the caller's own rows; the explicit `user_id` filter matches the
 * style of the other proactive lookups in app/actions/transactions.ts.
 *
 * Returns null (no lookup performed) for a no-signal fingerprint ("||") —
 * every unidentifiable slip would otherwise collide on the same row.
 */
export async function lookupSlipAccountMap(fingerprint: string): Promise<{ accountId: string | null }> {
  if (!hasFingerprintSignal(fingerprint)) return { accountId: null }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { accountId: null }

  const { data } = await supabase
    .from('slip_account_map')
    .select('account_id')
    .eq('user_id', user.id)
    .eq('fingerprint', fingerprint)
    .maybeSingle()

  return { accountId: data?.account_id ?? null }
}

/**
 * The learning loop (M8): on every successful transaction save from a slip,
 * record which account the fingerprint resolved to — whether the user
 * confirmed the auto-pick as-is or corrected it. `account_id` is always
 * overwritten to the latest choice (a correction immediately takes over the
 * next slip with the same fingerprint); `hits`/`last_used_at` accumulate for
 * future "learned N times" UI. Best-effort — a failure here must never block
 * the transaction save that already succeeded, so errors are swallowed.
 */
export async function recordSlipAccountMapping(fingerprint: string, accountId: string): Promise<void> {
  if (!accountId || !hasFingerprintSignal(fingerprint)) return

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { data: existing } = await supabase
    .from('slip_account_map')
    .select('id, hits')
    .eq('user_id', user.id)
    .eq('fingerprint', fingerprint)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('slip_account_map')
      .update({
        account_id: accountId,
        hits: existing.hits + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
  } else {
    await supabase.from('slip_account_map').insert({
      user_id: user.id,
      fingerprint,
      account_id: accountId,
      hits: 1,
      last_used_at: new Date().toISOString(),
    })
  }
}
