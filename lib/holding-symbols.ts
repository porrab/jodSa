import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type Row = Pick<Database['public']['Tables']['transactions']['Row'], 'type' | 'holding_id'>

/** Resolve only holdings used by visible cash rows; all reads retain caller RLS. */
export async function holdingSymbolsForRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Row[],
): Promise<Record<string, string>> {
  const ids = [...new Set(rows.filter((row) => row.type === 'invest' || row.type === 'divest')
    .map((row) => row.holding_id).filter((id): id is string => !!id))]
  if (ids.length === 0) return {}
  const { data: holdings } = await supabase.from('holdings').select('id, asset_id').in('id', ids)
  if (!holdings?.length) return {}
  const { data: assets } = await supabase.from('assets').select('id, symbol, name')
    .in('id', [...new Set(holdings.map((holding) => holding.asset_id))])
  const byAsset = new Map((assets ?? []).map((asset) => [asset.id, asset.symbol || asset.name]))
  return Object.fromEntries(holdings.map((holding) => [holding.id, byAsset.get(holding.asset_id) ?? '—']))
}
