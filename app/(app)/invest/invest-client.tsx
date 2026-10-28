'use client'

import { useActionState, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Plus, ChevronRight, AlertTriangle, WalletCards } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
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
import { getHoldingDisplay } from '@/lib/invest/portfolio'
import {
  ASSET_CLASSES, SLEEVES, ASSET_TX_TYPES, CURRENCIES,
  type AssetClass, type Sleeve, type AssetTxType,
} from '@/lib/validators/invest'
import { formatMoney, parseMinor, toMajor, minorUnitDecimals } from '@/lib/invest/money'
import { formatAppDate } from '@/lib/date-display'
import { formatTHB } from '@/lib/money'
import AccountGrid from '@/components/account-grid'
import InlineCreateAccount from '@/components/inline-create-account'
import { useAccountBalances } from '@/lib/use-account-balances'

type CashAccount = { id: string; name: string; bank: string }

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
  cashLinks: Array<{ id: string; accountName: string; amountSatang: number; datetime: string }>
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
        <button type="button" onClick={() => setShowCustom((s) => !s)} className="text-sm text-honey-text hover:underline">
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
              <p className="flex items-center gap-1 text-sm text-destructive">
                <AlertTriangle className="size-3.5" />{t('riskCapitalWarning')}
              </p>
            )}
            {sleeve === 'ballast' && (
              <p className="text-sm text-muted-foreground">{t('ballastHelper')}</p>
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
              <p className="text-sm text-muted-foreground">{t('fxRateHint')}</p>
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

function AddTransactionForm({ holding, accounts, onDone }: { holding: Holding; accounts: CashAccount[]; onDone: () => void }) {
  const t = useTranslations('invest')
  const tc = useTranslations('common')
  const [type, setType] = useState<AssetTxType>('buy')
  const currency = holding.asset?.currency ?? 'THB'
  const needsQty = type === 'buy' || type === 'sell'
  const [cashOpen, setCashOpen] = useState(false)
  const [cashAccountId, setCashAccountId] = useState('')
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')
  const [fees, setFees] = useState('')
  const [cashAmount, setCashAmount] = useState('')
  const [cashAmountTouched, setCashAmountTouched] = useState(false)
  const { balances, loading: balancesLoading } = useAccountBalances(accounts.length > 0)
  const thbPrefill = Number(qty) > 0 && Number(price) > 0
    ? (Number(qty) * Number(price) + (Number(fees) || 0)).toFixed(2) : ''
  const shownCashAmount = cashAmountTouched ? cashAmount : currency === 'THB' ? thbPrefill : ''

  const [state, formAction, isPending] = useActionState(
    async (prev: { error: string }, fd: FormData) => {
      fd.set('holding_id', holding.id)
      fd.set('type', type)
      fd.set('currency', currency)
      if (cashOpen && type === 'buy') {
        fd.set('cash_enabled', 'true')
        fd.set('cash_account_id', cashAccountId)
        fd.set('cash_amount', shownCashAmount)
      }
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
        <div className="flex flex-wrap gap-2">
          {ASSET_TX_TYPES.map((tt) => (
            <Chip key={tt} pressed={type === tt} onClick={() => setType(tt)}>{t(`txType.${tt}`)}</Chip>
          ))}
        </div>
      </div>
      {needsQty && (
        <div className="space-y-1">
          <Label htmlFor="tx-qty">{t('qtyLabel')} <RequiredMark /></Label>
        <Input id="tx-qty" name="qty" type="text" inputMode="decimal" required className="tabular-nums" value={qty} onChange={(event) => setQty(event.target.value)} />
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="tx-amount">
          {needsQty ? t('priceLabel', { currency }) : t('amountLabel', { currency })} <RequiredMark />
        </Label>
        <Input id="tx-amount" name="amount" type="text" inputMode="decimal" required className="tabular-nums" value={price} onChange={(event) => setPrice(event.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="tx-fees">{t('feesLabel')}</Label>
          <Input id="tx-fees" name="fees" type="text" inputMode="decimal" placeholder="0" className="tabular-nums" value={fees} onChange={(event) => setFees(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tx-datetime">{t('dateLabel')} <RequiredMark /></Label>
          <Input id="tx-datetime" name="datetime" type="datetime-local" required />
        </div>
      </div>
      {type === 'buy' && <div className="rounded-md border border-border bg-secondary p-3">
        <button type="button" className="flex min-h-11 w-full items-center justify-between text-left text-sm font-medium" aria-expanded={cashOpen} onClick={() => setCashOpen((open) => !open)}>
          {t('cashFromJodsa')} <span aria-hidden="true">{cashOpen ? '−' : '+'}</span>
        </button>
        {cashOpen && <div className="space-y-3 pt-2">
          <Label>{t('cashAccount')} <RequiredMark /></Label>
          {accounts.length === 0 ? <InlineCreateAccount hint={t('cashAccount')} onCreated={setCashAccountId} /> :
            <AccountGrid accounts={accounts} value={cashAccountId} onValueChange={setCashAccountId} balances={balances} balancesLoading={balancesLoading} label={t('cashAccount')} compact />}
          <Label htmlFor="tx-cash-amount">{t('cashAmountTHB')} <RequiredMark /></Label>
          <Input id="tx-cash-amount" name="cash_amount" type="text" inputMode="decimal" required value={shownCashAmount} onChange={(event) => { setCashAmountTouched(true); setCashAmount(event.target.value) }} className="tabular-nums" />
        </div>}
      </div>}
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
          <p className="flex items-center gap-1 text-sm text-destructive">
            <AlertTriangle className="size-3.5" />{t('riskCapitalWarning')}
          </p>
        )}
        {sleeve === 'ballast' && (
          <p className="text-sm text-muted-foreground">{t('ballastHelper')}</p>
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
        <p className="text-sm text-muted-foreground">{t('currentValueHint')}</p>
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
  accounts,
  open,
  onOpenChange,
}: {
  holding: Holding | null
  accounts: CashAccount[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('invest')
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [tradeOpen, setTradeOpen] = useState(false)
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null)

  function close() {
    setMode('view')
    setTradeOpen(false)
    setSelectedTradeId(null)
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
    if (!confirm(`${t('deleteTxConfirm')}${selectedTrade?.type === 'buy' && holding?.cashLinks.length ? `\n${t('linkedCashWarning')}` : ''}`)) return
    try {
      await deleteAssetTransaction(id)
      toast.success(t('txDeleted'))
    } catch {
      toast.error(t('actionFailed'))
    }
  }

  if (!holding) return null
  const currency = holding.asset?.currency ?? 'THB'
  const display = getHoldingDisplay(holding, currency)
  const cb = holding.costBasis
  const selectedTrade = holding.transactions.find((tx) => tx.id === selectedTradeId) ?? null

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
                <p className="flex items-center gap-1.5 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
                  <AlertTriangle className="size-4 shrink-0" />
                  {t('riskCapitalWarning')}
                </p>
              )}

              <div className="space-y-1">
                <p className="text-4xl font-bold leading-[1.7] tabular-nums text-focal">
                  {display.valueMinor
                    ? formatMoney(display.valueMinor, holding.current_value_currency ?? currency)
                    : t('noCurrentValue')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('qtyHeld', { qty: cb.qty })} · {t('costBasisLine', { amount: formatMoney(display.costMinor, currency) })}
                </p>
                {display.pnlMinor !== null && (
                  <p className={`text-sm font-medium tabular-nums ${display.pnlMinor < 0n ? 'text-destructive' : 'text-income'}`}>
                    {t('pnlLine', { amount: formatMoney(display.pnlMinor, currency) })}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">{t('transactionsTitle')}</p>
                {holding.cashLinks.map((cash) => <p key={cash.id} className="rounded-md bg-info-soft px-3 py-2 text-sm text-transfer">{t('cashLinkedLine', { account: cash.accountName, amount: formatTHB(cash.amountSatang) })}</p>)}
                {holding.transactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('noTransactions')}</p>
                ) : (
                  <div>
                    {holding.transactions.slice().reverse().map((tx) => (
                      <button type="button" onClick={() => setSelectedTradeId(tx.id)} key={tx.id} className="flex w-full items-center gap-3 border-b border-border py-3 text-left text-sm hover:bg-accent/40 focus-visible:border-b-2 focus-visible:border-honey-edge focus-visible:bg-accent/40 focus-visible:outline-none last:border-b-0">
                        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-honey-soft text-focal"><WalletCards aria-hidden="true" className="size-4" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{t(`txType.${tx.type}`)}{tx.qty ? ` · ${tx.qty}` : ''}</p>
                          <p className="text-sm text-muted-foreground">{formatAppDate(tx.datetime, { locale: 'th', includeYear: true })}</p>
                        </div>
                        <p className="shrink-0 tabular-nums">{formatMoney(tx.price_minor, tx.currency)}</p>
                        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Button variant="outline" className="w-full" onClick={() => setTradeOpen(true)}>
                <Plus className="mr-1.5 size-4" />{t('addTransaction')}
              </Button>

              <Button variant="outline" className="w-full" onClick={() => setMode('edit')}>{t('edit')}</Button>
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
        <Sheet open={tradeOpen} onOpenChange={setTradeOpen}>
          <SheetContent side="bottom" className="mx-auto max-h-[90svh] max-w-lg overflow-y-auto rounded-t-2xl">
            <SheetHeader><SheetTitle>{t('addTransaction')}</SheetTitle></SheetHeader>
            <div className="px-4 pb-6"><AddTransactionForm holding={holding} accounts={accounts} onDone={() => setTradeOpen(false)} /></div>
          </SheetContent>
        </Sheet>
        <Sheet open={selectedTrade !== null} onOpenChange={(next) => { if (!next) setSelectedTradeId(null) }}>
          <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-2xl">
            <SheetHeader><SheetTitle>{selectedTrade ? t(`txType.${selectedTrade.type}`) : t('transactionsTitle')}</SheetTitle></SheetHeader>
            {selectedTrade && <div className="space-y-5 px-4 pb-6">
              <p className="text-center text-3xl font-bold tabular-nums">{formatMoney(selectedTrade.price_minor, selectedTrade.currency)}</p>
              <p className="text-center text-sm text-muted-foreground">{formatAppDate(selectedTrade.datetime, { locale: 'th', includeYear: true })}</p>
              <button type="button" onClick={() => handleDeleteTx(selectedTrade.id)} className="text-sm text-destructive hover:underline">{t('deleteAction')}</button>
            </div>}
          </SheetContent>
        </Sheet>
      </SheetContent>
    </Sheet>
  )
}

export default function InvestClient({ holdings, assets, accounts, initialHoldingId }: { holdings: Holding[]; assets: Asset[]; accounts: CashAccount[]; initialHoldingId: string | null }) {
  const t = useTranslations('invest')
  const [addOpen, setAddOpen] = useState(false)
  useEffect(() => {
    const open = () => setAddOpen(true)
    window.addEventListener('jodsa:holding-add', open)
    return () => window.removeEventListener('jodsa:holding-add', open)
  }, [])
  const [detailId, setDetailId] = useState<string | null>(
    holdings.some((holding) => holding.id === initialHoldingId) ? initialHoldingId : null,
  )
  const detailHolding = holdings.find((h) => h.id === detailId) ?? null
  const holdingDisplays = holdings.map((holding) => ({ holding, display: getHoldingDisplay(holding, holding.asset?.currency ?? 'THB') }))
  const priced = holdingDisplays.filter(({ display }) => display.valueMinor !== null)
  const totalValue = priced.reduce((sum, { display }) => sum + BigInt(display.valueMinor ?? 0), 0n)
  const unpricedCount = holdings.length - priced.length

  return (
    <div className="space-y-4">
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent side="bottom" className="mx-auto max-h-[90svh] max-w-lg overflow-y-auto rounded-t-2xl">
          <SheetHeader><SheetTitle>{t('addHolding')}</SheetTitle></SheetHeader>
          <div className="px-4 pb-6"><AddHoldingDialog assets={assets} onClose={() => setAddOpen(false)} /></div>
        </SheetContent>
      </Sheet>

      {holdings.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <p>{t('noHoldings')}</p>
          <p className="mt-1 text-sm">{t('noHoldingsHint')}</p>
        </div>
      ) : (
        <div>
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">{t('totalValueManualLabel')}</p>
              <p className="text-[28px] font-bold leading-[1.35] tabular-nums">≈ {formatMoney(totalValue, 'THB')}</p>
            </div>
            {unpricedCount > 0 && <p className="text-sm text-muted-foreground">{t('unpricedNote', { count: unpricedCount })}</p>}
          </div>
          <div className="divide-y divide-border border-y border-border">
          {holdings.map((h) => {
            const rowCurrency = h.asset?.currency ?? 'THB'
            const rowDisplay = getHoldingDisplay(h, rowCurrency)
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => setDetailId(h.id)}
                className="flex w-full min-h-14 items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
              >
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-honey-text">
                  {(h.asset?.symbol ?? h.asset?.name ?? '?').slice(0, 3).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate whitespace-nowrap text-sm font-medium leading-snug">{h.asset?.name ?? t('unknownAsset')}</p>
                  <p className="mt-0.5 truncate whitespace-nowrap text-sm text-muted-foreground">
                    {t(`assetClass.${h.asset?.asset_class ?? 'us_equity'}`)} · {t(`sleeve.${h.sleeve}`)} · {t('qtyHeld', { qty: h.costBasis.qty })}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    {rowDisplay.valueMinor
                      ? formatMoney(rowDisplay.valueMinor, h.current_value_currency ?? rowCurrency)
                      : formatMoney(rowDisplay.costMinor, rowCurrency)}
                  </p>
                  {rowDisplay.pnlMinor !== null && <p className={`text-sm tabular-nums ${rowDisplay.pnlMinor < 0n ? 'text-destructive' : 'text-income'}`}>{rowDisplay.pnlMinor > 0n ? '+' : ''}{formatMoney(rowDisplay.pnlMinor, rowCurrency)}</p>}
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            )
          })}
          </div>
        </div>
      )}

      <HoldingDetailSheet
        holding={detailHolding}
        accounts={accounts}
        open={detailId !== null}
        onOpenChange={(o) => { if (!o) setDetailId(null) }}
      />
    </div>
  )
}
