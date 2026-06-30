'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ArrowLeftRight,
  CreditCard,
  Upload,
  LogOut,
  PiggyBank,
  Plus,
  Repeat,
  Users,
  HandCoins,
  MoreHorizontal,
  Settings,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { openQuickAdd } from '@/lib/quick-add'

const navItems = [
  { href: '/dashboard', key: 'dashboard', icon: LayoutDashboard },
  { href: '/transactions', key: 'transactions', icon: ArrowLeftRight },
  { href: '/import', key: 'import', icon: Upload },
  { href: '/budgets', key: 'budgets', icon: PiggyBank },
  { href: '/recurring', key: 'recurring', icon: Repeat },
  { href: '/groups', key: 'groups', icon: Users },
  { href: '/sessions', key: 'sessions', icon: HandCoins },
  { href: '/accounts', key: 'accounts', icon: CreditCard },
  { href: '/settings', key: 'settings', icon: Settings },
] as const

// Mobile bar — 4 daily destinations flanking the center (＋); management screens live under /more.
const mobileLeft = [
  { href: '/dashboard',    key: 'dashboard',    icon: LayoutDashboard },
  { href: '/transactions', key: 'transactions', icon: ArrowLeftRight },
] as const
const mobileRight = [
  { href: '/budgets', key: 'budgets', icon: PiggyBank },
  { href: '/more',    key: 'more',    icon: MoreHorizontal },
] as const

export default function AppNav() {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navItemCls = (active: boolean) =>
    cn(
      'flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors',
      active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
    )

  return (
    <>
      {/* Mobile bottom nav: 4 daily dests + center (＋) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-background/85 shadow-[0_-8px_28px_-14px_rgb(16_60_48_/_0.28)] backdrop-blur-lg md:hidden">
        {mobileLeft.map(({ href, key, icon: Icon }) => (
          <Link key={href} href={href} className={navItemCls(pathname === href)}>
            <Icon className="size-5" />
            <span>{t(key)}</span>
          </Link>
        ))}

        {/* Center Add/Scan FAB — opens the in-place quick-add sheet (no route change). */}
        <button
          type="button"
          onClick={() => openQuickAdd()}
          aria-label={t('add')}
          className="flex flex-1 items-center justify-center"
        >
          <span className="press -mt-6 inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-float ring-4 ring-background transition-colors hover:bg-primary/90 active:bg-primary/85">
            <Plus className="size-6" />
          </span>
        </button>

        {mobileRight.map(({ href, key, icon: Icon }) => (
          <Link key={href} href={href} className={navItemCls(pathname === href)}>
            <Icon className="size-5" />
            <span>{t(key)}</span>
          </Link>
        ))}
      </nav>

      {/* Desktop sidebar — full set */}
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-background p-4 md:flex">
        <div className="mb-6 px-2">
          <span className="text-lg font-bold">JodSa</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map(({ href, key, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                pathname === href
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="size-4" />
              {t(key)}
            </Link>
          ))}
        </nav>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="w-full justify-start gap-3 text-muted-foreground">
          <LogOut className="size-4" />
          {t('logout')}
        </Button>
      </aside>
    </>
  )
}
