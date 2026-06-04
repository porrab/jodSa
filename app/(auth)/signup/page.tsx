import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import SignupForm from './signup-form'

export default async function SignupPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">JodSa</h1>
        <p className="text-muted-foreground mt-1 text-sm">สร้างบัญชีใหม่</p>
      </div>
      <SignupForm />
      <p className="text-center text-sm text-muted-foreground">
        มีบัญชีอยู่แล้ว?{' '}
        <Link href="/login" className="text-foreground underline underline-offset-4">
          เข้าสู่ระบบ
        </Link>
      </p>
    </div>
  )
}
