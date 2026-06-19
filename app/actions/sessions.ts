'use server'

import { revalidatePath } from 'next/cache'
import { nanoid } from 'nanoid'
import { createClient } from '@/lib/supabase/server'
import { sessionSchema, guestSlipSchema } from '@/lib/validators/session'

export async function createSession(_prev: { error: string }, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const type = (formData.get('type') as string) === 'trip' ? 'trip' : 'collect'
  const title = ((formData.get('title') as string) ?? '').trim()
  if (!title) return { error: 'กรุณาใส่ชื่อรายการ' }

  // 21-char nanoid (~126 bits) IS the capability token — knowing it = guest access
  const id = nanoid(21)

  if (type === 'trip') {
    // Trip session: no single receiving account, no target. Each payer attaches
    // their own QR per expense.
    const { error } = await supabase.from('payment_sessions').insert({
      id, owner: user.id, account_id: null, type: 'trip', title, target_amount_satang: null,
    })
    if (error) return { error: error.message }

    // Auto-join the owner as a participant so they're in the ledger immediately.
    const { data: profile } = await supabase
      .from('users').select('display_name').eq('id', user.id).single()
    const { error: pErr } = await supabase.from('session_participants').insert({
      session_id: id,
      nickname: profile?.display_name ?? 'เจ้าของทริป',
      participant_token: nanoid(21),
      user_id: user.id,
      is_owner: true,
    })
    if (pErr) return { error: pErr.message }

    revalidatePath('/sessions')
    return { error: '' }
  }

  // collect (existing single-account behavior)
  const targetRaw = formData.get('target_amount_satang') as string | null
  const parsed = sessionSchema.safeParse({
    title,
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

  const { error } = await supabase.from('payment_sessions').insert({
    id, owner: user.id, type: 'collect', ...parsed.data,
  })
  if (error) return { error: error.message }

  revalidatePath('/sessions')
  return { error: '' }
}

// Host-side slip add. The owner inserts directly via their own session, so RLS
// (session_slips_owner_all) is the authority — no token/anon path here. Slips
// land unconfirmed, just like guest submissions: "recorded, not verified".
export async function addSessionSlip(
  sessionId: string,
  input: { amount_satang: number; ref_code: string | null; paid_at: string },
): Promise<{ error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const parsed = guestSlipSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const { error } = await supabase.from('session_slips').insert({
    session_id: sessionId,
    ...parsed.data,
  })
  if (error) {
    if (error.code === '23505') return { error: 'duplicate' }
    return { error: error.message }
  }

  revalidatePath('/sessions')
  revalidatePath(`/sessions/${sessionId}`)
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
