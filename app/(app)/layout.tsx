import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import AppNav from '@/components/app-nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (!user) redirect('/login')

  return (
    <div className="flex min-h-svh">
      <AppNav />
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto max-w-4xl p-4 md:p-6">{children}</div>
      </main>
    </div>
  )
}
