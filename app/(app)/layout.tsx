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
        {/* pb-24 on mobile clears the fixed bottom nav so a page's last element stays tappable */}
        <div className="container mx-auto max-w-4xl p-4 pb-24 md:p-6 md:pb-6">{children}</div>
      </main>
    </div>
  )
}
