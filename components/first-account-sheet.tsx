'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import AccountQuickCreateForm from '@/components/account-quick-create-form'

/**
 * J4 — first run. Auto-opens once when the signed-in user has zero accounts
 * (a brand-new signup, or anyone who deleted their last account) so they
 * never land on an empty Home with no way to log anything. Dismissable (it's
 * guidance, not a hard block) — the global empty-source "+ สร้าง…" rule on
 * every picker is the fallback if they close it without creating one.
 */
export default function FirstAccountSheet({ hasAccounts }: { hasAccounts: boolean }) {
  const t = useTranslations('account')
  const router = useRouter()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!hasAccounts) setOpen(true)
  }, [hasAccounts])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-2xl px-4 pb-8">
        <SheetHeader>
          <SheetTitle>{t('onboardingTitle')}</SheetTitle>
          <SheetDescription>{t('onboardingHint')}</SheetDescription>
        </SheetHeader>
        <AccountQuickCreateForm
          onSuccess={() => {
            setOpen(false)
            router.refresh()
          }}
        />
      </SheetContent>
    </Sheet>
  )
}
