import { redirect } from 'next/navigation'
import { createClient, getUser } from '@/lib/supabase/server'
import { buildLastAccountMap } from '@/lib/last-account'
import AppShell from '@/components/app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // Seed the global quick-add sheet:
  //   • accounts list → fills the account picker
  //   • lastByCategory / globalLastAccountId → drives the per-category default
  const [{ data: accounts }, { data: history }, { data: profile }] = await Promise.all([
    supabase.from('accounts').select('*').order('created_at'),
    supabase
      .from('transactions')
      .select('category, account_id')
      .in('type', ['income', 'expense'])
      .order('datetime', { ascending: false })
      .limit(500),
    supabase.from('users').select('display_name').eq('id', user.id).single(),
  ])

  return (
    <AppShell
      accounts={accounts ?? []}
      lastByCategory={buildLastAccountMap(history ?? [])}
      globalLastAccountId={history?.[0]?.account_id ?? null}
      displayName={profile?.display_name ?? null}
    >
      {children}
    </AppShell>
  )
}
