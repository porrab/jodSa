import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { CreditCard, HandCoins, Repeat, Settings, TrendingUp, Upload } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

// "Groups" (M3) left the nav in the design v3 reset (J5) — one concept
// "ทริป" now, existing grouped data reachable via the /transactions filter.
// SPEC-4 (M1): /invest is a new module surface — enters via /more + the desktop
// sidebar per the Fable build-readiness review, not the fixed 4-dest+FAB bottom bar.
const items = [
  { href: '/import',    key: 'import',    icon: Upload },
  { href: '/accounts',  key: 'accounts',  icon: CreditCard },
  { href: '/invest',    key: 'invest',    icon: TrendingUp },
  { href: '/recurring', key: 'recurring', icon: Repeat },
  { href: '/sessions',  key: 'sessions',  icon: HandCoins },
  { href: '/settings',  key: 'settings',  icon: Settings },
] as const

export default async function MorePage() {
  const t = await getTranslations('nav')

  return (
    <div className="space-y-4">
      <h1 className="text-[28px] font-bold leading-[1.7]">{t('more')}</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map(({ href, key, icon: Icon }) => (
          <Link key={href} href={href}>
            <Card className="border-transparent bg-card transition-colors hover:bg-secondary">
              <CardContent className="flex flex-col items-center gap-2 py-6">
                <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-honey-text"><Icon className="size-6" /></span>
                <span className="text-base font-medium">{t(key)}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
