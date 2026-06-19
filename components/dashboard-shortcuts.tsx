import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { CreditCard, HandCoins, PiggyBank, Repeat, Upload, Users } from 'lucide-react'

// Mobile-only quick access. The phone bottom nav only carries 4 daily
// destinations + the ＋ FAB; these tiles put the rest one tap from home instead
// of two (home → More → feature). Desktop keeps the full sidebar, so this is
// wrapped in `md:hidden` by the caller.
const items = [
  { href: '/import',    key: 'import',    icon: Upload },
  { href: '/groups',    key: 'groups',    icon: Users },
  { href: '/sessions',  key: 'sessions',  icon: HandCoins },
  { href: '/recurring', key: 'recurring', icon: Repeat },
  { href: '/accounts',  key: 'accounts',  icon: CreditCard },
  { href: '/budgets',   key: 'budgets',   icon: PiggyBank },
] as const

export default async function DashboardShortcuts() {
  const t = await getTranslations('nav')

  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map(({ href, key, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex flex-col items-center gap-1.5 rounded-lg border bg-card p-3 text-center transition-colors hover:bg-accent"
        >
          <Icon className="size-5 text-muted-foreground" />
          <span className="text-xs font-medium leading-tight">{t(key)}</span>
        </Link>
      ))}
    </div>
  )
}
