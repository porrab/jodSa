'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { transactionSchema } from '@/lib/validators/transaction'
import { parseInputToSatang } from '@/lib/money'

export async function createTransaction(_prev: { error: string }, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const type = formData.get('type') as string
  const amountStr = formData.get('amount') as string
  const amount_satang = parseInputToSatang(amountStr)
  if (!amount_satang) return { error: 'จำนวนเงินไม่ถูกต้อง' }

  const raw = {
    type,
    amount_satang,
    account_id: formData.get('account_id'),
    to_account_id: formData.get('to_account_id') || undefined,
    category: formData.get('category') || undefined,
    counterparty: formData.get('counterparty') || undefined,
    datetime: formData.get('datetime'),
    ref_code: formData.get('ref_code') || undefined,
    bank_code: formData.get('bank_code') || undefined,
    group_id: formData.get('group_id') || undefined,
  }

  const parsed = transactionSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const { error } = await supabase.from('transactions').insert({
    user_id: user.id,
    ...parsed.data,
  })

  if (error) {
    if (error.code === '23505') return { error: 'รายการนี้มีอยู่แล้ว (ref_code ซ้ำ)' }
    return { error: error.message }
  }

  revalidatePath('/transactions')
  revalidatePath('/dashboard')
  revalidatePath('/accounts')
  return { error: '' }
}

export async function deleteTransaction(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/transactions')
  revalidatePath('/dashboard')
  revalidatePath('/accounts')
}
