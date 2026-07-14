'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Plus, ChevronRight, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createHolding, updateHolding, deleteHolding } from '@/app/actions/invest/holdings'
import { addAssetTransaction, deleteAssetTransaction } from '@/app/actions/invest/transactions'
import { createCustomAsset } from '@/app/actions/invest/assets'
import {
  ASSET_CLASSES, SLEEVES, ASSET_TX_TYPES, CURRENCIES,
  type AssetClass, type Sleeve, type AssetTxType,
} from '@/lib/validators/invest'
import { formatMoney, parseMinor, toMajor, minorUnitDecimals } from '@/lib/invest/money'

export type Asset = {
  id: string
  symbol: string | null
  name: string
  asset_class: AssetClass
  currency: string
  is_system: boolean
}

type Transaction = {
  id: string
  type: AssetTxType
  qty: string | null
  price_minor: string | null
  currency: string
  fees_minor: string
  fx_rate: string | null
  datetime: string
  ref: string | null
}

type CostBasis = {
  qty: number
  totalCostMinor: string
  avgCostMinor: string | null
  realizedPnlMinor: string
  dividendsMinor: string
  feesMinor: string
}

export type Holding = {
  id: string
  asset_id: string
  sleeve: Sleeve
  broker: string | null
  current_value_minor: string | null
  current_value_currency: string | null
  current_fx_to_display: string | null
  asset: Asset | null
  transactions: Transaction[]
  costBasis: CostBasis
}

function sleeveVariant(sleeve: Sleeve): 'outline' | 'secondary' | 'destructive' {
  if (sleeve === 'risk_capital') return 'destructive'
  if (sleeve === 'satellite') return 'secondary'
  return 'outline'
}

function moneyInputDefault(minor: string | null, currency: string): string {
  if (!minor) return ''
  return toMajor(parseMinor(minor), currency).toFixed(minorUnitDecimals(currency))
}

