'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  ADJUSTMENT_CATEGORY,
  performReconcileRemainder,
  reconcileRemainderSchema,
  type ReconcileRemainderInput,
  type ReconcileRepository,
} from '@/lib/reconcile'

export async function getAccountReconcileState(accountId: string, savedTransactionIds: string[] = []): Promise<{
  error: string
  balanceSatang?: number
  reconciledAt?: string | null
  savedTransactions?: Array<{
    id: string
    type: 'income' | 'expense' | 'transfer'
    amount_satang: number
    category: string | null
    counterparty: string | null
    note: string | null
    datetime: string
  }>
}> {
  const supabase = await createClient()
  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('id, reconciled_at')
    .eq('id', accountId)
    .single()
  if (accountError || !account) return { error: 'ไม่พบบัญชี' }
  const { data, error } = await supabase.rpc('account_balances')
  if (error) return { error: error.message }
  const balance = (data ?? []).find((row) => row.account_id === accountId)?.balance_satang
  let savedTransactions: Array<{
    id: string
    type: 'income' | 'expense' | 'transfer'
    amount_satang: number
    category: string | null
    counterparty: string | null
    note: string | null
    datetime: string
  }> = []
  if (savedTransactionIds.length > 0) {
    const { data: rows, error: rowsError } = await supabase
      .from('transactions')
      .select('id, type, amount_satang, category, counterparty, note, datetime')
      .or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)
      .in('id', savedTransactionIds)
      .order('created_at', { ascending: false })
    if (rowsError) return { error: rowsError.message }
    savedTransactions = rows ?? []
  }
  return { error: '', balanceSatang: balance ?? 0, reconciledAt: account.reconciled_at, savedTransactions }
}

export async function reconcileRemainder(input: ReconcileRemainderInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error' as const, error: 'Not authenticated' }
  const parsed = reconcileRemainderSchema.safeParse(input)
  if (!parsed.success) return { status: 'error' as const, error: parsed.error.errors[0].message }

  const repository: ReconcileRepository = {
    async getAccountBalance(accountId) {
      const { data: account } = await supabase.from('accounts').select('id').eq('id', accountId).single()
      if (!account) return null
      const { data, error } = await supabase.rpc('account_balances')
      if (error) throw new Error(error.message)
      return (data ?? []).find((row) => row.account_id === accountId)?.balance_satang ?? 0
    },
    async insertAdjustment(row) {
      const { data, error } = await supabase.from('transactions').insert({
        user_id: user.id,
        account_id: row.accountId,
        type: row.type,
        amount_satang: row.amountSatang,
        category: ADJUSTMENT_CATEGORY,
        note: 'ปรับยอดให้ตรงธนาคาร',
        datetime: row.datetime,
      }).select('id').single()
      if (error) throw new Error(error.message)
      return data.id
    },
    async stampReconciled(accountId, reconciledAt) {
      const { error } = await supabase.from('accounts').update({ reconciled_at: reconciledAt }).eq('id', accountId)
      if (error) throw new Error(error.message)
    },
    async removeAdjustment(transactionId) {
      await supabase.from('transactions').delete().eq('id', transactionId)
    },
  }

  const result = await performReconcileRemainder(parsed.data, repository)
  if (result.status === 'saved') {
    revalidatePath('/accounts')
    revalidatePath('/transactions')
    revalidatePath('/dashboard')
    revalidatePath('/budgets')
  }
  return result
}
