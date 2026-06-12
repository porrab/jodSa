'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { setLocale, deleteOwnAccount } from '@/app/actions/preferences'
import { createClient } from '@/lib/supabase/client'

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

  return (
    <div className="space-y-4 max-w-xl">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('preferences')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Label>{t('language')}</Label>
            <Select value={locale} onValueChange={handleLocaleChange} disabled={isPending}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="th">ไทย</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label>{t('theme')}</Label>
            <Select value={theme ?? 'system'} onValueChange={setTheme}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">{t('themeLight')}</SelectItem>
                <SelectItem value="dark">{t('themeDark')}</SelectItem>
                <SelectItem value="system">{t('themeSystem')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('account')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{email}</p>
          <div className="rounded-lg border border-destructive/40 p-4 space-y-2">
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
        </CardContent>
      </Card>
    </div>
  )
}
