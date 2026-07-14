'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { bulkPriceUpdateSchema } from '@/lib/validators/invest'
import { toMinor, minorToApi } from '@/lib/invest/money'
import { valueHolding, buildSnapshotPayload, type HoldingInput } from '@/lib/invest/portfolio'
import type { AssetClass, Sleeve } from '@/lib/validators/invest'

/**
 * Re-fetch this user's holdings + transactions fresh from the DB (RLS-scoped)
 * and shape them into HoldingInput[] for lib/invest/portfolio.ts. Used by
 * savePortfolioSnapshot so a snapshot always reflects what's actually stored,
 * never client-supplied numbers — same "recompute server-side" rule as the
 * rest of this app's money math.
 */
async function loadHoldingInputs(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<HoldingInput[]> {
  const [{ data: holdings, error: hErr }, { data: assets, error: aErr }, { data: txRaw, error: tErr }] =
    await Promise.all([
      supabase.from('holdings').select('*'),
      supabase.from('assets').select('id, asset_class, currency'),
      supabase.from('asset_transactions').select('*'),
    ])
  if (hErr) throw new Error(hErr.message)
  if (aErr) throw new Error(aErr.message)
  if (tErr) throw new Error(tErr.message)

  const assetById = new Map((assets ?? []).map((a) => [a.id, a]))
  const txByHolding = new Map<string, NonNullable<typeof txRaw>>()
  for (const tx of txRaw ?? []) {
    const list = txByHolding.get(tx.holding_id) ?? []
    list.push(tx)
    txByHolding.set(tx.holding_id, list)
  }

  return (holdings ?? []).flatMap((h) => {
    const asset = assetById.get(h.asset_id)
    if (!asset) return [] // orphaned holding (asset deleted) — skip defensively, should not happen (FK restrict)
    const transactions = (txByHolding.get(h.id) ?? []).map((t) => ({
      type: t.type,
      qty: t.qty,
      priceMinor: t.price_minor,
      feesMinor: t.fees_minor,
      fxRate: t.fx_rate,
      datetime: t.datetime,
    }))
    return [
      {
        holdingId: h.id,
        assetId: h.asset_id,
        assetClass: asset.asset_class as AssetClass,
        currency: asset.currency,
        sleeve: h.sleeve as Sleeve,
        currentValueMinor: h.current_value_minor,
        currentValueCurrency: h.current_value_currency,
        currentFxToDisplay: h.current_fx_to_display,
        transactions,
      } satisfies HoldingInput,
    ]
  })
}

/**
 * "Update prices" — bulk-write manually-entered current values across many
 * holdings in one submission (dashboard entry point). Each row still goes
 * through supabase-js with the user's session (RLS-scoped `.update` — a
 * mismatched `id` simply updates 0 rows, never another user's data).
 */
export async function updatePortfolioPrices(_prev: { error: string }, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  let raw: unknown
  try {
    raw = JSON.parse((formData.get('entries') as string | null) ?? '[]')
  } catch {
    return { error: 'Malformed price update payload' }
  }
  const parsed = bulkPriceUpdateSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  for (const entry of parsed.data) {
    const { error } = await supabase
      .from('holdings')
      .update({
        current_value_minor: minorToApi(toMinor(entry.currentValue, entry.currentValueCurrency)),
        current_value_currency: entry.currentValueCurrency,
        current_fx_to_display:
          entry.currentFxToDisplay !== undefined ? String(entry.currentFxToDisplay) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entry.holdingId)
    if (error) return { error: error.message }
  }

  revalidatePath('/invest')
  return { error: '' }
}

/**
 * Save a portfolio_snapshots row — value/cost/P&L/allocation as of right now,
 * recomputed server-side from the live holdings/transactions (never trusts
 * whatever totals the client last rendered). This is what "a past snapshot
 * reloads from history" (M3 acceptance) reads back later.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState requires the (state, formData) shape; this action needs neither.
export async function savePortfolioSnapshot(_prev: { error: string }, _formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const inputs = await loadHoldingInputs(supabase)
  const valued = inputs.map((h) => valueHolding(h))
  const payload = buildSnapshotPayload(valued)

  const { error } = await supabase.from('portfolio_snapshots').insert({
    user_id: user.id,
    display_currency: payload.displayCurrency,
    holdings: payload.holdings,
    totals: payload.totals,
    allocation: payload.allocation,
  })
  if (error) return { error: error.message }

  revalidatePath('/invest')
  return { error: '' }
}
