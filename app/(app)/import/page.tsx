import { createClient, getUser } from '@/lib/supabase/server'
import { buildLastAccountMap } from '@/lib/last-account'
import ImportClient from './import-client'

export const metadata = { title: 'นำเข้าสลิป — JodSa' }

export default async function ImportPage() {
  const user = await getUser()
  if (!user) return null // (app)/layout.tsx already redirects unauthenticated users

  const supabase = await createClient()

  const [{ data: profile }, { data: accounts }, { data: history }] = await Promise.all([
    supabase.from('users').select('display_name').eq('id', user.id).single(),
    supabase.from('accounts').select('id, name, bank').eq('user_id', user.id).order('created_at'),
    // Per-category default seed — the slip-confirm form uses this as the
    // fallback after the parsed bank_code match (precedence: parsed >
    // per-category > global > fallback, prompt.md §6).
    supabase
      .from('transactions')
      .select('category, account_id')
      .in('type', ['income', 'expense'])
      .order('datetime', { ascending: false })
      .limit(500),
  ])

  return (
    <div className="mx-auto max-w-2xl">
      <ImportClient
        displayName={profile?.display_name ?? null}
        accounts={accounts ?? []}
        lastByCategory={buildLastAccountMap(history ?? [])}
        globalLastAccountId={history?.[0]?.account_id ?? null}
      />
    </div>
  )
}
