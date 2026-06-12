'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { budgetSchema } from '@/lib/validators/budget'
import { parseInputToSatang } from '@/lib/money'

import type { BudgetInput } from '@/lib/validators/budget'

type ParseResult = { ok: true; data: BudgetInput } | { ok: false; error: string }

function parseForm(formData: FormData): ParseResult {
  const amount_satang = parseInputToSatang((formData.get('amount') as string) ?? '')
  if (!amount_satang) return { ok: false, error: 'จำนวนเงินไม่ถูกต้อง' }

  const scope = formData.get('scope') as string
  const parsed = budgetSchema.safeParse({
    period: formData.get('period'),
    scope,
    category: scope === 'category' ? formData.get('category') || undefined : undefined,
    amount_satang,
  })
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message }
  // Normalize: overall budgets never carry a category.
  if (parsed.data.scope === 'overall') parsed.data.category = undefined
  return { ok: true, data: parsed.data }
}

export async function createBudget(_prev: { error: string }, formData: FormData): Promise<{ error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const result = parseForm(formData)
  if (!result.ok) return { error: result.error }

  const { error } = await supabase
    .from('budgets')
    .insert({ user_id: user.id, ...result.data })
  if (error) return { error: error.message }

  revalidatePath('/budgets')
  revalidatePath('/dashboard')
  return { error: '' }
}

export async function updateBudget(_prev: { error: string }, formData: FormData): Promise<{ error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const id = formData.get('id') as string
  const result = parseForm(formData)
  if (!result.ok) return { error: result.error }

  const { error } = await supabase
    .from('budgets')
    .update({ ...result.data, category: result.data.category ?? null })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/budgets')
  revalidatePath('/dashboard')
  return { error: '' }
}

export async function deleteBudget(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { error } = await supabase.from('budgets').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/budgets')
  revalidatePath('/dashboard')
}
