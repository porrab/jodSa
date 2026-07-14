import { createClient, getUser } from '@/lib/supabase/server'
import { computeCostBasis } from '@/lib/invest/cost-basis'
import InvestClient from './invest-client'

export default async function InvestPage() {
  const user = await getUser()
  if (!user) return null // defensive — app/(app)/layout.tsx already redirects unauthenticated

  const supabase = await createClient()

  // RLS scopes every query: holdings/asset_transactions to this user's own rows,
  // assets to (is_system OR user_id = this user) — see 0008_invest_holdings.sql.
  // Joined client-side (Map lookups), not via a PostgREST embed — matches this
  // repo's existing convention (see app/(app)/transactions/page.tsx) and sidesteps
  // supabase-js needing typed `Relationships` metadata for an embed to type-check.
  const [{ data: holdingsRaw }, { data: assets }, { data: txRaw }] = await Promise.all([
    supabase.from('holdings').select('*').order('created_at'),
    supabase.from('assets').select('*').order('is_system', { ascending: false }).order('name'),
    supabase.from('asset_transactions').select('*').order('datetime'),
  ])

  const assetById = new Map((assets ?? []).map((a) => [a.id, a]))

  const txByHolding = new Map<string, NonNullable<typeof txRaw>>()
  for (const tx of txRaw ?? []) {
    const list = txByHolding.get(tx.holding_id) ?? []
    list.push(tx)
    txByHolding.set(tx.holding_id, list)
  }

  const holdings = (holdingsRaw ?? []).map((h) => {
    const transactions = txByHolding.get(h.id) ?? []
    const cb = computeCostBasis(
      transactions.map((t) => ({
        type: t.type,
        qty: t.qty,
        priceMinor: t.price_minor,
        feesMinor: t.fees_minor,
        datetime: t.datetime,
      })),
    )
    return {
      ...h,
      asset: assetById.get(h.asset_id) ?? null,
      transactions,
      // bigint isn't RSC-serializable — cross the server/client boundary as strings
      // (lib/invest/money.ts formatMoney() accepts string | number | bigint).
      costBasis: {
        qty: cb.qty,
        totalCostMinor: cb.totalCostMinor.toString(),
        avgCostMinor: cb.avgCostMinor?.toString() ?? null,
        realizedPnlMinor: cb.realizedPnlMinor.toString(),
        dividendsMinor: cb.dividendsMinor.toString(),
        feesMinor: cb.feesMinor.toString(),
      },
    }
  })

  return <InvestClient holdings={holdings} assets={assets ?? []} />
}
