'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { groupSchema } from '@/lib/validators/group'

export async function createGroup(_prev: { error: string }, formData: FormData): Promise<{ error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const parsed = groupSchema.safeParse({
    title: formData.get('title'),
    note: formData.get('note') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const { error } = await supabase
    .from('groups')
    .insert({ user_id: user.id, ...parsed.data })
  if (error) return { error: error.message }

  revalidatePath('/groups')
  return { error: '' }
}

export async function updateGroup(_prev: { error: string }, formData: FormData): Promise<{ error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const id = formData.get('id') as string
  const parsed = groupSchema.safeParse({
    title: formData.get('title'),
    note: formData.get('note') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const { error } = await supabase
    .from('groups')
    .update({ ...parsed.data, note: parsed.data.note ?? null })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/groups')
  revalidatePath(`/groups/${id}`)
  return { error: '' }
}

export async function deleteGroup(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  // transactions.group_id has ON DELETE SET NULL — members are unassigned, not deleted.
  const { error } = await supabase.from('groups').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/groups')
}

/** Assign (groupId) or unassign (null) a transaction to a group. */
export async function setTransactionGroup(txId: string, groupId: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { error } = await supabase
    .from('transactions')
    .update({ group_id: groupId })
    .eq('id', txId)
  if (error) throw new Error(error.message)
  revalidatePath('/groups')
  if (groupId) revalidatePath(`/groups/${groupId}`)
  revalidatePath('/transactions')
}
