'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { buildTransactionCsv, bangkokRange, collectPages, EXPORT_TYPES, type ExportType } from '@/lib/csv-export'

const PAGE_SIZE = 1000

export default function CsvExport() {
  const t = useTranslations('settings')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [types, setTypes] = useState<ExportType[]>([...EXPORT_TYPES])
  const [state, setState] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle')

  function toggle(type: ExportType) {
    setState('idle')
    setTypes((current) => current.includes(type) ? current.filter((value) => value !== type) : [...current, type])
  }

  function updateDate(setter: (value: string) => void, value: string) {
    setState('idle')
    setter(value)
  }

  async function download() {
    if (!from || !to || from > to || types.length === 0) return
    setState('loading')
    try {
      const supabase = createClient()
      const range = bangkokRange(from, to)
      const txs = await collectPages(PAGE_SIZE, async (offset) => {
      const { data, error } = await supabase.from('transactions').select('*')
        .gte('datetime', range.from).lt('datetime', range.toExclusive).in('type', types)
        .order('datetime', { ascending: true }).order('id', { ascending: true }).range(offset, offset + PAGE_SIZE - 1)
      if (error) throw error
      return data ?? []
      })
      if (!txs.length) { setState('empty'); return }
      const accountIds = [...new Set(txs.flatMap((row) => [row.account_id, row.to_account_id]).filter((id): id is string => !!id))]
    const groupIds = [...new Set(txs.map((row) => row.group_id).filter((id): id is string => !!id))]
    const holdingIds = [...new Set(txs.map((row) => row.holding_id).filter((id): id is string => !!id))]
    const [{ data: accounts }, { data: groups }, { data: holdings }] = await Promise.all([
      accountIds.length ? supabase.from('accounts').select('id, name').in('id', accountIds) : Promise.resolve({ data: [] }),
      groupIds.length ? supabase.from('groups').select('id, title').in('id', groupIds) : Promise.resolve({ data: [] }),
      holdingIds.length ? supabase.from('holdings').select('id, asset_id').in('id', holdingIds) : Promise.resolve({ data: [] }),
    ])
    const assetIds = [...new Set((holdings ?? []).map((holding) => holding.asset_id))]
    const { data: assets } = assetIds.length ? await supabase.from('assets').select('id, symbol, name').in('id', assetIds) : { data: [] }
    const names = new Map((accounts ?? []).map((row) => [row.id, row.name]))
    const groupNames = new Map((groups ?? []).map((row) => [row.id, row.title]))
    const assetsById = new Map((assets ?? []).map((row) => [row.id, row.symbol || row.name]))
    const holdingsById = new Map((holdings ?? []).map((row) => [row.id, assetsById.get(row.asset_id) ?? '']))
    const csv = buildTransactionCsv(txs.map((row) => ({
      datetime: row.datetime, type: row.type, account: names.get(row.account_id) ?? '', toAccount: row.to_account_id ? names.get(row.to_account_id) ?? '' : '',
      holding: row.holding_id ? holdingsById.get(row.holding_id) ?? '' : '', category: row.category ?? '', counterparty: row.counterparty ?? '',
      amountSatang: row.amount_satang, note: row.note ?? '', refCode: row.ref_code ?? '', group: row.group_id ? groupNames.get(row.group_id) ?? '' : '',
    })))
    const href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = href; link.download = `jodsa-${from}-${to}.csv`; link.click()
      setTimeout(() => URL.revokeObjectURL(href), 0)
    } catch {
      setState('error')
    } finally {
      setState((current) => current === 'loading' ? 'idle' : current)
    }
  }

  return <section className="space-y-3 py-4" aria-labelledby="csv-export-title">
    <div><h2 id="csv-export-title" className="font-semibold">{t('exportTitle')}</h2><p className="text-sm text-muted-foreground">{t('exportDescription')}</p></div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Label className="flex min-w-0 flex-col gap-2">
        {t('exportFrom')}
        <Input className="min-h-11 w-full" type="date" value={from} onChange={(event) => updateDate(setFrom, event.target.value)} />
      </Label>
      <Label className="flex min-w-0 flex-col gap-2">
        {t('exportTo')}
        <Input className="min-h-11 w-full" type="date" value={to} onChange={(event) => updateDate(setTo, event.target.value)} />
      </Label>
    </div>
    <div className="flex flex-wrap gap-2">{EXPORT_TYPES.map((type) => <Chip key={type} pressed={types.includes(type)} onClick={() => toggle(type)}>{t(`exportType${type[0].toUpperCase()}${type.slice(1)}`)}</Chip>)}</div>
    {state === 'empty' && <p role="status" className="text-sm text-muted-foreground">{t('exportEmpty')}</p>}
    {state === 'error' && <p role="alert" className="text-sm text-destructive">{t('exportError')}</p>}
    <Button type="button" onClick={download} disabled={state === 'loading' || !from || !to || from > to || types.length === 0}><Download className="size-4" />{state === 'loading' ? t('exporting') : t('exportDownload')}</Button>
  </section>
}
