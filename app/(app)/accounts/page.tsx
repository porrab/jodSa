import { createClient } from '@/lib/supabase/server'
import { computeAccountBalance } from '@/lib/money'
import AccountsClient from './accounts-client'

export default async function AccountsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: accounts }, { data: transactions }] = await Promise.all([
    supabase.from('accounts').select('*').order('created_at'),
    supabase
      .from('transactions')
      .select('type, amount_satang, account_id, to_account_id'),
  ])

  const accountsWithBalance = (accounts ?? []).map((acct) => ({
    ...acct,
    balance: computeAccountBalance(
      (transactions ?? []) as Parameters<typeof computeAccountBalance>[0],
      acct.id,
    ),
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">บัญชี</h1>
      </div>
      <AccountsClient accounts={accountsWithBalance} />
    </div>
  )
}
