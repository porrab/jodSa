import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import SignupForm from './signup-form'

export default async function SignupPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')
  const t = await getTranslations('auth')

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">JodSa</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('signupTitle')}</p>
      </div>
      <SignupForm />
      <p className="text-center text-sm text-muted-foreground">
        {t('alreadyHaveAccount')}{' '}
        <Link href="/login" className="text-foreground underline underline-offset-4">
          {t('login')}
        </Link>
      </p>
    </div>
  )
}
