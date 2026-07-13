'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createAccount } from '@/app/actions/accounts'
import { BANKS } from '@/lib/validators/account'

/**
 * The minimal account-creation form design v3 (J4) specifies for guided
 * first-run + every inline empty-source "+ สร้าง…" affordance: ชื่อ + ธนาคาร,
 * optional เลขท้ายบัญชี. No opening-balance field here — that's an
 * accounts-page refinement, not part of the guided/quick path.
 */
export default function AccountQuickCreateForm({
  onSuccess,
}: {
  onSuccess: (accountId: string) => void
}) {
  const t = useTranslations('account')
  const tc = useTranslations('common')
  const [bank, setBank] = useState('')

  const [state, formAction, isPending] = useActionState(
    async (prev: { error: string; id?: string }, fd: FormData) => {
      if (bank) fd.set('bank', bank)
      const result = await createAccount(prev, fd)
      if (!result.error && result.id) onSuccess(result.id)
      else if (result.error) toast.error(result.error)
      return result
    },
    { error: '' },
  )

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="qc-name">{t('name')} <RequiredMark /></Label>
        <Input id="qc-name" name="name" required autoFocus />
      </div>
      <div className="space-y-1">
        <Label>{t('bank')} <RequiredMark /></Label>
        <Select value={bank} onValueChange={setBank} required>
          <SelectTrigger>
            <SelectValue placeholder={t('selectBank')} />
          </SelectTrigger>
          <SelectContent>
            {BANKS.map((b) => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="qc-number-hint">{t('numberHint')}</Label>
        <Input id="qc-number-hint" name="number_hint" placeholder="4415" />
        <p className="text-xs text-muted-foreground">{t('numberHintHint')}</p>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? tc('saving') : tc('save')}
      </Button>
    </form>
  )
}
