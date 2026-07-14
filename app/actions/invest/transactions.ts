'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assetTransactionSchema } from '@/lib/validators/invest'
import { toMinor, minorToApi, parseFormNumber } from '@/lib/invest/money'

/** Record a buy/sell/dividend/fee against an existing holding. */
export async function addAssetTransaction(_prev: { error: string }, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const currency = ((formData.get('currency') as string) || '').toUpperCase()
  const parsed = assetTransactionSchema.safeParse({
    holdingId: formData.get('holding_id'),
    type: formData.get('type'),
    qty: formData.get('qty') ? parseFormNumber(formData, 'qty') : undefined,
    amount: parseFormNumber(formData, 'amount'),
    currency,
    fees: formData.get('fees') ? parseFormNumber(formData, 'fees') : 0,
    fxRate: formData.get('fx_rate') ? parseFormNumber(formData, 'fx_rate') : undefined,
    datetime: formData.get('datetime'),
    ref: formData.get('ref') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }
  const v = parsed.data

  const { error } = await supabase.from('asset_transactions').insert({
    user_id: user.id,
    holding_id: v.holdingId,
    type: v.type,
    qty: v.qty !== undefined ? String(v.qty) : null,
    price_minor: minorToApi(toMinor(v.amount, v.currency)),
    currency: v.currency,
    fees_minor: minorToApi(toMinor(v.fees, v.currency)),
    fx_rate: v.fxRate ? String(v.fxRate) : null,
    datetime: new Date(v.datetime).toISOString(),
    ref: v.ref ?? null,
  })
  if (error) return { error: error.message }

  revalidatePath('/invest')
  return { error: '' }
}

export async function deleteAssetTransaction(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('asset_transactions').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/invest')
}
