'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import AccountQuickCreateForm from '@/components/account-quick-create-form'

/**
 * Global empty-source rule (design v3, J4): any picker whose source list is
 * empty must render an inline "+ สร้าง…" action + a one-line explanation —
 * never a disabled control with no exit. Pair this with a `hint` line and
 * drop it in wherever an accounts Select could otherwise be empty.
 */
export default function InlineCreateAccount({
  hint,
  onCreated,
}: {
  hint: string
  onCreated: (accountId: string) => void
}) {
  const t = useTranslations('account')
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-lg border border-dashed p-3">
      <p className="text-sm text-muted-foreground">{hint}</p>
      <Sheet open={open} onOpenChange={setOpen}>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 size-3.5" />
          {t('createInline')}
        </Button>
        <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-2xl px-4 pb-8">
          <SheetHeader><SheetTitle>{t('add')}</SheetTitle></SheetHeader>
          <AccountQuickCreateForm
            onSuccess={(id) => {
              setOpen(false)
              router.refresh()
              onCreated(id)
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  )
}
