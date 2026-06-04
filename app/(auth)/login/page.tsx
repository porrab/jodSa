import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import LoginForm from './login-form'

export default async function LoginPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">JodSa</h1>
        <p className="text-muted-foreground mt-1 text-sm">ยินดีต้อนรับกลับ</p>
      </div>
      <LoginForm />
      <p className="text-center text-sm text-muted-foreground">
        ยังไม่มีบัญชี?{' '}
        <Link href="/signup" className="text-foreground underline underline-offset-4">
          สมัครสมาชิก
        </Link>
      </p>
    </div>
  )
}
