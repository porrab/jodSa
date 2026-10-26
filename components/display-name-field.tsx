'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function DisplayNameField({
  id,
  payee,
  value,
  onChange,
}: {
  id: string
  payee: string
  value: string
  onChange: (value: string) => void
}) {
  const t = useTranslations('transaction')
  const [open, setOpen] = useState(Boolean(value))
  const fallback = payee.trim()

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 justify-start px-0 text-sm text-primary hover:bg-transparent"
        onClick={() => setOpen(true)}
      >
        {t('addDisplayName')}
      </Button>
    )
  }

  return (
    <div className="space-y-1.5" data-testid="display-name-field">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{t('displayNameOptional')}</Label>
        <button
          type="button"
          className="min-h-11 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => {
            onChange('')
            setOpen(false)
          }}
        >
          {t('removeDisplayName')}
        </button>
      </div>
      <Input
        id={id}
        name="note"
        value={value}
        aria-invalid={value.length > 120}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="flex items-start justify-between gap-3 text-sm text-muted-foreground">
        <p className="min-w-0 flex-1 truncate">{fallback ? t('displayNameFallback', { payee: fallback }) : t('displayNameTransferFallback')}</p>
        {value.length > 100 && <span className="shrink-0 tabular-nums">{value.length}/120</span>}
      </div>
    </div>
  )
}
