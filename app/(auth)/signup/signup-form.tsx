'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { signupAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'

const initialState = { error: '', success: false }

export default function SignupForm() {
  const t = useTranslations('auth')
  const [state, formAction, isPending] = useActionState(signupAction, initialState)

  if (state.success) {
    return (
      <div className="rounded-lg border border-border bg-muted/50 p-4 text-center text-sm">
        <p className="font-medium">{t('checkEmail')}</p>
        <p className="text-muted-foreground mt-1">{t('checkEmailDesc')}</p>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="displayName">{t('displayName')} <RequiredMark /></Label>
        <Input id="displayName" name="displayName" type="text" autoComplete="name" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="email">{t('email')} <RequiredMark /></Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">{t('password')} <RequiredMark /></Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t('signingUp') : t('signup')}
      </Button>
    </form>
  )
}
