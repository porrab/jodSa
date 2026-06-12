import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { computeAccountBalance } from '@/lib/money'
import AccountsClient from './accounts-client'

export default async function AccountsPage() {
  const t = await getTranslations('account')
  const supabase = await createClient()

  const [{ data: accounts }, { data: transactions }] = await Promise.all([
    supabase.from('accounts').select('*').order('created_at'),
    supabase
      .from('transactions')
      .select('type, amount_satang, account_id, to_account_id'),
  ])

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
    balance: computeAccountBalance(
      (transactions ?? []) as Parameters<typeof computeAccountBalance>[0],
      acct.id,
    ),
    qrUrl: acct.qr_image_path ? (qrUrls.get(acct.qr_image_path) ?? null) : null,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
      </div>
      <AccountsClient accounts={accountsWithBalance} />
    </div>
  )
}
