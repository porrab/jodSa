'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { accountSchema } from '@/lib/validators/account'
import { parseInputToSatang } from '@/lib/money'

// Opening balance is optional and may legitimately be 0 (or negative later);
// an empty field means 0. Never a transaction — stored on the account row.
function readOpeningBalance(formData: FormData): number {
  const raw = (formData.get('opening_balance') as string | null)?.trim()
  if (!raw) return 0
  return parseInputToSatang(raw) ?? 0
}

// M8: optional "เลขท้ายบัญชี" hint — free text, empty means null (not "").
function readNumberHint(formData: FormData): string | null {
  const raw = (formData.get('number_hint') as string | null)?.trim()
  return raw ? raw : null
}

export async function createAccount(_prev: { error: string; id?: string }, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const parsed = accountSchema.safeParse({
    name: formData.get('name'),
    bank: formData.get('bank'),
    number_hint: formData.get('number_hint') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  // .select().single() so callers (the J4 first-account onboarding sheet + the
  // global empty-source "+ สร้าง…" inline create) can immediately select the
  // new account without a second round trip.
  const { data, error } = await supabase
    .from('accounts')
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      bank: parsed.data.bank,
      opening_balance_satang: readOpeningBalance(formData),
      number_hint: readNumberHint(formData),
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/accounts')
  revalidatePath('/dashboard')
  return { error: '', id: data.id }
}

export async function updateAccount(_prev: { error: string }, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const id = formData.get('id') as string
  const parsed = accountSchema.safeParse({
    name: formData.get('name'),
    bank: formData.get('bank'),
    number_hint: formData.get('number_hint') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const { error } = await supabase
    .from('accounts')
    .update({
      name: parsed.data.name,
      bank: parsed.data.bank,
      opening_balance_satang: readOpeningBalance(formData),
      number_hint: readNumberHint(formData),
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/accounts')
  revalidatePath('/dashboard')
  return { error: '' }
}

const QR_MAX_BYTES = 2 * 1024 * 1024

export async function uploadAccountQr(_prev: { error: string }, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const accountId = formData.get('id') as string
  const file = formData.get('file')
  if (!(file instanceof File) || !file.type.startsWith('image/')) {
    return { error: 'กรุณาเลือกไฟล์รูปภาพ' }
  }
  if (file.size > QR_MAX_BYTES) return { error: 'ไฟล์ใหญ่เกิน 2MB' }

  const { data: account } = await supabase
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .single()
  if (!account) return { error: 'ไม่พบบัญชี' }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${user.id}/${accountId}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('bank-qr')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (uploadError) return { error: uploadError.message }

  const { error } = await supabase
    .from('accounts')
    .update({ qr_image_path: path })
    .eq('id', accountId)
  if (error) return { error: error.message }

  revalidatePath('/accounts')
  return { error: '' }
}

export async function removeAccountQr(accountId: string) {
  const supabase = await createClient()
  const { data: account, error: fetchError } = await supabase
    .from('accounts')
    .select('qr_image_path')
    .eq('id', accountId)
    .single()
  if (fetchError) throw new Error(fetchError.message)

  if (account.qr_image_path) {
    await supabase.storage.from('bank-qr').remove([account.qr_image_path])
  }

  const { error } = await supabase
    .from('accounts')
    .update({ qr_image_path: null })
    .eq('id', accountId)
  if (error) throw new Error(error.message)

  revalidatePath('/accounts')
}

export async function deleteAccount(id: string) {
  const supabase = await createClient()
  const { data: account } = await supabase
    .from('accounts')
    .select('qr_image_path')
    .eq('id', id)
    .single()
  if (account?.qr_image_path) {
    await supabase.storage.from('bank-qr').remove([account.qr_image_path])
  }
  const { error } = await supabase.from('accounts').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/accounts')
  revalidatePath('/transactions')
}
