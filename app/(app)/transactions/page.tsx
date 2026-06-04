import { createClient } from '@/lib/supabase/server'
import TransactionsClient from './transactions-client'

export default async function TransactionsPage() {
  const supabase = await createClient()

  const [{ data: transactions }, { data: accounts }] = await Promise.all([
    supabase
      .from('transactions')
      .select('*')
      .order('datetime', { ascending: false })
      .limit(200),
    supabase.from('accounts').select('*').order('created_at'),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">รายการ</h1>
      <TransactionsClient
        transactions={transactions ?? []}
        accounts={accounts ?? []}
      />
    </div>
  )
}
