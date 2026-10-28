import { createClient } from '@/lib/supabase/server'
import AccountsClient from './accounts-client'
import { holdingSymbolsForRows } from '@/lib/holding-symbols'

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const { account: initialAccountId } = await searchParams
  const supabase = await createClient()

  // account_balances aggregates in Postgres (RLS applies) so this page doesn't
  // pull the user's whole transaction history just to sum it.
  const [{ data: accounts }, { data: balances }, { data: recentTransactions }] = await Promise.all([
    supabase.from('accounts').select('*').order('created_at'),
    supabase.rpc('account_balances'),
    supabase.from('transactions').select('*').order('datetime', { ascending: false }).limit(100),
  ])
  const balanceByAccount = new Map((balances ?? []).map((b) => [b.account_id, b.balance_satang]))

  const qrPaths = (accounts ?? [])
    .map((a) => a.qr_image_path)
    .filter((p): p is string => p !== null)
  const qrUrls = new Map<string, string>()
  if (qrPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from('bank-qr')
      .createSignedUrls(qrPaths, 3600)
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) qrUrls.set(s.path, s.signedUrl)
    }
  }

  const accountsWithBalance = (accounts ?? []).map((acct) => ({
    ...acct,
    balance: balanceByAccount.get(acct.id) ?? acct.opening_balance_satang ?? 0,
    qrUrl: acct.qr_image_path ? (qrUrls.get(acct.qr_image_path) ?? null) : null,
  }))
  const holdingSymbols = await holdingSymbolsForRows(supabase, recentTransactions ?? [])

  return (
    <div className="space-y-6">
      <AccountsClient accounts={accountsWithBalance} recentTransactions={recentTransactions ?? []} holdingSymbols={holdingSymbols} initialAccountId={initialAccountId ?? null} />
    </div>
  )
}
