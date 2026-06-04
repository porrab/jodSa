'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { accountSchema } from '@/lib/validators/account'

export async function createAccount(_prev: { error: string }, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const parsed = accountSchema.safeParse({
    name: formData.get('name'),
    bank: formData.get('bank'),
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const { error } = await supabase
    .from('accounts')
    .insert({ user_id: user.id, ...parsed.data })

  if (error) return { error: error.message }

  revalidatePath('/accounts')
  return { error: '' }
}

export async function updateAccount(_prev: { error: string }, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const id = formData.get('id') as string
  const parsed = accountSchema.safeParse({
    name: formData.get('name'),
    bank: formData.get('bank'),
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const { error } = await supabase
    .from('accounts')
    .update(parsed.data)
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/accounts')
  return { error: '' }
}

export async function deleteAccount(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('accounts').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/accounts')
  revalidatePath('/transactions')
}
