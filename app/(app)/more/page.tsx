import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { CreditCard, HandCoins, Repeat, Settings, Upload, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

const items = [
  { href: '/import',    key: 'import',    icon: Upload },
  { href: '/accounts',  key: 'accounts',  icon: CreditCard },
  { href: '/recurring', key: 'recurring', icon: Repeat },
  { href: '/groups',    key: 'groups',    icon: Users },
  { href: '/sessions',  key: 'sessions',  icon: HandCoins },
  { href: '/settings',  key: 'settings',  icon: Settings },
] as const

export default async function MorePage() {
  const t = await getTranslations('nav')

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('more')}</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map(({ href, key, icon: Icon }) => (
          <Link key={href} href={href}>
            <Card className="transition-colors hover:bg-accent">
              <CardContent className="flex flex-col items-center gap-2 py-6">
                <Icon className="size-6 text-muted-foreground" />
                <span className="text-sm font-medium">{t(key)}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
