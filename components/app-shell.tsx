'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import AppNav from '@/components/app-nav'
import TransactionForm from '@/components/transaction-form'
import SlipQueue from '@/components/slip-queue'
import { Button } from '@/components/ui/button'
import FirstAccountSheet from '@/components/first-account-sheet'
import PendingTxProvider from '@/components/pending-tx-provider'
import type { LastAccountMap } from '@/lib/last-account'
import { QUICK_ADD_EVENT, type QuickAddPrefill } from '@/lib/quick-add'
import type { Database } from '@/lib/supabase/types'

type Account = Database['public']['Tables']['accounts']['Row']

export default function AppShell({
  accounts,
  lastByCategory,
  globalLastAccountId,
  displayName,
  children,
}: {
  accounts: Account[]
  lastByCategory: LastAccountMap
  globalLastAccountId: string | null
  displayName: string | null
  children: React.ReactNode
}) {
  const t = useTranslations('quickAdd')
  const [open, setOpen] = useState(false)
  const [prefill, setPrefill] = useState<QuickAddPrefill>({})
  const [mode, setMode] = useState<'manual' | 'slip'>('manual')
  const [slipFiles, setSlipFiles] = useState<File[]>([])
  const [unsavedSlips, setUnsavedSlips] = useState(0)
  const [confirmClose, setConfirmClose] = useState(false)
  const slipInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<QuickAddPrefill>).detail ?? {}
      setPrefill({
        ...detail,
        datetime: detail.datetime ?? detail.date,
        account_id: detail.account_id ?? detail.accountId,
      })
      setMode(detail.mode ?? 'manual')
      setSlipFiles(detail.files ?? [])
      setConfirmClose(false)
      setOpen(true)
    }
    window.addEventListener(QUICK_ADD_EVENT, handler)
    return () => window.removeEventListener(QUICK_ADD_EVENT, handler)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setMode('manual')
    setSlipFiles([])
    setUnsavedSlips(0)
    setConfirmClose(false)
  }, [])

  const requestClose = useCallback(() => {
    if (unsavedSlips > 0) setConfirmClose(true)
    else close()
  }, [close, unsavedSlips])

  /**
   * An optimistic create failed (design v4 F6 rule 4): put the user's work back
   * on screen instead of making them retype it. Re-typing an amount because the
   * network blinked is a worse outcome than the wait the optimism removed.
   */
  const restore = useCallback((values: QuickAddPrefill) => {
    setPrefill(values)
    setMode('manual')
    setOpen(true)
  }, [])

  function pickSlips(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    setSlipFiles(files)
    setMode('slip')
  }

  return (
    <PendingTxProvider onFailure={restore}>
      <FirstAccountSheet hasAccounts={accounts.length > 0} />
      <div className="flex min-h-svh">
        <AppNav />
        <main className="h-[calc(100svh-4.1rem)] flex-1 overflow-auto md:h-auto">
          {/* pb-24 on mobile clears the fixed bottom nav so a page's last element stays tappable */}
          <div className="container mx-auto max-w-4xl p-4 pb-24 md:p-6 md:pb-6">{children}</div>
        </main>
      </div>

      <Sheet open={open} onOpenChange={(next) => next ? setOpen(true) : requestClose()}>
        <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="px-4 pt-4">
            <SheetTitle>{t('title')}</SheetTitle>
            <SheetDescription className="sr-only">{t('description')}</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-8">
            <div className="grid grid-cols-2 rounded-lg bg-muted p-1" role="tablist" aria-label={t('modeLabel')}>
              <button type="button" role="tab" aria-selected={mode === 'manual'} className={`min-h-11 rounded-md px-3 text-sm font-medium ${mode === 'manual' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`} onClick={() => setMode('manual')}>
                {t('manualMode')}
              </button>
              <button type="button" role="tab" aria-selected={mode === 'slip'} className={`min-h-11 rounded-md px-3 text-sm font-medium ${mode === 'slip' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`} onClick={() => slipFiles.length > 0 ? setMode('slip') : slipInputRef.current?.click()}>
                {t('slipMode')}
              </button>
              <input ref={slipInputRef} type="file" accept="image/*" multiple className="sr-only" onChange={pickSlips} />
            </div>

            {confirmClose && (
              <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm">{t('discardWarning', { count: unsavedSlips })}</p>
                <div className="flex gap-2">
                  <Button type="button" className="flex-1" onClick={() => setConfirmClose(false)}>{t('keepEditing')}</Button>
                  <Button type="button" variant="ghost" className="text-destructive" onClick={close}>{t('discard')}</Button>
                </div>
              </div>
            )}

            {mode === 'manual' && (
            <div>
              <TransactionForm
                key={open ? 'open' : 'closed'}
                accounts={accounts}
                lastByCategory={lastByCategory}
                globalLastAccountId={globalLastAccountId}
                defaultValues={prefill}
                onSuccess={close}
                optimistic
                stickySubmit
                idPrefix="quick-add"
              />
            </div>
            )}
            <div hidden={mode !== 'slip'}>
              <SlipQueue
                key={slipFiles.map((file) => `${file.name}-${file.lastModified}`).join('|')}
                initialFiles={slipFiles}
                displayName={displayName}
                accounts={accounts}
                lastByCategory={lastByCategory}
                globalLastAccountId={globalLastAccountId}
                variant="sheet"
                onUnsavedCountChange={setUnsavedSlips}
                onSingleSaved={close}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </PendingTxProvider>
  )
}
