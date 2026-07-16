'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { generatePlanSchema } from '@/lib/validators/invest'
import { toMinor, minorToApi } from '@/lib/invest/money'
import { valueHolding, DISPLAY_CURRENCY, type HoldingInput } from '@/lib/invest/portfolio'
import { resolveHoldings, type ResolveInput } from '@/lib/invest/planner/resolve'
import { buildPlan } from '@/lib/invest/planner/plan'
import type { AssetClass, Sleeve } from '@/lib/validators/invest'
import type { UnclassifiedHolding } from '@/lib/invest/planner/types'

/**
 * Re-fetch this user's holdings + assets + transactions fresh from the DB
 * (RLS-scoped) and shape them for the planner pipeline. Never trusts
 * client-supplied numbers — same "recompute server-side" rule as
 * app/actions/invest/portfolio.ts's savePortfolioSnapshot.
 */
async function loadResolveInputs(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<ResolveInput[]> {
  const [{ data: holdings, error: hErr }, { data: assets, error: aErr }, { data: txRaw, error: tErr }] =
    await Promise.all([
      supabase.from('holdings').select('*'),
      supabase.from('assets').select('id, symbol, name, asset_class, currency, proxy_class, is_system'),
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
    if (!asset) return [] // orphaned holding (asset deleted) — skip defensively, FK restrict should prevent this

    const transactions = (txByHolding.get(h.id) ?? []).map((t) => ({
      type: t.type,
      qty: t.qty,
      priceMinor: t.price_minor,
      feesMinor: t.fees_minor,
      fxRate: t.fx_rate,
      datetime: t.datetime,
    }))
    const holdingInput: HoldingInput = {
      holdingId: h.id,
      assetId: h.asset_id,
      assetClass: asset.asset_class as AssetClass,
      currency: asset.currency,
      sleeve: h.sleeve as Sleeve,
      currentValueMinor: h.current_value_minor,
      currentValueCurrency: h.current_value_currency,
      currentFxToDisplay: h.current_fx_to_display,
      transactions,
    }
    const valued = valueHolding(holdingInput)
    // Unconverted/unpriceable holdings are excluded from the plan the same way
    // they're excluded from the M3 dashboard totals — never assumed 1:1.
    if (valued.unconverted || valued.effectiveMinor === null) return []

    return [
      {
        holdingId: h.id,
        assetId: h.asset_id,
        symbol: asset.symbol,
        name: asset.name,
        assetClass: asset.asset_class as AssetClass,
        proxyClass: asset.proxy_class,
        sleeve: h.sleeve as Sleeve,
        isSystemAsset: asset.is_system,
        valueMinor: valued.effectiveMinor,
      } satisfies ResolveInput,
    ]
  })
}

export type GeneratePlanState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | { status: 'blocked'; unclassified: UnclassifiedHolding[] }
  | { status: 'ok'; planId: string }

/**
 * Generate + persist a monthly plan. Deterministic core (lib/invest/planner/plan.ts)
 * wrapped with I/O: recompute holdings server-side (RLS), block on any
 * unclassified holding (never silently default), run the planner, insert the
 * immutable `plans` row. Ends at the recommendation — no order is placed.
 */
export async function generatePlan(_prev: GeneratePlanState, formData: FormData): Promise<GeneratePlanState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { status: 'error', error: 'Not authenticated' }

  let rawTarget: unknown
  try {
    rawTarget = JSON.parse((formData.get('targetAllocation') as string | null) ?? '{}')
  } catch {
    return { status: 'error', error: 'Malformed target allocation payload' }
  }
  const parsed = generatePlanSchema.safeParse({
    targetAllocation: rawTarget,
    newMoney: Number(formData.get('newMoney')),
    newMoneyCurrency: formData.get('newMoneyCurrency'),
  })
  if (!parsed.success) return { status: 'error', error: parsed.error.errors[0].message }

  const resolveInputs = await loadResolveInputs(supabase)
  const resolved = resolveHoldings(resolveInputs)
  if (!resolved.ok) return { status: 'blocked', unclassified: resolved.unclassified }

  const newMoneyMinor = toMinor(parsed.data.newMoney, parsed.data.newMoneyCurrency)
  const plan = buildPlan({
    holdings: resolved.holdings,
    targetAllocation: parsed.data.targetAllocation,
    newMoneyMinor,
    newMoneyCurrency: parsed.data.newMoneyCurrency,
    displayCurrency: DISPLAY_CURRENCY,
    createdAt: new Date().toISOString(),
  })

  const { data, error } = await supabase
    .from('plans')
    .insert({
      user_id: user.id,
      created_at: plan.createdAt,
      param_version: plan.paramVersion,
      display_currency: plan.displayCurrency,
      new_money_minor: minorToApi(newMoneyMinor),
      new_money_currency: plan.newMoney.currency,
      target_allocation: plan.targetAllocation,
      inputs: resolved.holdings.map((h) => ({ ...h, valueMinor: h.valueMinor.toString() })),
      outputs: {
        totalValueMinor: plan.totalValueMinor,
        riskCapitalPct: plan.riskCapitalPct,
        allocationDrift: plan.allocationDrift,
        concentration: plan.concentration,
        stress: plan.stress,
        suggestions: plan.suggestions,
        verdict: plan.verdict,
        headline: plan.headline,
        headlineKey: plan.headlineKey,
        headlineParams: plan.headlineParams,
        disclaimer: plan.disclaimer,
      },
    })
    .select('id')
    .single()
  if (error) return { status: 'error', error: error.message }

  revalidatePath('/invest')
  return { status: 'ok', planId: data.id }
}
