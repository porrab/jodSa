'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { RequiredMark } from '@/components/ui/required-mark'
import { entryCheck, feeFromBaht, validFx } from '@/lib/invest/entry'
import { convertMinor, minorUnitDecimals, toMajor, toMinor } from '@/lib/invest/money'

export function InvestEntryGuide({ prefix = 'h', feeStatus }: { prefix?: 'h' | 'tx'; feeStatus?: React.ReactNode }) {
  const t = useTranslations('invest.entry')
  return <details className="rounded-lg border border-border px-3 text-sm">
    <summary className="min-h-11 cursor-pointer py-3 font-medium text-honey-text">{t('guideTitle')}</summary>
    <table className="w-full table-fixed text-left"><tbody>
      {(['qty', 'price', 'fees', 'date', 'fx', 'cash', 'value'] as const).map(field => <tr key={field} className="border-t border-border align-top">
        <th scope="row" className="w-1/3 py-2 pr-2 font-medium">{t(`${field}Name`)}</th>
        <td id={field === 'price' ? undefined : `${prefix}-${field === 'date' ? 'datetime' : field}-hint`} className="break-words py-2 text-muted-foreground">{t(`${field}Hint`)}</td>
      </tr>)}
    </tbody></table>
    <p className="py-2 text-muted-foreground">{t('needsFx')}</p>
    {feeStatus}
    <p className="pb-2 text-muted-foreground">{t('checkHint')}</p>
    <p className="pb-2 text-muted-foreground">{t('sellCheckHint')}</p>
    <p className="pb-3 text-muted-foreground">{t('example')}</p>
  </details>
}

export type EntryNumbers = { qty: string; price: string; fees: string; fx: string }

export default function InvestEntryFields({ prefix, currency, type = 'buy', onNumbers }: {
  prefix: 'h' | 'tx'; currency: string; type?: 'buy' | 'sell' | 'dividend' | 'fee'
  onNumbers?: (numbers: EntryNumbers) => void
}) {
  const t = useTranslations('invest')
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')
  const [fees, setFees] = useState('')
  const [fx, setFx] = useState('')
  const [bahtFees, setBahtFees] = useState(false)
  const needsQty = type === 'buy' || type === 'sell'
  const decimals = minorUnitDecimals(currency)
  const converted = bahtFees ? feeFromBaht(fees, fx, currency) : null
  const effectiveFees = bahtFees ? converted === null ? '' : toMajor(converted, currency).toFixed(decimals) : fees
  const check = needsQty && (!bahtFees || converted !== null) ? entryCheck(type, qty, price, effectiveFees, currency, fx) : null
  const major = (minor: bigint, code: string) => toMajor(minor, code).toFixed(minorUnitDecimals(code))
  useEffect(() => { onNumbers?.({ qty, price, fees: effectiveFees, fx }) }, [qty, price, effectiveFees, fx, onNumbers])

  function toggleBaht(next: boolean) {
    if (next && !validFx(fx)) return
    const value = Number(fees.replace(/,/g, ''))
    if (fees.trim() && Number.isFinite(value) && value >= 0) {
      const minor = next ? convertMinor(toMinor(value, currency), Number(fx), currency, 'THB') : converted
      setFees(minor === null ? '' : major(minor, next ? 'THB' : currency))
    }
    setBahtFees(next)
  }

  function changeFx(value: string) {
    if (bahtFees && !validFx(value)) {
      // Preserve the last valid asset-currency fee before disabling THB entry.
      if (converted !== null) setFees(effectiveFees)
      setBahtFees(false)
    }
    setFx(value)
  }

  function hint(field: string, id: string) {
    return <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t(`entry.${field}Hint`)}</p>
  }
  const priceId = prefix === 'h' ? 'h-price' : 'tx-amount'
  return <div className="space-y-3">
    {needsQty && <div className="space-y-1">
      <Label htmlFor={`${prefix}-qty`}>{t('qtyLabel')} <RequiredMark /></Label>
      <Input id={`${prefix}-qty`} name="qty" inputMode="decimal" required value={qty} onChange={e => setQty(e.target.value)} aria-describedby={`${prefix}-qty-hint`} className="min-h-11 tabular-nums" />
    </div>}
    <div className="space-y-1">
      <Label htmlFor={priceId}>{t(needsQty ? 'priceLabel' : 'amountLabel', { currency })} <RequiredMark /></Label>
      <Input id={priceId} name={prefix === 'h' ? 'price' : 'amount'} inputMode="decimal" required value={price} onChange={e => setPrice(e.target.value)} aria-describedby={needsQty ? `${priceId}-hint` : undefined} className="min-h-11 tabular-nums" />
      {needsQty && hint('price', priceId)}
    </div>
    {currency !== 'THB' && <div className="space-y-1">
      <Label htmlFor={`${prefix}-fx`}>{t('fxRateLabel', { currency })}</Label>
      <Input id={`${prefix}-fx`} name="fx_rate" inputMode="decimal" value={fx} onChange={e => changeFx(e.target.value)} required={bahtFees} pattern="[0-9]+(\.[0-9]+)?" aria-describedby={`${prefix}-fx-hint`} className="min-h-11 tabular-nums" />
    </div>}
    <div className="space-y-1">
      <Label htmlFor={`${prefix}-fees`}>{t('feesLabel')} ({bahtFees ? 'THB' : currency})</Label>
      <Input id={`${prefix}-fees`} inputMode="decimal" pattern={'[0-9]+(,[0-9]{3})*(\.[0-9]*)?'} value={fees} onChange={e => setFees(e.target.value)} placeholder="0" aria-describedby={`${prefix}-fees-hint`} className="min-h-11 tabular-nums" />
      <input type="hidden" name="fees" value={effectiveFees} />
      {currency !== 'THB' && <>
        <Label htmlFor={`${prefix}-baht-fees`} className="min-h-11 justify-between gap-3">
          {t('entry.enterBaht')}<Switch id={`${prefix}-baht-fees`} checked={bahtFees} disabled={!validFx(fx)} onCheckedChange={toggleBaht} />
        </Label>
      </>}
    </div>
    <div className="space-y-1">
      <Label htmlFor={`${prefix}-datetime`}>{t('dateLabel')} <RequiredMark /></Label>
      <Input id={`${prefix}-datetime`} name="datetime" type="datetime-local" required aria-describedby={`${prefix}-datetime-hint`} className="min-h-11 w-full min-w-0" />
    </div>
    {needsQty && <div role="status" aria-live="polite" className="rounded-lg bg-secondary p-3 text-sm">
      <p className="break-words font-medium tabular-nums">{check ? `${qty} × ${price} ${type === 'sell' ? '−' : '+'} ${effectiveFees || '0'} = ${major(check.minor, currency)} ${currency}${check.baht !== null && currency !== 'THB' ? ` ≈ ${major(check.baht, 'THB')} ฿` : ''}` : t('entry.checkEmpty')}</p>
    </div>}
    <InvestEntryGuide prefix={prefix} feeStatus={bahtFees && converted !== null ? <p className="pb-2 text-muted-foreground">{t('entry.storedFee', { amount: major(converted, currency), currency })}</p> : undefined} />
  </div>
}
