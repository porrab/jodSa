'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { customAssetSchema } from '@/lib/validators/invest'

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
