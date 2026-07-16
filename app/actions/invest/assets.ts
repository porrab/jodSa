'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { customAssetSchema, classifyProxyClassSchema } from '@/lib/validators/invest'

/**
 * Create a user-scoped custom asset when nothing in the seeded reference list
 * matches (02-architecture.md "Asset classification & resolution": on no match,
 * the picker shows a "classify this holding" create path — the app never
 * silently assumes a class).
 */
export async function createCustomAsset(_prev: { error: string; id?: string }, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const parsed = customAssetSchema.safeParse({
    name: formData.get('name'),
    symbol: formData.get('symbol') || undefined,
    assetClass: formData.get('asset_class'),
    currency: formData.get('currency'),
    region: formData.get('region') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }
  const v = parsed.data

  const { data, error } = await supabase
    .from('assets')
    .insert({
      name: v.name,
      symbol: v.symbol ?? null,
      asset_class: v.assetClass,
      currency: v.currency,
      region: v.region ?? null,
      is_system: false,
      user_id: user.id,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  revalidatePath('/invest')
  return { error: '', id: data.id }
}

/**
 * M5 — classify a holding's asset with a proxy_class so it can enter a plan
 * (lib/invest/planner/resolve.ts blocks unclassified holdings). Only ever
 * targets a user-owned custom asset: the RLS "assets_update_own_custom"
 * policy from 0008 already restricts UPDATE to `is_system = false AND
 * user_id = auth.uid()`, so this quietly no-ops (0 rows matched) against a
 * system-seeded asset rather than needing a new policy — those are backfilled
 * by migration 0009 instead.
 */
export async function classifyAssetProxyClass(_prev: { error: string }, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const parsed = classifyProxyClassSchema.safeParse({
    assetId: formData.get('assetId'),
    proxyClass: formData.get('proxyClass'),
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  // RLS scopes the UPDATE to `is_system = false AND user_id = auth.uid()` — a
  // system asset or someone else's custom asset simply matches 0 rows (no
  // error, empty `data`), same "silent no-op, not an error" shape as every
  // other RLS-scoped write in this app.
  const { data, error } = await supabase
    .from('assets')
    .update({ proxy_class: parsed.data.proxyClass })
    .eq('id', parsed.data.assetId)
    .select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'Only a custom asset you created can be classified here.' }

  revalidatePath('/invest')
  return { error: '' }
}
