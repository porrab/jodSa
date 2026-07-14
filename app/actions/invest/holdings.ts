'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { holdingCreateSchema, updateHoldingSchema } from '@/lib/validators/invest'
import { toMinor, minorToApi, parseFormNumber } from '@/lib/invest/money'

/**
 * Open a new holding. A holding is always created together with its opening
 * `buy` transaction — "add a holding" and "record the first buy" are the same
 * action (see db/migrations/0008_invest_holdings.sql: cost basis is always
 * derived from asset_transactions, never stored redundantly on the holding row).
 *
 * Not atomic across the two inserts (supabase-js has no multi-statement
 * transaction API on the anon/authenticated path — an RPC would be needed for
 * true atomicity, out of scope for M1). If the second insert fails we compensate
 * by deleting the just-created holding rather than leaving an orphaned zero-qty row.
 */
export async function createHolding(_prev: { error: string; id?: string }, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const currency = ((formData.get('currency') as string) || '').toUpperCase()
  const parsed = holdingCreateSchema.safeParse({
    assetId: formData.get('asset_id'),
    sleeve: formData.get('sleeve') || 'core',
    broker: formData.get('broker') || undefined,
    qty: parseFormNumber(formData, 'qty'),
    price: parseFormNumber(formData, 'price'),
    currency,
    fees: formData.get('fees') ? parseFormNumber(formData, 'fees') : 0,
    fxRate: formData.get('fx_rate') ? parseFormNumber(formData, 'fx_rate') : undefined,
    datetime: formData.get('datetime'),
    ref: formData.get('ref') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }
  const v = parsed.data

  const { data: holding, error: holdingError } = await supabase
    .from('holdings')
    .insert({
      user_id: user.id,
      asset_id: v.assetId,
      sleeve: v.sleeve,
      broker: v.broker ?? null,
    })
    .select('id')
    .single()
  if (holdingError) return { error: holdingError.message }

  const { error: txError } = await supabase.from('asset_transactions').insert({
    user_id: user.id,
    holding_id: holding.id,
    type: 'buy',
    qty: String(v.qty),
    price_minor: minorToApi(toMinor(v.price, v.currency)),
    currency: v.currency,
    fees_minor: minorToApi(toMinor(v.fees, v.currency)),
    fx_rate: v.fxRate ? String(v.fxRate) : null,
    datetime: new Date(v.datetime).toISOString(),
    ref: v.ref ?? null,
  })
  if (txError) {
    await supabase.from('holdings').delete().eq('id', holding.id)
    return { error: txError.message }
  }

  revalidatePath('/invest')
  return { error: '', id: holding.id }
}

/** Update sleeve/broker and (optionally) the manually-entered current value + display FX. */
export async function updateHolding(_prev: { error: string }, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const hasCurrentValue = !!(formData.get('current_value') as string | null)?.trim()
  const parsed = updateHoldingSchema.safeParse({
    id: formData.get('id'),
    sleeve: formData.get('sleeve'),
    broker: formData.get('broker') || undefined,
    currentValue: hasCurrentValue ? parseFormNumber(formData, 'current_value') : undefined,
    currentValueCurrency: hasCurrentValue
      ? ((formData.get('current_value_currency') as string) || '').toUpperCase()
      : undefined,
    currentFxToDisplay: formData.get('current_fx_to_display')
      ? parseFormNumber(formData, 'current_fx_to_display')
      : undefined,
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }
  const v = parsed.data

  const update: {
    sleeve: typeof v.sleeve
    broker: string | null
    updated_at: string
    current_value_minor?: string
    current_value_currency?: string
    current_fx_to_display?: string
  } = {
    sleeve: v.sleeve,
    broker: v.broker ?? null,
    updated_at: new Date().toISOString(),
  }
  if (v.currentValue !== undefined && v.currentValueCurrency) {
    update.current_value_minor = minorToApi(toMinor(v.currentValue, v.currentValueCurrency))
    update.current_value_currency = v.currentValueCurrency
  }
  if (v.currentFxToDisplay !== undefined) {
    update.current_fx_to_display = String(v.currentFxToDisplay)
  }

  const { error } = await supabase.from('holdings').update(update).eq('id', v.id)
  if (error) return { error: error.message }

  revalidatePath('/invest')
  return { error: '' }
}

export async function deleteHolding(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('holdings').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/invest')
}
