'use client'

import { useCallback, useEffect, useState } from 'react'
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
import FirstAccountSheet from '@/components/first-account-sheet'
import type { LastAccountMap } from '@/lib/last-account'
import { QUICK_ADD_EVENT, type QuickAddPrefill } from '@/lib/quick-add'
import type { Database } from '@/lib/supabase/types'

type Account = Database['public']['Tables']['accounts']['Row']

export default function AppShell({
  accounts,
  lastByCategory,
  globalLastAccountId,
  children,
}: {
  accounts: Account[]
  lastByCategory: LastAccountMap
  globalLastAccountId: string | null
  children: React.ReactNode
}) {
  const t = useTranslations('quickAdd')
  const [open, setOpen] = useState(false)
  const [prefill, setPrefill] = useState<QuickAddPrefill>({})

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<QuickAddPrefill>).detail ?? {}
      setPrefill(detail)
      setOpen(true)
    }
    window.addEventListener(QUICK_ADD_EVENT, handler)
    return () => window.removeEventListener(QUICK_ADD_EVENT, handler)
  }, [])

  const close = useCallback(() => setOpen(false), [])

  return (
    <>
      <FirstAccountSheet hasAccounts={accounts.length > 0} />
      <div className="flex min-h-svh">
        <AppNav />
        <main className="flex-1 overflow-auto">
          {/* pb-24 on mobile clears the fixed bottom nav so a page's last element stays tappable */}
          <div className="container mx-auto max-w-4xl p-4 pb-24 md:p-6 md:pb-6">{children}</div>
        </main>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="px-4 pt-4">
            <SheetTitle>{t('title')}</SheetTitle>
            <SheetDescription className="sr-only">{t('description')}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-8">
            <TransactionForm
              key={open ? 'open' : 'closed'}
              accounts={accounts}
              lastByCategory={lastByCategory}
              globalLastAccountId={globalLastAccountId}
              defaultValues={prefill}
              onSuccess={close}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
