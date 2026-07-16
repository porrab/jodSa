/**
 * Epistemic-tag helpers — the fin-desk methodology's "every number carries a tag"
 * discipline, applied mechanically so no planner output can skip it.
 */
import type { EpistemicTag } from './types'

export const DISCLAIMER =
  'This is decision-support, not licensed investment advice. You review and place any trade yourself — ' +
  'this tool never places or simulates an order. Proxy-based figures (volatility, stress impact, ' +
  'look-through weights) are directional estimates, not precise forecasts.'

/** Sort a tag set into a stable, de-duplicated order for consistent snapshots. */
export function normalizeTags(tags: EpistemicTag[]): EpistemicTag[] {
  const order: EpistemicTag[] = ['FACT', 'CALC', 'INFER', 'MKT', 'JUDG', 'JUDG-PROXY', 'APPROX']
  const set = new Set(tags)
  return order.filter((t) => set.has(t))
}
