'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { AlertTriangle, ShieldAlert, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { generatePlan, type GeneratePlanState } from '@/app/actions/invest/plan'
import { classifyAssetProxyClass } from '@/app/actions/invest/assets'
import { formatMoney } from '@/lib/invest/money'
import { ASSET_CLASSES, PROXY_CLASSES, CURRENCIES, type AssetClass } from '@/lib/validators/invest'
import type {
  AllocationDriftRow,
  ConcentrationRow,
  EpistemicTag,
  ReasonParams,
  StressResult,
  Suggestion,
  PlanVerdict,
} from '@/lib/invest/planner/types'

/** Shape of the `outputs` jsonb column once cast — see PlanRow below for why the
 * raw prop type keeps this as `unknown` (same convention as portfolio-dashboard.tsx's SnapshotRow). */
export type PlanOutputs = {
  totalValueMinor: string
  riskCapitalPct: number
  allocationDrift: AllocationDriftRow[]
  concentration: {
    direct: ConcentrationRow[]
    effective: ConcentrationRow[]
    opaqueVehicles: { assetId: string; name: string; pct: number }[]
    anyConcentrated: boolean
  }
  stress: StressResult[]
  suggestions: Suggestion[]
  verdict: PlanVerdict
  headline: string
  headlineKey: string
  headlineParams: ReasonParams
  disclaimer: string
}

// jsonb columns come back from PostgREST typed as `Json` (string | number |
// boolean | null | Json[] | {[k:string]: Json}) — cast at the point of use
// (PlanResult / the history list) rather than widening the DB row type,
// matching this file's sibling portfolio-dashboard.tsx's SnapshotRow convention.
export type PlanRow = {
  id: string
  created_at: string
  param_version: string
  display_currency: string
  new_money_minor: string
  new_money_currency: string
  target_allocation: unknown
  outputs: unknown
}

const DEFAULT_TARGET: Record<AssetClass, number> = {
  us_equity: 16.7,
  etf: 16.7,
  thai_set: 16.7,
  thai_fund: 16.6,
  gold: 16.7,
  crypto: 16.6,
}

function TagBadges({ tags }: { tags: EpistemicTag[] }) {
  const t = useTranslations('invest.plan')
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <Badge key={tag} variant="outline" className="text-[10px]" title={t(`tag.${tag}`)}>
          {tag}
        </Badge>
      ))}
    </div>
  )
}

/** Disclaimer — always visible, both while idle and on every rendered plan (M5 hard constraint). */
function DisclaimerBanner() {
  const t = useTranslations('invest.plan')
  return (
    <div className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium text-foreground">{t('disclaimerTitle')}</p>
        <p>{t('disclaimer')}</p>
      </div>
    </div>
  )
}

