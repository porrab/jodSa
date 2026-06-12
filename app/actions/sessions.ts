'use server'

import { revalidatePath } from 'next/cache'
import { nanoid } from 'nanoid'
import { createClient } from '@/lib/supabase/server'
import { sessionSchema } from '@/lib/validators/session'

export async function createSession(_prev: { error: string }, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const targetRaw = formData.get('target_amount_satang') as string | null
  const parsed = sessionSchema.safeParse({
    title: formData.get('title'),
    account_id: formData.get('account_id'),
    target_amount_satang: targetRaw ? Number(targetRaw) : null,
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const { data: account } = await supabase
    .from('accounts')
    .select('qr_image_path')
    .eq('id', parsed.data.account_id)
    .single()
  if (!account) return { error: 'ไม่พบบัญชี' }
  if (!account.qr_image_path) {
    return { error: 'บัญชีนี้ยังไม่มี QR รับเงิน — อัปโหลดได้ที่หน้าบัญชี' }
  }

  // 21-char nanoid (~126 bits) IS the capability token — knowing it = guest access
  const { error } = await supabase.from('payment_sessions').insert({
    id: nanoid(21),
    owner: user.id,
    ...parsed.data,
  })
  if (error) return { error: error.message }

  revalidatePath('/sessions')
  return { error: '' }
}

export async function setSessionStatus(id: string, status: 'open' | 'closed') {
  const supabase = await createClient()
  const { error } = await supabase
    .from('payment_sessions')
    .update({ status })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/sessions')
  revalidatePath(`/sessions/${id}`)
}

export async function deleteSession(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('payment_sessions').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/sessions')
}

export async function setSlipConfirmed(slipId: string, sessionId: string, confirmed: boolean) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('session_slips')
    .update({ confirmed })
    .eq('id', slipId)
  if (error) throw new Error(error.message)
  revalidatePath(`/sessions/${sessionId}`)
}

export async function deleteSlip(slipId: string, sessionId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('session_slips').delete().eq('id', slipId)
  if (error) throw new Error(error.message)
  revalidatePath(`/sessions/${sessionId}`)
}
