import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import LoginForm from './login-form'

export default async function LoginPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')
  const t = await getTranslations('auth')

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center">
        <span aria-hidden="true" className="mx-auto mb-3 flex size-14 items-center justify-center rounded-md border-2 border-honey-edge bg-primary text-2xl font-bold text-primary-foreground">฿</span>
        <h1 className="text-[28px] font-bold leading-[1.7]">JodSa</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('loginTitle')}</p>
      </div>
      <p className="rounded-md bg-secondary px-4 py-3 text-center text-sm text-muted-foreground">{t('privacyLine')}</p>
      <LoginForm />
      <p className="text-center text-sm text-muted-foreground">
        {t('noAccount')}{' '}
        <Link href="/signup" className="text-honey-text underline underline-offset-4">
          {t('signup')}
        </Link>
      </p>
    </div>
  )
}
