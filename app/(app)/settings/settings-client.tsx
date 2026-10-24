'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Chip } from '@/components/ui/chip'
import { setLocale, deleteOwnAccount } from '@/app/actions/preferences'
import { createClient } from '@/lib/supabase/client'
import { LogOut } from 'lucide-react'

export default function SettingsClient({ email }: { email: string }) {
  const t = useTranslations('settings')
  const locale = useLocale()
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [deleting, setDeleting] = useState(false)

  function handleLocaleChange(next: string) {
    startTransition(async () => {
      await setLocale(next)
      router.refresh()
    })
  }

  async function handleDeleteAccount() {
    if (!confirm(t('deleteConfirm1'))) return
    if (!confirm(t('deleteConfirm2'))) return
    setDeleting(true)
    const result = await deleteOwnAccount()
    if (result.error) {
      toast.error(result.error)
      setDeleting(false)
      return
    }
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="max-w-xl divide-y divide-border border-y border-border">
          <div className="flex min-h-16 items-center justify-between gap-4 py-3">
            <Label>{t('language')}</Label>
            <div className="flex flex-wrap justify-end gap-2">
              <Chip pressed={locale === 'th'} onClick={() => handleLocaleChange('th')} disabled={isPending}>ไทย</Chip>
              <Chip pressed={locale === 'en'} onClick={() => handleLocaleChange('en')} disabled={isPending}>English</Chip>
            </div>
          </div>
          <div className="flex min-h-16 items-center justify-between gap-4 py-3">
            <Label>{t('theme')}</Label>
            <div className="flex flex-wrap justify-end gap-2">
              {(['light', 'dark', 'system'] as const).map((value) => (
                <Chip key={value} pressed={(theme ?? 'system') === value} onClick={() => setTheme(value)}>{t(`theme${value[0].toUpperCase()}${value.slice(1)}`)}</Chip>
              ))}
            </div>
          </div>
          <div className="space-y-2 py-4">
            <p className="text-sm text-muted-foreground">{email}</p>
            <div className="space-y-2 bg-blush p-4">
            <p className="text-sm font-medium text-destructive">{t('dangerZone')}</p>
            <p className="text-sm text-muted-foreground">{t('deleteAccountDesc')}</p>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteAccount}
              disabled={deleting}
            >
              {deleting ? t('deleting') : t('deleteAccount')}
            </Button>
            </div>
          </div>
          <button type="button" onClick={handleLogout} className="flex min-h-14 w-full items-center gap-3 py-3 text-left font-medium md:hidden">
            <LogOut className="size-4" />{t('logout')}
          </button>
    </div>
  )
}
