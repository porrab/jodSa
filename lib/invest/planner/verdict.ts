/**
 * Step 6: NO-TRADE / "portfolio is fine" as a first-class outcome — never
 * manufacture a finding just because a plan was requested. verdict.ts only
 * looks at whether plan.ts produced any actionable suggestions; it does not
 * re-derive drift/concentration itself.
 */
import { DISCLAIMER } from './tags'
import type { PlanVerdict, ReasonParams, Suggestion } from './types'

export type VerdictResult = {
  verdict: PlanVerdict
  headline: string
  headlineKey: string
  headlineParams: ReasonParams
  disclaimer: string
}

export function buildVerdict(suggestions: Suggestion[]): VerdictResult {
  const actionable = suggestions.some((s) => s.action === 'buy' || s.action === 'sell')

  if (!actionable) {
    return {
      verdict: 'no_trade',
      headline:
        'NO-TRADE — your portfolio is within its target allocation bands and no position is flagged concentrated this month.',
      headlineKey: 'headline.noTrade',
      headlineParams: {},
      disclaimer: DISCLAIMER,
    }
  }

  const buys = suggestions.filter((s) => s.action === 'buy').length
  const sells = suggestions.filter((s) => s.action === 'sell').length
  return {
    verdict: 'action',
    headline: `${buys} buy suggestion(s)${sells > 0 ? ` and ${sells} sell/trim suggestion(s)` : ''} this month — see below, tagged and with a one-line reason each.`,
    headlineKey: 'headline.action',
    headlineParams: { buys, sells },
    disclaimer: DISCLAIMER,
  }
}
