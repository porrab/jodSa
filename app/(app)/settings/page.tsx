import { getTranslations } from 'next-intl/server'
import { getUser } from '@/lib/supabase/server'
import SettingsClient from './settings-client'

export default async function SettingsPage() {
  const t = await getTranslations('settings')
  const user = await getUser()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <SettingsClient email={user?.email ?? ''} />
    </div>
  )
}