/** Nested create path for J4's "empty-source rule": no picker dead-ends without a "+ create" exit. */
function CustomAssetForm({ onCreated }: { onCreated: (asset: Asset) => void }) {
  const t = useTranslations('invest')
  const tc = useTranslations('common')
  const [assetClass, setAssetClass] = useState<AssetClass | ''>('')
  const [currency, setCurrency] = useState('')

  const [state, formAction, isPending] = useActionState(
    async (prev: { error: string; id?: string }, fd: FormData) => {
      if (assetClass) fd.set('asset_class', assetClass)
      if (currency) fd.set('currency', currency)
      const result = await createCustomAsset(prev, fd)
      if (!result.error && result.id) {
        onCreated({
          id: result.id,
          name: String(fd.get('name') ?? ''),
          symbol: (fd.get('symbol') as string) || null,
          asset_class: assetClass as AssetClass,
          currency,
          is_system: false,
        })
      } else if (result.error) {
        toast.error(result.error)
      }
      return result
    },
    { error: '' },
  )

  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-3">
      <p className="text-sm font-medium">{t('customAsset.title')}</p>
      <div className="space-y-1">
        <Label htmlFor="ca-name">{t('customAsset.name')} <RequiredMark /></Label>
        <Input id="ca-name" name="name" required />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>{t('assetClassLabel')} <RequiredMark /></Label>
          <Select value={assetClass} onValueChange={(v) => setAssetClass(v as AssetClass)}>
            <SelectTrigger className="w-full"><SelectValue placeholder={t('customAsset.selectClass')} /></SelectTrigger>
            <SelectContent>
              {ASSET_CLASSES.map((c) => (
                <SelectItem key={c} value={c}>{t(`assetClass.${c}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{t('customAsset.currency')} <RequiredMark /></Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="w-full"><SelectValue placeholder="USD" /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="ca-symbol">{t('customAsset.symbol')}</Label>
        <Input id="ca-symbol" name="symbol" placeholder="AAPL" />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="sm" className="w-full" disabled={isPending || !assetClass || !currency}>
        {isPending ? tc('saving') : t('customAsset.create')}
      </Button>
    </form>
  )
}

/** Opening a holding = recording its first `buy` transaction (see lib/invest/cost-basis.ts). */
function AddHoldingDialog({ assets, onClose }: { assets: Asset[]; onClose: () => void }) {
  const t = useTranslations('invest')
  const tc = useTranslations('common')
  const [localAssets, setLocalAssets] = useState(assets)
  const [assetId, setAssetId] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [sleeve, setSleeve] = useState<Sleeve>('core')
  const selectedAsset = localAssets.find((a) => a.id === assetId) ?? null

  const [state, formAction, isPending] = useActionState(
    async (prev: { error: string; id?: string }, fd: FormData) => {
      fd.set('asset_id', assetId)
      fd.set('sleeve', sleeve)
      if (selectedAsset) fd.set('currency', selectedAsset.currency)
      const result = await createHolding(prev, fd)
      if (!result.error) {
        toast.success(t('holdingSaved'))
        onClose()
      } else {
        toast.error(result.error)
      }
      return result
    },
    { error: '' },
  )

  const grouped = ASSET_CLASSES
    .map((cls) => ({ cls, items: localAssets.filter((a) => a.asset_class === cls) }))
    .filter((g) => g.items.length > 0)

  function handleCustomCreated(asset: Asset) {
    setLocalAssets((prev) => [...prev, asset])
    setAssetId(asset.id)
    setShowCustom(false)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>{t('pickAsset')} <RequiredMark /></Label>
        <Select value={assetId} onValueChange={setAssetId}>
          <SelectTrigger className="w-full"><SelectValue placeholder={t('pickAssetPlaceholder')} /></SelectTrigger>
          <SelectContent>
            {grouped.map((g) => (
              <SelectGroup key={g.cls}>
                <SelectLabel>{t(`assetClass.${g.cls}`)}</SelectLabel>
                {g.items.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}{a.symbol ? ` (${a.symbol})` : ''} · {a.currency}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        {/* Empty-source rule (design v3, J4): always an inline "+ create" exit, never a dead-end picker. */}
        <button type="button" onClick={() => setShowCustom((s) => !s)} className="text-xs text-primary hover:underline">
          {t('customAsset.notFound')}
        </button>
      </div>

      {showCustom && <CustomAssetForm onCreated={handleCustomCreated} />}

      {selectedAsset && (
        <form action={formAction} className="space-y-3">
          <div className="space-y-1">
            <Label>{t('sleeveLabel')}</Label>
            <Select value={sleeve} onValueChange={(v) => setSleeve(v as Sleeve)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SLEEVES.map((s) => (
                  <SelectItem key={s} value={s}>{t(`sleeve.${s}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sleeve === 'risk_capital' && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="size-3.5" />{t('riskCapitalWarning')}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="h-broker">{t('brokerLabel')}</Label>
            <Input id="h-broker" name="broker" placeholder={t('brokerPlaceholder')} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="h-qty">{t('qtyLabel')} <RequiredMark /></Label>
              <Input id="h-qty" name="qty" type="text" inputMode="decimal" required className="tabular-nums" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="h-price">{t('priceLabel', { currency: selectedAsset.currency })} <RequiredMark /></Label>
              <Input id="h-price" name="price" type="text" inputMode="decimal" required className="tabular-nums" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="h-fees">{t('feesLabel')}</Label>
              <Input id="h-fees" name="fees" type="text" inputMode="decimal" placeholder="0" className="tabular-nums" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="h-datetime">{t('dateLabel')} <RequiredMark /></Label>
              <Input id="h-datetime" name="datetime" type="datetime-local" required />
            </div>
          </div>
          {selectedAsset.currency !== 'THB' && (
            <div className="space-y-1">
              <Label htmlFor="h-fx">{t('fxRateLabel', { currency: selectedAsset.currency })}</Label>
              <Input id="h-fx" name="fx_rate" type="text" inputMode="decimal" placeholder="36.50" className="tabular-nums" />
              <p className="text-xs text-muted-foreground">{t('fxRateHint')}</p>
            </div>
          )}
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? tc('saving') : t('addHolding')}
          </Button>
        </form>
      )}
    </div>
  )
}

function AddTransactionForm({ holding, onDone }: { holding: Holding; onDone: () => void }) {
  const t = useTranslations('invest')
  const tc = useTranslations('common')
  const [type, setType] = useState<AssetTxType>('buy')
  const currency = holding.asset?.currency ?? 'THB'
  const needsQty = type === 'buy' || type === 'sell'

  const [state, formAction, isPending] = useActionState(
    async (prev: { error: string }, fd: FormData) => {
      fd.set('holding_id', holding.id)
      fd.set('type', type)
      fd.set('currency', currency)
      const result = await addAssetTransaction(prev, fd)
      if (!result.error) {
        toast.success(t('txSaved'))
        onDone()
      } else {
        toast.error(result.error)
      }
      return result
    },
    { error: '' },
  )

  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-3">
      <div className="space-y-1">
        <Label>{t('txTypeLabel')}</Label>
        <Select value={type} onValueChange={(v) => setType(v as AssetTxType)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ASSET_TX_TYPES.map((tt) => (
              <SelectItem key={tt} value={tt}>{t(`txType.${tt}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {needsQty && (
        <div className="space-y-1">
          <Label htmlFor="tx-qty">{t('qtyLabel')} <RequiredMark /></Label>
          <Input id="tx-qty" name="qty" type="text" inputMode="decimal" required className="tabular-nums" />
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="tx-amount">
          {needsQty ? t('priceLabel', { currency }) : t('amountLabel', { currency })} <RequiredMark />
        </Label>
        <Input id="tx-amount" name="amount" type="text" inputMode="decimal" required className="tabular-nums" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="tx-fees">{t('feesLabel')}</Label>
          <Input id="tx-fees" name="fees" type="text" inputMode="decimal" placeholder="0" className="tabular-nums" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tx-datetime">{t('dateLabel')} <RequiredMark /></Label>
          <Input id="tx-datetime" name="datetime" type="datetime-local" required />
        </div>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="sm" className="w-full" disabled={isPending}>
        {isPending ? tc('saving') : t('addTransaction')}
      </Button>
    </form>
  )
}

function HoldingEditForm({ holding, onDone }: { holding: Holding; onDone: () => void }) {
  const t = useTranslations('invest')
  const tc = useTranslations('common')
  const [sleeve, setSleeve] = useState<Sleeve>(holding.sleeve)
  const currency = holding.current_value_currency ?? holding.asset?.currency ?? 'THB'

  const [state, formAction, isPending] = useActionState(
    async (prev: { error: string }, fd: FormData) => {
      fd.set('id', holding.id)
      fd.set('sleeve', sleeve)
      if ((fd.get('current_value') as string)?.trim()) fd.set('current_value_currency', currency)
      const result = await updateHolding(prev, fd)
      if (!result.error) {
        toast.success(tc('success'))
        onDone()
      } else {
        toast.error(result.error)
      }
      return result
    },
    { error: '' },
  )

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-1">
        <Label>{t('sleeveLabel')}</Label>
        <Select value={sleeve} onValueChange={(v) => setSleeve(v as Sleeve)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SLEEVES.map((s) => (
              <SelectItem key={s} value={s}>{t(`sleeve.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {sleeve === 'risk_capital' && (
          <p className="flex items-center gap-1 text-xs text-destructive">
            <AlertTriangle className="size-3.5" />{t('riskCapitalWarning')}
          </p>
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor="e-broker">{t('brokerLabel')}</Label>
        <Input id="e-broker" name="broker" defaultValue={holding.broker ?? ''} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="e-cv">{t('currentValueLabel', { currency })}</Label>
        <Input
          id="e-cv"
          name="current_value"
          type="text"
          inputMode="decimal"
          className="tabular-nums"
          defaultValue={moneyInputDefault(holding.current_value_minor, currency)}
          placeholder="0.00"
        />
        <p className="text-xs text-muted-foreground">{t('currentValueHint')}</p>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? tc('saving') : tc('save')}
      </Button>
    </form>
  )
}

/** J3-style detail sheet (design v3): row tap opens this instead of always-on row actions. */
function HoldingDetailSheet({
  holding,
  open,
  onOpenChange,
}: {
  holding: Holding | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('invest')
  const [mode, setMode] = useState<'view' | 'edit' | 'addTx'>('view')

  function close() {
    setMode('view')
    onOpenChange(false)
  }

  async function handleDelete() {
    if (!holding) return
    if (!confirm(t('deleteHoldingConfirm'))) return
    try {
      await deleteHolding(holding.id)
      toast.success(t('holdingDeleted'))
      close()
    } catch {
      toast.error(t('actionFailed'))
    }
  }

  async function handleDeleteTx(id: string) {
    if (!confirm(t('deleteTxConfirm'))) return
    try {
      await deleteAssetTransaction(id)
      toast.success(t('txDeleted'))
    } catch {
      toast.error(t('actionFailed'))
    }
  }

  if (!holding) return null
  const currency = holding.asset?.currency ?? 'THB'
  const cb = holding.costBasis
  const valueCurrencyMatches = holding.current_value_currency === currency
  const pnl =
    holding.current_value_minor && valueCurrencyMatches
      ? BigInt(holding.current_value_minor) - BigInt(cb.totalCostMinor)
      : null

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <SheetContent side="bottom" className="mx-auto max-h-[90vh] max-w-lg overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{holding.asset?.name ?? t('unknownAsset')}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          {mode === 'edit' ? (
            <HoldingEditForm key={holding.id} holding={holding} onDone={() => setMode('view')} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{t(`assetClass.${holding.asset?.asset_class ?? 'us_equity'}`)}</Badge>
                <Badge variant={sleeveVariant(holding.sleeve)}>{t(`sleeve.${holding.sleeve}`)}</Badge>
                {holding.broker && <Badge variant="secondary">{holding.broker}</Badge>}
              </div>

              {holding.sleeve === 'risk_capital' && (
                <p className="flex items-center gap-1.5 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                  <AlertTriangle className="size-4 shrink-0" />
                  {t('riskCapitalWarning')}
                </p>
              )}

              <div className="space-y-1">
                <p className="text-2xl font-bold tabular-nums text-focal">
                  {holding.current_value_minor
                    ? formatMoney(holding.current_value_minor, holding.current_value_currency ?? currency)
                    : t('noCurrentValue')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('qtyHeld', { qty: cb.qty })} · {t('costBasisLine', { amount: formatMoney(cb.totalCostMinor, currency) })}
                </p>
                {pnl !== null && (
                  <p className={`text-sm font-medium tabular-nums ${pnl < 0n ? 'text-destructive' : 'text-primary'}`}>
                    {t('pnlLine', { amount: formatMoney(pnl, currency) })}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">{t('transactionsTitle')}</p>
                {holding.transactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('noTransactions')}</p>
                ) : (
                  <div className="divide-y rounded-lg border">
                    {holding.transactions.slice().reverse().map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium">{t(`txType.${tx.type}`)}{tx.qty ? ` · ${tx.qty}` : ''}</p>
                          <p className="text-xs text-muted-foreground">{new Date(tx.datetime).toLocaleDateString('th-TH')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="tabular-nums">{formatMoney(tx.price_minor, tx.currency)}</p>
                          <button type="button" onClick={() => handleDeleteTx(tx.id)} className="text-xs text-destructive hover:underline">
                            {t('deleteAction')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {mode === 'addTx' ? (
                <AddTransactionForm holding={holding} onDone={() => setMode('view')} />
              ) : (
                <Button variant="outline" className="w-full" onClick={() => setMode('addTx')}>
                  <Plus className="mr-1.5 size-4" />{t('addTransaction')}
                </Button>
              )}

              <Button className="w-full" onClick={() => setMode('edit')}>{t('edit')}</Button>
              <button
                type="button"
                onClick={handleDelete}
                className="block w-full pt-1 text-left text-sm text-destructive hover:underline"
              >
                {t('deleteHoldingAction')}
              </button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default function InvestClient({ holdings, assets }: { holdings: Holding[]; assets: Asset[] }) {
  const t = useTranslations('invest')
  const [addOpen, setAddOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const detailHolding = holdings.find((h) => h.id === detailId) ?? null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger asChild>
          <Button><Plus className="mr-2 size-4" />{t('addHolding')}</Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('addHolding')}</DialogTitle></DialogHeader>
          <AddHoldingDialog assets={assets} onClose={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>

      {holdings.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <p>{t('noHoldings')}</p>
          <p className="mt-1 text-sm">{t('noHoldingsHint')}</p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {holdings.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => setDetailId(h.id)}
              className="flex w-full min-h-14 items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{h.asset?.name ?? t('unknownAsset')}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  <Badge variant="secondary" className="text-xs">{t(`assetClass.${h.asset?.asset_class ?? 'us_equity'}`)}</Badge>
                  <Badge variant={sleeveVariant(h.sleeve)} className="text-xs">{t(`sleeve.${h.sleeve}`)}</Badge>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">
                  {h.current_value_minor
                    ? formatMoney(h.current_value_minor, h.current_value_currency ?? h.asset?.currency ?? 'THB')
                    : formatMoney(h.costBasis.totalCostMinor, h.asset?.currency ?? 'THB')}
                </p>
                <p className="text-xs text-muted-foreground">{t('qtyHeld', { qty: h.costBasis.qty })}</p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      <HoldingDetailSheet
        holding={detailHolding}
        open={detailId !== null}
        onOpenChange={(o) => { if (!o) setDetailId(null) }}
      />
    </div>
  )
}
