'use server'

import { createClient } from '@/lib/supabase/server'

export async function signupAction(
  _prev: { error: string; success: boolean },
  formData: FormData,
) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const displayName = formData.get('displayName') as string

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: displayName },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('supabase.co', 'vercel.app')}/auth/callback`,
    },
  })

  if (error) return { error: error.message, success: false }
  return { error: '', success: true }
}
