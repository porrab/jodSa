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
        <h1 className="text-2xl font-bold">JodSa</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('loginTitle')}</p>
      </div>
      <LoginForm />
      <p className="text-center text-sm text-muted-foreground">
        {t('noAccount')}{' '}
        <Link href="/signup" className="text-foreground underline underline-offset-4">
          {t('signup')}
        </Link>
      </p>
    </div>
  )
}