function SuggestionCard({ s }: { s: Suggestion }) {
  const t = useTranslations('invest.plan')
  const tInvest = useTranslations('invest')
  const actionLabel = s.action === 'buy' ? t('actionBuy') : s.action === 'sell' ? t('actionSell') : t('actionHold')
  const badgeClass =
    s.action === 'buy'
      ? 'bg-primary/15 text-primary'
      : s.action === 'sell'
        ? 'bg-destructive/15 text-destructive'
        : 'bg-muted text-muted-foreground'
  let rationale: string
  try {
    // reasonParams values are already JSON-primitive; next-intl's ICU formatter
    // accepts them directly as interpolation values.
    rationale = t(s.reasonKey as never, s.reasonParams as never)
  } catch {
    rationale = s.rationale // fallback to the canonical English string if a key/param ever drifts
  }
  return (
    <div className="space-y-1.5 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge className={badgeClass}>{actionLabel}</Badge>
          <span className="text-sm font-medium">{s.assetLabel ?? tInvest(`assetClass.${s.assetClass}`)}</span>
        </div>
        {s.amountRange && (
          <span className="text-sm font-semibold tabular-nums">
            {formatMoney(s.amountRange.minMinor, s.amountRange.currency)}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{rationale}</p>
      <TagBadges tags={s.tags} />
    </div>
  )
}

function ConcentrationList({ rows, title, hint }: { rows: ConcentrationRow[]; title: string; hint?: string }) {
  if (rows.length === 0) return null
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between text-sm">
            <span className="truncate">{r.label}</span>
            <span className={`tabular-nums ${r.concentrated ? 'font-semibold text-destructive' : ''}`}>
              {r.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PlanResult({ plan }: { plan: PlanRow }) {
  const t = useTranslations('invest.plan')
  const tInvest = useTranslations('invest')
  const o = plan.outputs as PlanOutputs
  let headline: string
  try {
    headline = t(o.headlineKey as never, o.headlineParams as never)
  } catch {
    headline = o.headline
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-2 pt-4">
          <div className="flex items-center gap-2">
            <Badge variant={o.verdict === 'no_trade' ? 'secondary' : 'default'}>
              {o.verdict === 'no_trade' ? t('verdictNoTradeBadge') : t('verdictActionBadge')}
            </Badge>
          </div>
          <p className="text-sm font-medium">{headline}</p>
          <p className="text-xs text-muted-foreground">
            {t('totalValueLabel', { currency: plan.display_currency })}:{' '}
            {formatMoney(o.totalValueMinor, plan.display_currency)}
          </p>
          {o.riskCapitalPct > 0 && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <ShieldAlert className="size-3.5" />
              {t('riskCapitalNote', { pct: o.riskCapitalPct.toFixed(1) })}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 pt-4">
          <p className="text-sm font-medium">{t('allocationDriftTitle')}</p>
          <div className="space-y-1.5">
            {o.allocationDrift.map((row) => (
              <div key={row.assetClass} className="flex items-center justify-between text-sm">
                <span>{tInvest(`assetClass.${row.assetClass}`)}</span>
                <span className="tabular-nums text-muted-foreground">
                  {row.currentPct.toFixed(1)}% / {row.targetPct.toFixed(1)}%
                </span>
                <span
                  className={`tabular-nums font-medium ${Math.abs(row.driftPct) >= 5 ? (row.driftPct > 0 ? 'text-destructive' : 'text-primary') : ''}`}
                >
                  {row.driftPct > 0 ? '+' : ''}
                  {row.driftPct.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {(o.concentration.direct.length > 0 || o.concentration.effective.length > 0) && (
        <Card>
          <CardContent className="space-y-4 pt-4">
            <ConcentrationList rows={o.concentration.direct} title={t('concentrationDirectTitle')} />
            <ConcentrationList
              rows={o.concentration.effective}
              title={t('concentrationEffectiveTitle')}
              hint={t('concentrationHint')}
            />
            <TagBadges tags={['CALC', 'JUDG-PROXY', 'APPROX']} />
            {o.concentration.opaqueVehicles.length > 0 && (
              <div className="space-y-1 rounded-md bg-muted/50 p-2">
                <p className="text-xs font-medium">{t('opaqueVehiclesTitle')}</p>
                <p className="text-xs text-muted-foreground">{t('opaqueVehiclesHint')}</p>
                {o.concentration.opaqueVehicles.map((v) => (
                  <div key={v.assetId} className="flex items-center justify-between text-xs">
                    <span>{v.name}</span>
                    <span className="tabular-nums">{v.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {o.stress.length > 0 && (
        <Card>
          <CardContent className="space-y-2 pt-4">
            <p className="text-sm font-medium">{t('stressTitle')}</p>
            {o.stress.map((sc) => (
              <div key={sc.scenario} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{sc.label}</span>
                  <span className="tabular-nums font-medium text-destructive">
                    {t('stressRange', {
                      low: (sc.rangeLow * 100).toFixed(1),
                      high: (sc.rangeHigh * 100).toFixed(1),
                    })}
                  </span>
                </div>
                <TagBadges tags={sc.tags} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">{t('suggestionsTitle')}</p>
        {o.suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noSuggestionsAction')}</p>
        ) : (
          <div className="space-y-2">
            {o.suggestions.map((s, i) => (
              <SuggestionCard key={i} s={s} />
            ))}
          </div>
        )}
      </div>

      <DisclaimerBanner />
    </div>
  )
}

function ClassifyRow({ holdingName, assetId, isCustomAsset }: { holdingName: string; assetId: string; isCustomAsset: boolean }) {
  const t = useTranslations('invest.plan')
  const [proxyClass, setProxyClass] = useState('')
  const [state, formAction, isPending] = useActionState(
    async (prev: { error: string }, fd: FormData) => {
      const result = await classifyAssetProxyClass(prev, fd)
      if (!result.error) toast.success(t('classified'))
      else toast.error(result.error)
      return result
    },
    { error: '' },
  )

  if (!isCustomAsset) {
    return (
      <div className="rounded-md border border-dashed p-2 text-sm">
        <p className="font-medium">{holdingName}</p>
        <p className="text-xs text-muted-foreground">{t('systemAssetUnclassified')}</p>
      </div>
    )
  }

  return (
    <form action={formAction} className="flex items-center gap-2 rounded-md border p-2">
      <input type="hidden" name="assetId" value={assetId} />
      <span className="flex-1 text-sm font-medium">{holdingName}</span>
      <Select value={proxyClass} onValueChange={setProxyClass}>
        <SelectTrigger className="w-44" size="sm">
          <SelectValue placeholder={t('proxyClassPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {PROXY_CLASSES.map((c) => (
            <SelectItem key={c} value={c}>
              {t(`proxyClassOptions.${c}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <input type="hidden" name="proxyClass" value={proxyClass} />
      <Button type="submit" size="sm" disabled={isPending || !proxyClass}>
        {t('classifySave')}
      </Button>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  )
}

/** M5 — the "plan my moves" flow: target allocation + new-money inputs → generate
 * a deterministic plan (lib/invest/planner/), persist it, render the result. */
export default function PlanClient({ plans }: { plans: PlanRow[] }) {
  const t = useTranslations('invest.plan')
  const tInvest = useTranslations('invest')
  const [target, setTarget] = useState<Record<AssetClass, number>>(DEFAULT_TARGET)
  const [newMoney, setNewMoney] = useState('3000')
  const [newMoneyCurrency, setNewMoneyCurrency] = useState('THB')
  const [viewingPlanId, setViewingPlanId] = useState<string | null>(null)

  const sum = Math.round(Object.values(target).reduce((a, b) => a + b, 0) * 10) / 10

  const [state, formAction, isPending] = useActionState<GeneratePlanState, FormData>(
    async (prev, fd) => {
      // Set explicitly from component state rather than relying on native form
      // serialization of the Select/number inputs (matches invest-client.tsx's
      // CustomAssetForm pattern — fd.set() over trusting uncontrolled name attrs).
      fd.set('targetAllocation', JSON.stringify(target))
      fd.set('newMoney', newMoney)
      fd.set('newMoneyCurrency', newMoneyCurrency)
      const result = await generatePlan(prev, fd)
      if (result.status === 'ok') toast.success(t('planSaved'))
      else if (result.status === 'error') toast.error(result.error)
      return result
    },
    { status: 'idle' },
  )

  const justGenerated =
    state.status === 'ok' ? (plans.find((p) => p.id === state.planId) ?? null) : null
  const viewed = viewingPlanId ? (plans.find((p) => p.id === viewingPlanId) ?? null) : null
  const shown = justGenerated ?? viewed

  return (
    <div className="space-y-4">
      <DisclaimerBanner />

      <Card>
        <CardContent className="space-y-3 pt-4">
          <p className="text-sm font-medium">{t('targetAllocationTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('targetAllocationHint')}</p>
          <div className="grid grid-cols-2 gap-2">
            {ASSET_CLASSES.map((c) => (
              <div key={c} className="space-y-1">
                <Label htmlFor={`target-${c}`} className="text-xs">
                  {tInvest(`assetClass.${c}`)}
                </Label>
                <div className="flex items-center gap-1">
                  <Input
                    id={`target-${c}`}
                    type="text"
                    inputMode="decimal"
                    className="tabular-nums"
                    value={target[c]}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      setTarget((t) => ({ ...t, [c]: Number.isFinite(v) ? v : 0 }))
                    }}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
            ))}
          </div>
          {Math.abs(sum - 100) > 0.5 && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertTriangle className="size-3.5" />
              {t('sumWarning', { sum })}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <form action={formAction} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="newMoney">{t('newMoneyLabel')}</Label>
                <Input
                  id="newMoney"
                  name="newMoney"
                  type="text"
                  inputMode="decimal"
                  className="tabular-nums"
                  value={newMoney}
                  onChange={(e) => setNewMoney(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>{t('newMoneyCurrencyLabel')}</Label>
                <Select value={newMoneyCurrency} onValueChange={setNewMoneyCurrency}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={isPending || Math.abs(sum - 100) > 0.5}>
              {isPending ? t('generating') : t('generatePlan')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {state.status === 'blocked' && (
        <Card>
          <CardContent className="space-y-2 pt-4">
            <div className="flex items-center gap-1.5 text-sm font-medium text-destructive">
              <AlertTriangle className="size-4" />
              {t('unclassifiedTitle')}
            </div>
            <p className="text-xs text-muted-foreground">{t('unclassifiedHint')}</p>
            <div className="space-y-2">
              {state.unclassified.map((u) => (
                <ClassifyRow
                  key={u.holdingId}
                  holdingName={u.name}
                  assetId={u.assetId}
                  isCustomAsset={u.isCustomAsset}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {shown && <PlanResult plan={shown} />}

      {plans.length > 0 && (
        <Card>
          <CardContent className="space-y-2 pt-4">
            <p className="text-sm font-medium">{t('planHistory')}</p>
            <div className="divide-y rounded-lg border">
              {plans.map((p) => {
                const verdict = (p.outputs as PlanOutputs).verdict
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setViewingPlanId(p.id)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50"
                  >
                    <span>{new Date(p.created_at).toLocaleString('th-TH')}</span>
                    <Badge variant={verdict === 'no_trade' ? 'secondary' : 'default'} className="text-xs">
                      {verdict === 'no_trade' ? t('verdictNoTradeBadge') : t('verdictActionBadge')}
                    </Badge>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {plans.length === 0 && state.status !== 'ok' && (
        <p className="text-center text-sm text-muted-foreground">{t('noPlansYet')}</p>
      )}

      {viewed && !justGenerated && (
        <Sheet open onOpenChange={(o) => !o && setViewingPlanId(null)}>
          <SheetContent side="bottom" className="mx-auto max-h-[90vh] max-w-lg overflow-y-auto rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>{new Date(viewed.created_at).toLocaleString('th-TH')}</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-6">
              <PlanResult plan={viewed} />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
