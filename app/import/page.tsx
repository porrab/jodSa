import { redirect } from 'next/navigation'
import { createClient, getUser } from '@/lib/supabase/server'
import AppNav from '@/components/app-nav'
import ImportClient from './import-client'

export const metadata = { title: 'นำเข้าสลิป — JodSa' }

export default async function ImportPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const [{ data: profile }, { data: accounts }] = await Promise.all([
    supabase.from('users').select('display_name').eq('id', user.id).single(),
    supabase.from('accounts').select('id, name, bank').eq('user_id', user.id).order('created_at'),
  ])

  return (
    <div className="flex min-h-svh">
      <AppNav />
      <main className="flex-1 overflow-auto">
        {/* pb-24 on mobile clears the fixed bottom nav so the slip Save button stays tappable */}
        <div className="container mx-auto max-w-2xl p-4 pb-24 md:p-6 md:pb-6">
          <ImportClient
            displayName={profile?.display_name ?? null}
            accounts={accounts ?? []}
          />
        </div>
      </main>
    </div>
  )
}
