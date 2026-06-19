'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { loginAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'

const initialState = { error: '' }

export default function LoginForm() {
  const t = useTranslations('auth')
  const [state, formAction, isPending] = useActionState(loginAction, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="email">{t('email')} <RequiredMark /></Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">{t('password')} <RequiredMark /></Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t('signingIn') : t('login')}
      </Button>
    </form>
  )
}
